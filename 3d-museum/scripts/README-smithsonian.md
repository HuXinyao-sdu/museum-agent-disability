# Smithsonian 官方 API 文物抓取工具

`fetch_smithsonian.py` —— 合规对接 Smithsonian 3D 官方公开接口，下载文物 glb 三维模型并生成配置。

## 合规说明

- **只走官方开放接口**：`https://3d-api.si.edu/api/v1.0/content/file/search`，不做任何网页爬虫、不绕验证码、不伪装浏览器。
- **礼貌访问**：每次请求间隔 1.2s，失败自动退避重试，不并发压测。
- **授权**：下载内容来自 Smithsonian Open Access 计划（CC0 公有领域），可自由用于教学/研究/展示。

## 环境要求

- Python 3（仅用标准库，无需 `pip install`）。

## 运行方法

在项目根目录 `3d-museum/` 下执行：

```bash
# 1) 只看有哪些文物可下（不下载）
python scripts/fetch_smithsonian.py "apollo" --list-only

# 2) 下载第一个匹配结果
python scripts/fetch_smithsonian.py "mammoth"

# 3) 下载多个匹配里的第 2 个（--pick 从 0 开始）
python scripts/fetch_smithsonian.py "dragon" --pick 1

# 4) 自定义输出目录 / 配置文件名
python scripts/fetch_smithsonian.py "nefertiti" --out-dir public/echo/assets/models --config my_artifact.json
```

## 产出

1. **模型**：下载到 `public/echo/assets/models/{slug}.glb`（默认目录，Draco 压缩，项目已有 DRACOLoader 可直接加载）。
2. **配置**：`artifact_config.json`，字段与 `src/worldArtifacts.ts` 的 `WorldArtifact` 一致，额外附带：
   - `narration`：标准版讲解词（模板生成）
   - `kidsText`：儿童科普文案（模板生成）
   - `source`：官方 model_url 与标题，便于溯源
3. **控制台**：额外打印一段可直接粘贴进 `src/worldArtifacts.ts` 的条目。

## 接入三维馆

把打印出的条目粘贴进 `src/worldArtifacts.ts` 的 `worldArtifacts` 数组末尾即可。默认 `group: "heritage"` 会摆进「世界文明馆」；如需放入中国馆，改 `group: "china"` 并补 `category`（如「瓷器」「青铜器」）。

## 已知限制（重要）

- 官方公开接口是 **alpha** 版，且**只有一个检索端点**，不提供：文物描述原文、预览图、多角度三视图。
- 因此：
  - `description` / `highlight` / 讲解词 / 儿童文案 均为**模板生成**，建议人工润色。
  - `name` 为官方**英文标题**，需手动翻译成中文名。
  - `origin` / `period` / `category` 需按实际文物补充。
- 接口默认只返回前 10 个文件（覆盖单件文物的 Thumb/Low/Medium/High/AR 各档），足够本工具使用；若某次检索未命中，换一个更精确的搜索词重试。

## 示例：搜索词对照

| 想找的文物 | 建议搜索词 |
|-----------|-----------|
| 阿波罗 11 号舱门 | `apollo` |
| 猛犸象骨架 | `mammoth` |
| 1903 莱特飞行器 | `wright` |
| 航天飞机发现号 | `discovery` |
| 楔形文字泥板 | `cuneiform` |
