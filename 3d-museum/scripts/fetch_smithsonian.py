#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_smithsonian.py —— 合规对接 Smithsonian 3D 官方公开 API 的文物抓取工具
=============================================================================
仅使用官方开放接口（https://3d-api.si.edu/api/v1.0），不进行任何网页爬虫。

官方接口只有一个公开端点：
    GET /content/file/search?q={搜索词}
它返回匹配文物的各类文件（glb 各质量档 / usdz / obj）的下载地址与标题。
注意：该接口「不」返回描述文本、预览图或三视图；因此本工具：
    · 下载最优质量的 glb 三维模型
    · 基于官方标题 + 模板，生成标准版讲解词、儿童科普文案
    · 生成 3d-museum 项目 worldArtifacts.ts 兼容的配置 JSON

依赖：仅 Python 3 标准库（urllib / json / argparse），无需 pip install。

用法示例：
    python scripts/fetch_smithsonian.py "apollo"
    python scripts/fetch_smithsonian.py "mammoth" --pick 1
    python scripts/fetch_smithsonian.py "nefertiti" --list-only
    python scripts/fetch_smithsonian.py "dragon" --out-dir public/echo/assets/models

授权：下载内容来自 Smithsonian Open Access（CC0 公有领域）。
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

# 修复 Windows 控制台中文乱码：尽量按 UTF-8 输出
# （若在旧版 cmd 中仍乱码，请在运行前执行 `chcp 65001`，或使用 Windows Terminal / VS Code 终端）
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------------------------- 配置 ----------------------------
API_BASE = "https://3d-api.si.edu/api/v1.0"
SEARCH_PATH = "/content/file/search"
USER_AGENT = "SmithsonianArtifactFetcher/1.0 (educational, non-commercial demo)"
REQUEST_DELAY = 1.2          # 每次请求之间的礼貌间隔（秒）
RETRY_TIMES = 3              # 失败重试次数
DEFAULT_OUT_DIR = os.path.join("public", "echo", "assets", "models")
MUSEUM_NAME = "史密森尼博物院（Smithsonian Institution）"


# ---------------------------- 网络层 ----------------------------
def api_get(url):
    """发起 GET 并解析 JSON；带重试与退避，遵守礼貌访问。"""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    last_err = None
    for attempt in range(1, RETRY_TIMES + 1):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8", "ignore"))
        except Exception as exc:  # 网络异常或返回非 JSON（可能被限流）
            last_err = exc
            wait = REQUEST_DELAY * attempt
            print(f"  请求失败（第 {attempt}/{RETRY_TIMES} 次）：{exc}，{wait:.1f}s 后重试…", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"多次请求仍失败：{url}\n{last_err}")


def download_file(url, dest):
    """流式下载二进制文件到 dest，返回文件字节数。"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as fh:
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            fh.write(chunk)
    return os.path.getsize(dest)


# ---------------------------- 检索与分组 ----------------------------
def search(term):
    """调用官方 file/search 接口，返回 rows（可能为空列表）。"""
    qs = urllib.parse.urlencode({"q": term})
    data = api_get(f"{API_BASE}{SEARCH_PATH}?{qs}")
    rows = data.get("rows", [])
    if not rows:
        msg = data.get("message", "")
        print(f"未找到与「{term}」匹配的文物。{('官方返回：' + msg) if msg else ''}", file=sys.stderr)
    return rows


def group_by_model(rows):
    """把文件行按 model_url（3d_package:{uuid}）分组，每组代表一件文物。"""
    groups = {}
    for row in rows:
        content = row.get("content") or {}
        murl = content.get("model_url")
        if not murl:
            continue
        group = groups.setdefault(murl, {"model_url": murl, "title": row.get("title", murl), "files": []})
        group["files"].append(content)
    return list(groups.values())


def select_glb(files):
    """从一件文物的文件列表里挑出最优 Web3D glb：High > Medium > Low > Thumb。"""
    glbs = [f for f in files if f.get("file_type") == "glb"]
    web3d = [f for f in glbs if f.get("usage") == "Web3D"] or glbs
    quality_order = {"High": 0, "Medium": 1, "Low": 2, "Thumb": 3}
    web3d.sort(key=lambda f: quality_order.get(f.get("quality"), 99))
    return web3d[0] if web3d else None


# ---------------------------- 文本模板 ----------------------------
def slugify(text):
    """把标题转成安全的文件名/ID 片段。"""
    slug = re.sub(r"[^0-9a-zA-Z]+", "-", text.lower()).strip("-")
    return slug or "artifact"


def build_description(title):
    return (
        f"「{title}」现藏于{MUSEUM_NAME}，是史密森尼 3D 数字化项目（3d.si.edu）"
        f"通过三维扫描技术向公众开放共享的文物。该模型由史密森尼 Open Access 计划"
        f"以 CC0 公有领域授权发布，可自由用于教学、研究与展示。"
        f"（本段为工具根据官方标题自动生成的占位介绍，建议替换为更详细的文物背景说明。）"
    )


def build_highlight():
    return "史密森尼官方三维扫描，可拖拽旋转、缩放，近距离观察文物细节。"


def build_narration(title):
    return (
        "各位观众朋友，大家好！欢迎来到 3D 世界文物馆。\n\n"
        f"您现在看到的这件展品，是来自{MUSEUM_NAME}的「{title}」。"
        "它由史密森尼 3D 数字化团队进行高精度三维扫描，将文物的每一处细节都原样呈现在您眼前。\n\n"
        "您可以用鼠标拖拽旋转模型、滚动滚轮拉近拉远，从任意角度观察它的造型与纹理。"
        "这件文物已通过史密森尼 Open Access 计划以 CC0 公有领域开放，"
        "让全世界的观众都能跨越山海，近距离感受它的魅力。\n\n"
        "（本讲解词由工具基于官方标题自动生成，正式展出前建议补充文物背景、年代与工艺等专业内容。）"
    )


def build_kids(title):
    return (
        "小朋友们，快来看呀！\n\n"
        f"这件文物叫「{title}」，它可是从大洋彼岸的{MUSEUM_NAME}“飞”过来的哦！"
        "博物馆的叔叔阿姨用一台神奇的 3D 扫描仪，把它的样子一点一点“拍”了下来，"
        "这样我们在电脑里就能像拿在手里一样，把它转来转去、放大缩小，"
        "连最细小的纹路都能看得清清楚楚。\n\n"
        "你试试用鼠标转一转它，看看它的背面、底部都藏着什么小秘密？"
        "（这段小讲解是工具自动生成的，正式展出时可以再讲讲它的故事哦。）"
    )


def build_metadata(title, model_url, model_path):
    """生成 worldArtifacts.ts 兼容字段 + 扩展字段（讲解词/儿童文案/来源）。"""
    slug = slugify(title)
    return {
        # ---- WorldArtifact 字段 ----
        "id": slug,
        "name": title,                    # 官方标题（英文），建议人工翻译为中文名
        "nameEn": title,
        "museum": MUSEUM_NAME,
        "origin": "",                     # 待人工补充
        "period": "",                     # 待人工补充
        "category": "三维扫描文物",        # 可改为 青铜器 / 瓷器 等
        "group": "heritage",              # heritage→世界文明馆；可改 china / natural / demo
        "description": build_description(title),
        "highlight": build_highlight(),
        "model": model_path,
        "modelCredit": "三维扫描来自史密森尼 Open Access (3d.si.edu) · CC0",
        # ---- 扩展字段（不在 WorldArtifact 类型内）----
        "narration": build_narration(title),
        "kidsText": build_kids(title),
        "source": {"model_url": model_url, "title": title},
    }


# ---------------------------- 主流程 ----------------------------
def main(argv=None):
    parser = argparse.ArgumentParser(
        description="合规对接 Smithsonian 3D 官方公开 API，下载文物 glb 模型并生成配置",
    )
    parser.add_argument("query", nargs="?", help="文物搜索词，例如 apollo / mammoth / dragon")
    parser.add_argument("--pick", type=int, default=0, help="多个匹配时选择第几个（从 0 开始）")
    parser.add_argument("--list-only", action="store_true", help="只列出匹配结果，不下载")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help=f"模型保存目录（默认 {DEFAULT_OUT_DIR}）")
    parser.add_argument("--config", default="artifact_config.json", help="配置 JSON 输出路径")
    args = parser.parse_args(argv)

    if not args.query:
        parser.error("请提供搜索词，例如：python scripts/fetch_smithsonian.py \"apollo\"")

    # 1) 检索并分组
    rows = search(args.query)
    groups = group_by_model(rows)
    if not groups:
        return 1

    # 2) 列出匹配到的文物
    print(f"\n找到 {len(groups)} 件文物：")
    for i, group in enumerate(groups):
        best = select_glb(group["files"])
        quality = (best or {}).get("quality", "无 glb")
        print(f"  [{i}] {group['title']}   最优 glb 质量：{quality}")
        print(f"       {group['model_url']}")

    if args.list_only:
        return 0

    if args.pick < 0 or args.pick >= len(groups):
        print(f"--pick {args.pick} 超出范围（共 {len(groups)} 件），请重新指定。", file=sys.stderr)
        return 1

    chosen = groups[args.pick]
    glb = select_glb(chosen["files"])
    if not glb:
        print(f"「{chosen['title']}」没有可下载的 glb 模型。", file=sys.stderr)
        return 1

    title = chosen["title"]
    slug = slugify(title)
    model_file = os.path.join(args.out_dir, f"{slug}.glb")
    model_path = "/echo/assets/models/" + f"{slug}.glb"

    # 3) 下载模型
    print(f"\n正在下载「{title}」的 {glb.get('quality')} 质量 glb …")
    time.sleep(REQUEST_DELAY)            # 礼貌间隔
    try:
        size = download_file(glb["uri"], model_file)
    except Exception as exc:
        print(f"下载失败：{exc}", file=sys.stderr)
        return 1
    print(f"  已保存：{model_file}（{size / 1024 / 1024:.1f} MB）")

    # 4) 生成配置 JSON
    meta = build_metadata(title, chosen["model_url"], model_path)
    with open(args.config, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    print(f"已生成配置：{args.config}")

    # 5) 打印可直接粘贴进 worldArtifacts.ts 的条目
    world_keys = [
        "id", "name", "nameEn", "museum", "origin", "period",
        "category", "group", "description", "highlight", "model", "modelCredit",
    ]
    entry = {k: meta[k] for k in world_keys}
    print("\n—— 可直接粘贴进 src/worldArtifacts.ts 的条目 ——\n")
    print(json.dumps(entry, ensure_ascii=False, indent=2))

    print("\n提示：")
    print("  · name 目前是官方英文标题，请手动翻译成中文；")
    print("  · origin / period / category / group 也请按实际文物补充或调整；")
    print("  · 讲解词与儿童文案已写入配置 JSON 的 narration / kidsText 字段。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
