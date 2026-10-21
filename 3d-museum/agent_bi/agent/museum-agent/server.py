# -*- coding: utf-8 -*-
"""
泉城数字博物馆 · 智能问答 Agent 服务器
零第三方依赖，仅使用 Python 标准库。

启动方式:  python server.py   （默认端口 8300，可用 python server.py 8080 修改）
浏览器访问: http://localhost:8300
"""
import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

BASE = os.path.dirname(os.path.abspath(__file__))
KB_FILE = os.path.join(BASE, "data", "knowledge.json")
CONFIG_FILE = os.path.join(BASE, "data", "config.json")
STATIC_DIR = os.path.join(BASE, "static")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8300
LOCK = threading.Lock()

DEFAULT_CONFIG = {
    "api_key": "",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen-plus",
    "mode": "llm",          # llm=大模型RAG（有Key时） / local=本地检索
    "temperature": 0.3,
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass
    return cfg


def save_config(cfg):
    with LOCK:
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        tmp = CONFIG_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CONFIG_FILE)

# ---------------- 知识库存取 ----------------

DEFAULT_KB = [
    {
        "id": "kb-demo-intro",
        "title": "博物馆简介",
        "category": "博物馆信息",
        "keywords": ["简介", "博物馆介绍", "是什么博物馆", "概况", "泉城数字博物馆"],
        "content": "泉城数字博物馆是一座以数字化展陈为特色的综合性博物馆，常设「文明溯源」「城市记忆」「匠心工艺」三大展厅，收藏并展示从新石器时代到近现代的各类文物。本条目为示例数据，您可以在「知识库管理」中修改或删除它，写入您所在博物馆的真实介绍。"
    },
    {
        "id": "kb-demo-hours",
        "title": "开放时间",
        "category": "博物馆信息",
        "keywords": ["开放时间", "几点开门", "几点闭馆", "营业时间", "闭馆时间", "周一"],
        "content": "开放时间：周二至周日 9:00—17:00（16:30 停止入馆），每周一闭馆维护（法定节假日除外）。节假日开放安排请以官方公告为准。"
    },
    {
        "id": "kb-demo-ticket",
        "title": "门票与预约",
        "category": "博物馆信息",
        "keywords": ["门票", "票价", "多少钱", "免费吗", "预约", "怎么买票", "购票"],
        "content": "本馆免费向社会公众开放，实行线上实名预约制。您可关注本馆官方微信公众号或官网，提前 1—7 天预约参观。每单最多预约 5 人，16 岁以下未成年人须由成年人陪同入馆。"
    },
    {
        "id": "kb-demo-location",
        "title": "地址与交通",
        "category": "博物馆信息",
        "keywords": ["地址", "在哪", "怎么走", "交通", "乘车", "地铁", "停车", "位置"],
        "content": "本馆位于济南市历下区经十路 11899 号。可乘地铁 3 号线至「博物馆站」B 口出站步行约 300 米；或乘公交 K115、K139、BRT-5 至「省博物馆站」。馆内地下停车场对外开放，车位约 400 个。"
    },
    {
        "id": "kb-demo-rules",
        "title": "参观须知",
        "category": "博物馆信息",
        "keywords": ["参观须知", "注意事项", "能拍照吗", "禁止什么", "能带宠物吗", "触摸文物"],
        "content": "参观须知：1）请勿触摸展品与展柜；2）展厅内可拍照（禁用闪光灯、自拍杆与三脚架），特殊临展以现场标识为准；3）请勿携带宠物、危险品及饮料食品入馆；4）请保持安静，勿在展厅内奔跑喧哗；5）学龄前儿童须由成人全程看护。"
    },
    {
        "id": "kb-demo-service",
        "title": "便民服务",
        "category": "博物馆信息",
        "keywords": ["便民服务", "寄存", "轮椅", "婴儿车", "充电", "母婴室", "无障碍", "lost", "失物"],
        "content": "本馆提供以下免费便民服务：展厅入口处自助寄存柜、轮椅与婴儿车免费借用（需在一层服务台登记押金）、母婴室（一层东侧）、免费直饮水、共享充电宝租借、医疗急救箱。如有失物查询或其他需求，请联系服务台电话 0531-8888-0000。"
    },
    {
        "id": "kb-demo-guide",
        "title": "讲解与语音导览",
        "category": "博物馆信息",
        "keywords": ["讲解", "导览", "语音导览", "人工讲解", "讲解员", "app"],
        "content": "本馆提供两种讲解方式：1）人工讲解——每日 10:00、14:30 两场免费定时讲解，从一层大厅出发，团队讲解可提前一天电话预约；2）语音导览——微信扫码或租用导览机，覆盖全部常设展厅重点展品。"
    },
    {
        "id": "kb-demo-donate",
        "title": "文物征集与捐赠",
        "category": "博物馆信息",
        "keywords": ["捐赠", "征集", "文物捐赠", "鉴定", "捐献"],
        "content": "本馆长期面向社会征集各类文物与史料。如有捐赠意向，请携带藏品照片及相关信息至藏品管理部（三层东侧），或拨打征集专线 0531-8888-0001。本馆将组织专家鉴定，对入选藏品颁发收藏证书并在展出时署捐赠者姓名。"
    }
]


def load_kb():
    if not os.path.exists(KB_FILE):
        os.makedirs(os.path.dirname(KB_FILE), exist_ok=True)
        with open(KB_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_KB, f, ensure_ascii=False, indent=2)
    try:
        with open(KB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def save_kb(kb):
    with LOCK:
        os.makedirs(os.path.dirname(KB_FILE), exist_ok=True)
        tmp = KB_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(kb, f, ensure_ascii=False, indent=2)
        os.replace(tmp, KB_FILE)


# ---------------- 大模型调用（OpenAI 兼容协议，标准库实现） ----------------

SYSTEM_PROMPT = (
    "你是「泉城数字博物馆」的智能讲解员，热情、专业、口语化。"
    "回答规则：1）仅依据下方提供的知识库资料回答游客问题，可以综合多条资料、"
    "用自己的话自然组织语言，但不得编造资料中没有的事实；"
    "2）若资料与问题无关或不足以回答，请礼貌说明知识库暂未收录，"
    "并建议游客前往「知识库管理」补充相关资料，不要自行脑补；"
    "3）回答简洁准确，一般不超过 200 字；4）涉及文物讲解时可适当生动，但不添加资料外的细节。"
    "5）严格使用纯文本：不要使用任何 Markdown 标记（特别是 **粗体**、# 标题、列表符号 - 或 1. 等），"
    "直接以正常中文句子表达；如需强调可用语气词或换行，不用任何包裹符号。"
)


def character_system_prompt(role, style="classic"):
    """根据历史人物条目生成角色扮演系统提示词
    style: classic=文言古风（默认）, kids=儿童白话
    """
    name = role.get("title", "历史人物")
    era = role.get("era", "古代")
    identity = role.get("identity", "")
    persona = role.get("persona", "性格鲜明，言辞生动")
    quotes = "；".join(role.get("quotes", []) or [])
    quotes_text = quotes or "（无特定名言）"
    experience = role.get("content", "")

    base = (
        f"你是{name}，生活在{era}，身份是{identity}。"
        f"你的性格与语气：{persona}。"
        f"你的生平与经历：{experience}。"
        f"你可以自然引用或化用这些语句：{quotes_text}。"
    )

    if style == "kids":
        return (
            base +
            "现在，你要像一位亲切的古人长辈，给一位小学生小朋友讲故事。"
            "回答规则：1）严格以第一人称口吻，用现代白话、生动的口语化表达；"
            "2）要把小朋友带进你的时代：描述你看到的街道、宫殿、战场、书房，描述你穿的衣服、吃的食物、用的器具，让小朋友仿佛身临其境；"
            "3）遇到生僻的历史名词（如官职、器物、制度）一定要用小朋友能听懂的话解释，比如把『朕』解释成『皇帝自称的我』，把『郡县制』解释成『把国家分成很多小块由中央派官员管理』；"
            "4）重点讲你的想法、你的选择和你的经历：你为什么要做这些事？当时你心里怎么想的？遇到什么困难？"
            "5）若小朋友问的是现代博物馆、开放时间、路线等你不可能知道的内容，请温和地说这些在你的时代还没有，建议他去问馆务讲解员；"
            "6）回答要有画面感、有情感，像讲故事一样，不超过 280 字；"
            "7）严格使用纯文本，不要任何 Markdown 标记。"
        )

    # classic / 默认：保留文言古风
    return (
        base +
        "请严格以第一人称口吻回答游客问题，结合你的亲身经历、时代背景和性格特点。"
        "回答规则：1）仅依据下方提供的知识库资料和你的人物资料回答，不要编造；"
        "2）若游客问的是现代博物馆、开放时间、路线等你不可能知道的内容，请礼貌地以第一人称表示「朕/吾/本宫/老夫」时代尚无此类事物，并建议游客询问馆务讲解员；"
        "3）涉及文物时，请从你的生活经验、时代视角出发讲解，让游客有时空穿梭之感；"
        "4）回答简洁生动，不超过 200 字；"
        "5）严格使用纯文本，不要任何 Markdown 标记。"
    )


def llm_complete(question, context_blocks, history, role=None, style="classic"):
    """调用 OpenAI 兼容 /chat/completions 接口，返回生成文本"""
    cfg = load_config()
    if not cfg.get("api_key"):
        raise RuntimeError("未配置 API Key")
    # 构造上下文：普通知识 + 历史人物资料
    blocks = list(context_blocks)
    if role:
        blocks.append({
            "title": f"历史人物：{role.get('title', '')}",
            "category": "历史人物",
            "content": (
                f"姓名：{role.get('title', '')}；时代：{role.get('era', '')}；"
                f"身份：{role.get('identity', '')}；性格：{role.get('persona', '')}；"
                f"经历：{role.get('content', '')}；"
                f"名言：{'；'.join(role.get('quotes', []) or [])}"
            ),
        })
    context = "\n\n".join(
        f"【{i + 1}】标题：{b['title']}（分类：{b['category']}）\n{b['content']}"
        for i, b in enumerate(blocks))
    system = character_system_prompt(role, style) if role else SYSTEM_PROMPT
    messages = [{"role": "system", "content": system}]
    for h in (history or [])[-6:]:  # 最近3轮对话，支持追问
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user",
                     "content": f"知识库资料：\n{context}\n\n游客问题：{question}"})
    payload = json.dumps({
        "model": cfg.get("model") or "qwen-plus",
        "messages": messages,
        "temperature": float(cfg.get("temperature") or 0.3),
    }).encode("utf-8")
    req = urllib.request.Request(
        (cfg.get("base_url") or "").rstrip("/") + "/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg["api_key"],
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip().replace("**", "")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode("utf-8")).get("message", "")
        except Exception:
            pass
        raise RuntimeError(f"大模型接口返回 {e.code}：{detail or e.reason}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"无法连接大模型服务：{e.reason}")
    except (KeyError, IndexError, json.JSONDecodeError):
        raise RuntimeError("大模型接口返回格式异常")


# ---------------- 问答引擎（检索式，兼作 RAG 的 Retriever） ----------------

def grams(text):
    """中文一元/二元字符组特征，用于无需分词库的相似度计算"""
    t = re.sub(r"[^\w\u4e00-\u9fff]+", "", (text or "").lower())
    g = set(t)
    for i in range(len(t) - 1):
        g.add(t[i:i + 2])
    return g


def match_entries(question, kb, top_n=3, filter_hall=None):
    qg = grams(question)
    if not qg:
        return []
    scored = []
    for e in kb:
        if filter_hall and (e.get("hall") or "").strip() != filter_hall.strip():
            continue
        tg = grams(e.get("title", ""))
        kg = grams(" ".join(e.get("keywords", []) or []))
        cg = grams(e.get("content", ""))
        hg = grams(e.get("hall", ""))
        s = 3.0 * len(qg & tg) + 2.5 * len(qg & kg) + 1.0 * len(qg & cg) + 2.0 * len(qg & hg)
        norm = s / len(qg)
        # 命中完整关键词短语：强加权（关键词是最可靠的召回信号）
        for kw in e.get("keywords", []) or []:
            if kw and kw in question:
                norm += 1.5
                break
        if e.get("title") and e["title"] in question:
            norm += 1.0
        scored.append((norm, e))
    scored.sort(key=lambda x: -x[0])
    return scored[:top_n]


FALLBACK = ("抱歉，知识库中暂时没有收录与您问题相关的内容。\n\n"
            "您可以：\n1）换一种问法再试试；\n"
            "2）点击页面顶部「知识库管理」，把相关资料添加进去，我马上就能回答啦！")


HALL_SUGGESTIONS = {
    "文物藏品": ["这件文物有什么看点？", "它的年代和历史价值是什么？", "我想看这件文物去哪个馆？"],
    "展厅场馆": ["这个馆有哪些文物？", "这个馆的历史背景是什么？", "参观这个馆需要多久？"],
    "馆务信息": ["博物馆有哪些展厅？", "开放时间是什么时候？", "如何预约门票？"],
    "其他": ["能否详细介绍一下？", "还有什么相关内容？", "博物馆有哪些展厅？"],
}


CHARACTER_SUGGESTIONS = [
    "你的一生经历了哪些大事？",
    "你如何看待自己身后的历史评价？",
    "馆中哪件文物最能代表你的时代？",
    "如果穿越到现在，你最想说什么？",
]


def generate_suggestions(question, top_entries, answer="", role=None):
    """根据命中文本生成 3 条可点击的推荐问题"""
    suggestions = []
    # 历史人物模式：围绕该人物生平、时代、关联文物
    if role:
        name = role.get("title", "您")
        related = (role.get("related_artifacts") or [])[:3]
        suggestions = ["你的一生经历了哪些大事？", f"你最想对现代人说的话是什么？", "你那个时代的生活是怎样的？"]
        if related:
            suggestions.insert(0, f"讲讲{related[0]}与你的关系")
        # 去重 + 截断
        seen = set(); out = []
        for s in suggestions:
            if s not in seen and s != question:
                seen.add(s); out.append(s)
            if len(out) >= 3:
                break
        return out
    # 普通模式：若命中了具体文物/场馆，围绕它展开
    for e in top_entries[:1]:
        cat = e.get("category", "其他")
        title = e.get("title", "")
        hall = e.get("hall", "")
        tmpl = HALL_SUGGESTIONS.get(cat, HALL_SUGGESTIONS["其他"])
        for t in tmpl:
            s = t.replace("这件文物", f"《{title}》" if title else "这件文物")
            s = s.replace("这个馆", hall if hall else "这个馆")
            suggestions.append(s)
    # 去重 + 截断
    seen = set()
    out = []
    for s in suggestions:
        if s not in seen and s != question:
            seen.add(s); out.append(s)
        if len(out) >= 3:
            break
    return out


def chat_answer(question, history=None, mode=None, current_hall=None, role=None, style="classic"):
    kb = load_kb()
    q = (question or "").strip()
    # 加载历史人物角色
    role_entry = None
    if role:
        role_entry = next((e for e in kb if e.get("category") == "历史人物" and
                          (e.get("id") == role or e.get("title") == role)), None)

    if not q:
        welcome = "您好，请问想了解什么呢？您可以问我开放时间、门票预约、馆藏文物等问题。"
        if role_entry:
            welcome = f"你好，吾乃{role_entry['title']}。来自{role_entry.get('era','古代')}。你有何事想问吾？"
        return {"answer": welcome,
                "mode": "local", "confidence": 1.0, "references": [],
                "suggested_questions": ["博物馆有哪些展厅？", "开放时间是？", "馆藏有哪些文物？"]}

    cfg = load_config()
    use_llm = (mode or cfg.get("mode") or "llm") == "llm" and bool(cfg.get("api_key"))

    # ---------------- 意图识别：场馆导览 ----------------

    # 1) 有哪些馆 / 展厅列表
    if any(k in q for k in ("有哪些馆", "有什么馆", "展厅有哪些", "有哪些展厅", "场馆有哪些", "参观哪些馆")):
        halls = sorted(set((e.get("hall") or "").strip() for e in kb if (e.get("hall") or "").strip()))
        if halls:
            lines = "\n".join(f"· {h}" for h in halls)
            hall_intro = [e for e in kb if e.get("category") == "展厅场馆"]
            tips = "\n\n" + "\n".join(f"{e['title']}：{e['content'][:80]}…" for e in hall_intro[:2]) if hall_intro else ""
            return {
                "answer": f"本馆设有以下展厅/场馆：\n{lines}{tips}\n\n您可以说「我想看青铜器去哪个馆」或「XX馆有什么文物」，我为您推荐参观路线。",
                "mode": "local", "matched": None, "confidence": 1.0,
                "references": [{"title": h, "score": 1.0} for h in halls[:5]],
                "suggested_questions": [f"{halls[0]}有什么文物？" if halls else "", "这些场馆的参观顺序是？", "哪个馆最值得看？"],
            }

    # 2) XX馆有什么文物
    hall_match = re.search(r"(.*?(?:馆|厅|展厅|场馆))(?:里|里面|内|有|都)?(?:有)?什么(?:文物|藏品|展品|东西)", q)
    if not hall_match:
        # 更宽松的匹配：问题包含「馆」+「文物/展品/藏品」
        if "馆" in q and any(k in q for k in ("文物", "藏品", "展品", "东西")):
            hall_match = re.search(r"(.*?(?:馆|厅|展厅|场馆))", q)
    if hall_match:
        hall_name = hall_match.group(1).strip()
        # 在知识库中找最匹配的场馆名
        candidates = sorted(set((e.get("hall") or "").strip() for e in kb if (e.get("hall") or "").strip()))
        matched_hall = None
        for c in candidates:
            if c in hall_name or hall_name in c:
                matched_hall = c
                break
        if not matched_hall and candidates:
            scored_halls = match_entries(hall_name, [{"title": c, "category": "展厅场馆", "keywords": [c], "content": c, "hall": c} for c in candidates], top_n=1)
            if scored_halls and scored_halls[0][0] >= 0.6:
                matched_hall = scored_halls[0][1]["hall"]
        if matched_hall:
            arts = [e for e in kb if e.get("category") == "文物藏品" and (e.get("hall") or "").strip() == matched_hall]
            hall_info = next((e for e in kb if e.get("category") == "展厅场馆" and matched_hall in (e.get("title", "") + e.get("hall", ""))), None)
            intro = f"\n\n{hall_info['content'][:120]}…" if hall_info else ""
            if arts:
                lines = "\n".join(f"· {e['title']}" for e in arts[:12])
                return {
                    "answer": f"「{matched_hall}」目前收录以下文物：\n{lines}{intro}\n\n您可以直接说出文物名称，我为您详细讲解。",
                    "mode": "local", "matched": {"title": matched_hall, "category": "展厅场馆"},
                    "confidence": 1.0,
                    "references": [{"title": e["title"], "score": 1.0} for e in arts[:5]],
                    "suggested_questions": [f"介绍一下{arts[0]['title']}", f"{matched_hall}的历史背景是什么？", "参观这个馆需要多久？"],
                }
            return {
                "answer": f"「{matched_hall}」的文物资料正在整理中，目前暂无具体展品。{intro}\n\n您可以先去其他展厅看看，或稍后在知识库中添加该馆的文物资料。",
                "mode": "local", "matched": {"title": matched_hall, "category": "展厅场馆"},
                "confidence": 1.0, "references": [],
                "suggested_questions": ["博物馆有哪些展厅？", "哪个馆文物最多？", "参观路线怎么安排？"],
            }

    # 3) 我想看 XX 去哪个馆（文物→场馆）
    goto_match = re.search(r"(?:想|要|应该|可以)?(?:看|参观|找|了解|讲)(.*?)(?:去|在|到)(?:哪个|什么|哪)(?:馆|厅|地方)", q)
    if goto_match:
        target = goto_match.group(1).strip()
        scored = match_entries(target, kb)
        artifact = next((e for s, e in scored if e.get("category") == "文物藏品" and s >= 0.6), None)
        if artifact:
            hall = artifact.get("hall", "")
            if hall:
                return {
                    "answer": f"《{artifact['title']}》位于「{hall}」。您可以按照展厅导览前往参观，那里还展出了多件同类主题的文物。",
                    "mode": "local", "matched": {"title": artifact["title"], "category": "文物藏品"},
                    "confidence": 1.0, "references": [{"title": hall, "score": 1.0}],
                    "suggested_questions": [f"{hall}还有什么文物？", f"介绍一下{artifact['title']}", "参观路线怎么安排？"],
                }
            return {
                "answer": f"《{artifact['title']}》目前尚未分配到具体展厅，建议您先参观其他常设展厅。",
                "mode": "local", "matched": {"title": artifact["title"], "category": "文物藏品"},
                "confidence": 0.8, "references": [],
                "suggested_questions": ["博物馆有哪些展厅？", "最值得看的文物是哪些？"],
            }

    # 意图：列出所有文物
    list_intent = (("有哪些" in q or "什么文物" in q or "什么藏品" in q or "展出什么" in q
                    or "都有什么" in q or "展品列表" in q)
                   and any(k in q for k in ("文物", "藏品", "展品", "展览")))
    if list_intent:
        arts = [e for e in kb if e.get("category") == "文物藏品"]
        if arts:
            lines = "\n".join(f"· {e['title']}" for e in arts)
            return {
                "answer": f"本馆目前共收录 {len(arts)} 件/组文物的讲解资料：\n{lines}\n\n您可以直接说出文物名称，我会为您详细讲解。",
                "matched": None,
                "confidence": 1.0,
                "references": [{"title": e["title"], "score": 1.0} for e in arts[:5]],
                "suggested_questions": [f"介绍一下{arts[0]['title']}", "博物馆有哪些展厅？", "最值得看的是哪几件？"],
            }
        return {
            "answer": ("知识库中还没有收录文物资料。请点击顶部「知识库管理」→「新增条目」，"
                       "分类选择「文物藏品」，填写名称、关键词和讲解词。添加完成后，您直接说出文物名称即可收听讲解。"),
            "matched": None,
            "confidence": 0.0,
            "references": [],
            "suggested_questions": ["博物馆有哪些展厅？", "开放时间是？", "如何预约门票？"],
        }

    scored = match_entries(q, kb, filter_hall=current_hall)
    # 若当前场馆过滤后没有命中，再放宽到全馆
    if not scored:
        scored = match_entries(q, kb)
    references = [{"title": e["title"], "score": round(s, 3), "category": e.get("category"),
                   "content": e.get("content", "")} for s, e in scored if s > 0]

    # ---- 大模型 RAG 模式 ----
    if use_llm:
        top = [e for s, e in scored if s >= 0.25][:3]
        if not top:
            return {
                "answer": ("知识库中暂无与您问题相关的资料，我无法凭空作答。\n\n"
                           "您可以换一种问法，或点击页面顶部「知识库管理」补充相关资料后再次提问。"),
                "mode": "llm", "matched": None, "confidence": 0.0, "references": [],
            }
        try:
            answer = llm_complete(q, top, history, role=role_entry, style=style)
            best_score = scored[0][0] if scored else 0
            return {
                "answer": answer,
                "mode": "llm",
                "matched": {"id": top[0].get("id"), "title": top[0].get("title"),
                            "category": top[0].get("category")},
                "confidence": round(min(1.0, best_score / 1.6), 2),
                "references": [{"title": r["title"], "score": r["score"]} for r in references[:3]],
                "suggested_questions": generate_suggestions(q, top, answer, role_entry),
            }
        except RuntimeError as e:
            # 大模型失败 → 自动回退本地检索，保证可用
            fallback_note = f"（大模型调用失败已回退本地模式：{e}）\n\n"
            local = _local_reply(scored, references)
            return {**local, "answer": fallback_note + local["answer"], "mode": "local-fallback"}

    # ---- 本地检索模式 ----
    return _local_reply(scored, references, role_entry)


def _local_reply(scored, references, role=None):
    if not scored or scored[0][0] < 0.6:
        return {
            "answer": FALLBACK,
            "mode": "local", "matched": None, "confidence": 0.0,
            "references": [{"title": r["title"], "score": r["score"]} for r in references],
            "suggested_questions": generate_suggestions("", [], "", role),
        }
    best_score, best = scored[0]
    confidence = min(1.0, best_score / 1.6)
    answer = best.get("content", "")
    related = [e["title"] for s, e in scored[1:] if s >= best_score * 0.45]
    if related:
        answer += "\n\n您可能还想了解：" + "、".join(related) + "。"
    return {
        "answer": answer,
        "mode": "local",
        "matched": {"id": best.get("id"), "title": best.get("title"), "category": best.get("category")},
        "confidence": round(confidence, 2),
        "references": [{"title": e["title"], "score": round(s, 3)} for s, e in scored],
        "suggested_questions": generate_suggestions(answer, [best] + [e for s, e in scored[1:2]], answer, role),
    }


# ---------------- 历史小剧场 ----------------

THEATER_TOPICS = [
    "权力的孤独",
    "理想与现实",
    "变革与阻力",
    "才情与命运",
    "如果相遇在长安",
    "对后人说的一句话",
]


def theater_system_prompt(char_a, char_b, topic, style="classic"):
    """为两位历史人物生成小剧场的系统提示词"""
    def char_desc(c):
        return (
            f"【{c.get('title', '历史人物')}】"
            f"时代：{c.get('era', '古代')}；"
            f"身份：{c.get('identity', '')}；"
            f"性格：{c.get('persona', '性格鲜明，言辞生动')}；"
            f"经历：{c.get('content', '')}；"
            f"名言：{'；'.join(c.get('quotes', []) or [])}"
        )

    lang_rule = (
        "语言要口语化、像讲故事一样生动，适合中小学生理解，避免难懂文言，遇到生僻词要解释。"
        if style == "kids" else
        "语言要符合各自的时代背景与人物性格，可适当文言化，有古风韵味。"
    )

    return (
        f"你是一位精通历史的编剧。请根据下方两位历史人物的资料，"
        f"围绕主题「{topic}」创作一场跨越时空的对话小剧场。\n\n"
        f"人物资料：\n{char_desc(char_a)}\n\n{char_desc(char_b)}\n\n"
        "创作要求：\n"
        "1）对话共 5—7 轮，两人交替发言，每轮一句或一段；\n"
        "2）严格使用第一人称，语言要符合人物的身份、性格与时代背景；\n"
        f"3）{lang_rule}\n"
        "4）通过对话自然展现两人的不同经历、人格魅力、朝廷谋略与时代课题；\n"
        "5）对话要有戏剧性，可包含感慨、反问、赞叹、争论，但不得编造严重违背史实的内容；\n"
        "6）开头用一句简短旁白交代场景；结尾用一句简短旁白收束；\n"
        "7）严格使用纯文本，不要任何 Markdown 标记；\n"
        "8）输出格式（必须每句独占一行）：\n"
        "旁白：……\n"
        f"{char_a.get('title', 'A')}：……\n"
        f"{char_b.get('title', 'B')}：……\n"
        "……\n"
        "旁白：……"
    )


def _llm_chat(messages, temperature=0.7):
    """底层 OpenAI 兼容接口调用，直接传入 messages"""
    cfg = load_config()
    if not cfg.get("api_key"):
        raise RuntimeError("未配置 API Key")
    payload = json.dumps({
        "model": cfg.get("model") or "qwen-plus",
        "messages": messages,
        "temperature": float(temperature),
    }).encode("utf-8")
    req = urllib.request.Request(
        (cfg.get("base_url") or "").rstrip("/") + "/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg["api_key"],
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip().replace("**", "")


def generate_theater(char_a_id, char_b_id, topic, style="classic"):
    """生成两位历史人物的对话小剧场"""
    kb = load_kb()
    chars = [e for e in kb if e.get("category") == "历史人物"]
    char_a = next((e for e in chars if e.get("id") == char_a_id or e.get("title") == char_a_id), None)
    char_b = next((e for e in chars if e.get("id") == char_b_id or e.get("title") == char_b_id), None)

    if not char_a or not char_b:
        missing = []
        if not char_a:
            missing.append(char_a_id)
        if not char_b:
            missing.append(char_b_id)
        raise RuntimeError(f"未找到历史人物：{'、'.join(missing)}")

    if char_a.get("id") == char_b.get("id"):
        raise RuntimeError("请选择两个不同的历史人物进行对话")

    if not topic:
        topic = "穿越时空的相遇"

    system = theater_system_prompt(char_a, char_b, topic, style)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"请围绕「{topic}」创作 {char_a['title']} 与 {char_b['title']} 的穿越对话小剧场。"}
    ]

    cfg = load_config()
    use_llm = bool(cfg.get("api_key")) and (cfg.get("mode") or "llm") == "llm"

    if use_llm:
        try:
            script = _llm_chat(messages, temperature=0.7)
        except RuntimeError as e:
            raise RuntimeError(f"小剧场生成失败：{e}")
    else:
        # 本地模式：返回一个基于资料的固定模板，保证无 Key 也能体验
        a, b = char_a, char_b
        script = (
            f"旁白：时空之门缓缓打开，{a['title']}与{b['title']}在博物馆的长廊中相遇了。\n\n"
            f"{a['title']}：吾乃{a['title']}，{a['era']}之人，{a['identity']}。\n\n"
            f"{b['title']}：久仰大名，我是{b['title']}，{b['era']}之人，{b['identity']}。\n\n"
            f"{a['title']}：{a['content'][:80]}…\n\n"
            f"{b['title']}：{b['content'][:80]}…\n\n"
            f"旁白：两人相视一笑，历史的河流在此刻交汇。"
        )

    def _profile(c):
        """返回人物完整档案：既给前端"时代背景"卡片用，
        也要原样传给工坊 as MuseumCharacterPayload（见桥接契约 §3.1）。"""
        return {
            "id": c.get("id"),
            "title": c.get("title"),
            "era": c.get("era", ""),
            "identity": c.get("identity", ""),
            "persona": c.get("persona", ""),
            "content": c.get("content", ""),
            "quotes": c.get("quotes") or [],
            "related_artifacts": c.get("related_artifacts") or [],
        }

    return {
        "character_a": _profile(char_a),
        "character_b": _profile(char_b),
        "topic": topic,
        "style": style,
        "script": script,
        "mode": "llm" if use_llm else "local",
    }


# ---------------- HTTP 服务 ----------------

class Handler(BaseHTTPRequestHandler):
    server_version = "MuseumAgent/1.0"

    def log_message(self, fmt, *args):
        pass  # 静默访问日志

    # ---- 响应工具 ----
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, ctype):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self.send_json({"error": "not found"}, 404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            self.send_file(os.path.join(STATIC_DIR, "index.html"), "text/html; charset=utf-8")
        elif path == "/api/knowledge":
            self.send_json(load_kb())
        elif path == "/api/config":
            cfg = load_config()
            key = cfg.get("api_key", "")
            self.send_json({
                "has_api_key": bool(key),
                "api_key_masked": (key[:4] + "****" + key[-4:]) if len(key) > 8 else ("****" if key else ""),
                "base_url": cfg.get("base_url", ""),
                "model": cfg.get("model", ""),
                "mode": cfg.get("mode", "llm"),
                "temperature": cfg.get("temperature", 0.3),
            })
        elif path == "/api/chat":
            q = unquote(urlparse(self.path).query).replace("q=", "", 1)
            self.send_json(chat_answer(q))
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        data = self.read_body()
        if data is None:
            self.send_json({"error": "请求体必须是合法 JSON"}, 400)
            return
        if path == "/api/chat":
            self.send_json(chat_answer(data.get("question", ""),
                                       history=data.get("history"),
                                       mode=data.get("mode"),
                                       current_hall=data.get("current_hall"),
                                       role=data.get("role"),
                                       style=data.get("style") or "classic"))
        elif path == "/api/knowledge":
            ok, msg, entry = validate_entry(data)
            if not ok:
                self.send_json({"error": msg}, 400)
                return
            kb = load_kb()
            entry["id"] = "kb-" + uuid.uuid4().hex[:8]
            kb.append(entry)
            save_kb(kb)
            self.send_json({"ok": True, "entry": entry}, 201)
        elif path == "/api/knowledge/import":
            items = data.get("items") if isinstance(data, dict) else data
            if not isinstance(items, list):
                self.send_json({"error": "导入数据必须是条目数组"}, 400)
                return
            kb = load_kb()
            existing = {e.get("title") for e in kb}
            added = 0
            for it in items:
                ok, msg, entry = validate_entry(it)
                if ok and entry["title"] not in existing:
                    entry["id"] = "kb-" + uuid.uuid4().hex[:8]
                    kb.append(entry)
                    existing.add(entry["title"])
                    added += 1
            save_kb(kb)
            self.send_json({"ok": True, "added": added})
        elif path == "/api/theater":
            try:
                res = generate_theater(
                    data.get("character_a", ""),
                    data.get("character_b", ""),
                    data.get("topic", ""),
                    style=data.get("style") or "classic"
                )
                self.send_json({"ok": True, **res})
            except RuntimeError as e:
                self.send_json({"error": str(e)}, 400)
        elif path == "/api/config":
            cfg = load_config()
            for k in ("base_url", "model", "mode", "temperature"):
                if k in data and data[k] is not None:
                    cfg[k] = data[k]
            # API Key：仅当显式传入非空值时更新（避免误清空）
            if isinstance(data.get("api_key"), str) and data["api_key"].strip():
                cfg["api_key"] = data["api_key"].strip()
            if data.get("clear_api_key"):
                cfg["api_key"] = ""
            try:
                cfg["temperature"] = float(cfg.get("temperature") or 0.3)
            except (TypeError, ValueError):
                cfg["temperature"] = 0.3
            if cfg.get("mode") not in ("llm", "local"):
                cfg["mode"] = "llm"
            save_config(cfg)
            self.send_json({"ok": True, "has_api_key": bool(cfg.get("api_key"))})
        else:
            self.send_json({"error": "not found"}, 404)

    def do_PUT(self):
        m = re.match(r"^/api/knowledge/([\w-]+)$", urlparse(self.path).path)
        if not m:
            self.send_json({"error": "not found"}, 404)
            return
        data = self.read_body()
        if data is None:
            self.send_json({"error": "请求体必须是合法 JSON"}, 400)
            return
        ok, msg, entry = validate_entry(data)
        if not ok:
            self.send_json({"error": msg}, 400)
            return
        kb = load_kb()
        for i, e in enumerate(kb):
            if e.get("id") == m.group(1):
                entry["id"] = e["id"]
                kb[i] = entry
                save_kb(kb)
                self.send_json({"ok": True, "entry": entry})
                return
        self.send_json({"error": "条目不存在"}, 404)

    def do_DELETE(self):
        m = re.match(r"^/api/knowledge/([\w-]+)$", urlparse(self.path).path)
        if not m:
            self.send_json({"error": "not found"}, 404)
            return
        kb = load_kb()
        new_kb = [e for e in kb if e.get("id") != m.group(1)]
        if len(new_kb) == len(kb):
            self.send_json({"error": "条目不存在"}, 404)
            return
        save_kb(new_kb)
        self.send_json({"ok": True})


def validate_entry(data):
    if not isinstance(data, dict):
        return False, "条目格式错误", None
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title:
        return False, "标题不能为空", None
    if not content:
        return False, "内容不能为空", None
    keywords = data.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [k.strip() for k in re.split(r"[,，;；\s]+", keywords) if k.strip()]
    entry = {
        "title": title,
        "category": (data.get("category") or "其他").strip() or "其他",
        "hall": (data.get("hall") or "").strip(),
        "keywords": [str(k) for k in keywords if str(k).strip()],
        "content": content,
    }
    # 历史人物扩展字段
    if entry["category"] == "历史人物" or data.get("era") or data.get("identity"):
        entry["era"] = (data.get("era") or "").strip()
        entry["identity"] = (data.get("identity") or "").strip()
        entry["persona"] = (data.get("persona") or "").strip()
        entry["quotes"] = data.get("quotes") or []
        if isinstance(entry["quotes"], str):
            entry["quotes"] = [q.strip() for q in entry["quotes"].split("；") if q.strip()]
        entry["related_artifacts"] = data.get("related_artifacts") or []
        if isinstance(entry["related_artifacts"], str):
            entry["related_artifacts"] = [a.strip() for a in re.split(r"[,，;；\s]+", entry["related_artifacts"]) if a.strip()]
    return True, "", entry


def main():
    load_kb()  # 首次运行时生成种子数据
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"博物馆智能问答 Agent 已启动: http://localhost:{PORT}")
    print("按 Ctrl+C 停止服务")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")


if __name__ == "__main__":
    main()
