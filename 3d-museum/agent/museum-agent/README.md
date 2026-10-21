# 泉城数字博物馆 · 智能问答 Agent

一个**零依赖、本地部署**的博物馆智能问答应用：通过网页聊天解答馆务咨询与文物讲解，所有知识由您通过网页自助维护（增删改查 + 导入导出）。支持接入**通义千问等 OpenAI 兼容大模型**，以 RAG 方式根据知识库生成自然回答。

## 快速启动

```bash
cd museum-agent
python server.py          # 默认端口 8300
# 或指定端口：python server.py 8080
```

浏览器打开 <http://localhost:8300> 即可使用。

> 仅需 Python 3.8+，**无需安装任何第三方库**；知识库保存在 `data/knowledge.json`。

## 功能说明

### 1. 智能问答（网页接入）

应用支持两种回答模式，可在页面右上角「⚙️」面板中配置切换：

| 模式 | 原理 | 适用场景 |
|------|------|---------|
| **大模型 RAG**（推荐） | 检索知识库 top-3 条目 → 拼入 Prompt → 通义千问等 OpenAI 兼容模型生成回答 | 已有 API Key，需要自然、综合、可追问的回答 |
| **本地检索** | 中文一元/二元字符特征 + 标题/关键词/内容三级加权匹配，返回条目原文 | 离线环境、零成本 |

大模型模式特性：
- **严格基于知识库**：系统提示词约束模型"仅依据提供的资料回答，不足时说明未收录"，防止编造
- **多轮对话**：携带最近 3 轮历史，支持"那它的年代呢？"这类追问
- **优雅降级**：未配置 Key 或调用失败（超时/欠费/网络）自动回退本地检索，回答前会标注回退原因

配置入口：页面右上角「⚙️ 本地检索模式 / 🤖 大模型模式」徽标 → 填入 API Key（默认对接阿里云百炼 DashScope，Key 可在 [百炼控制台](https://bailian.console.aliyun.com/) 免费领取）→ 保存即生效。配置存储在 `data/config.json`。
换其他服务商只需修改「接口地址」与「模型名称」，如 DeepSeek：`https://api.deepseek.com/v1` + `deepseek-chat`；本地 Ollama：`http://localhost:11434/v1` + `qwen2.5:7b`（Key 随便填）。

- 回答附带**来源条目、分类、匹配置信度、相关推荐**
- 支持「博物馆有哪些文物？」这类列表意图，自动汇总文物条目
- 未命中时给出引导话术，提示去知识库补充资料

### 2. 知识库管理（自助添加文物）
点击顶部「知识库管理」标签：
- **新增条目**：分类选择「文物藏品」，填写名称、关键词、讲解词，保存后立即可被问答命中
- **编辑 / 删除 / 搜索**：随时维护已有知识
- **导出 / 导入**：JSON 格式备份与恢复（跨设备迁移）

### 添加一件文物的推荐写法

| 字段 | 示例 |
|------|------|
| 标题 | 青花缠枝莲纹瓶 |
| 分类 | 文物藏品 |
| 关键词 | 青花瓷, 明代, 瓷器, 镇馆之宝 |
| 内容 | 这件青花缠枝莲纹瓶烧制于明代永乐年间，高 38cm……（讲解词） |

关键词越多、越口语化（如"多少钱""几点开门"），问答命中率越高。

## 接口文档（供二次开发/接入其他前端）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge` | 获取全部知识条目 |
| POST | `/api/knowledge` | 新增条目 `{title, category, keywords, content}` |
| PUT | `/api/knowledge/{id}` | 更新条目 |
| DELETE | `/api/knowledge/{id}` | 删除条目 |
| POST | `/api/chat` | 问答 `{question, history?, mode?}` → `{answer, mode, matched, confidence, references}` |
| GET / POST | `/api/config` | 读取 / 保存大模型配置（GET 返回脱敏 Key） |
| POST | `/api/knowledge/import` | 批量导入 `{items: [...]}` |

## 目录结构

```
museum-agent/
├── server.py            # 后端：HTTP 服务 + RAG 问答引擎（标准库实现 LLM 调用）
├── static/index.html    # 前端：问答 + 知识库管理 + 模型设置单页应用
├── data/knowledge.json  # 知识库（首次运行自动生成，含示例馆务数据）
└── data/config.json     # 大模型配置（API Key / 接口地址 / 模型名）
```

## 嵌入已有展示网页

你的博物馆展示页可通过以下 3 种方式接入本问答系统，推荐度从高到低：

### 方案 A：iframe 嵌入（最快，5 分钟）

直接把问答页当作一个“窗口”嵌入展示页。适合已有展示页不想大改的情况。

```html
<!-- 在展示页需要放聊天框的位置插入 -->
<iframe
  src="http://localhost:8300"
  width="380"
  height="600"
  style="border: none; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);"
  title="博物馆智能问答"
></iframe>
```

如需右下角悬浮气泡，套一层 CSS：

```html
<div style="position: fixed; right: 24px; bottom: 24px; z-index: 9999;">
  <iframe src="http://localhost:8300" width="380" height="600"
          style="border: none; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);"></iframe>
</div>
```

> 注意：展示页访问者的浏览器必须能访问 `src=` 里的地址。若展示页部署在公网，本服务也要能公网访问（内网穿透/云服务器）。

### 方案 B：JS Widget（轻量，自定义外观）

在展示页引入一段脚本，以“浮动按钮 + 弹窗”形式唤起问答。外观完全由你控制，后端只提供 API。

```html
<script>
(function () {
  const API = 'http://localhost:8300/api/chat';
  async function ask(question) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    return (await r.json()).answer;
  }
  // 这里可渲染你自己的聊天 UI，调用 ask() 获取回答
})();
</script>
```

前端需要自己写消息气泡、历史记录等 UI；适合对界面有统一品牌要求的项目。

### 方案 C：REST API 接入（完全自定义）

展示页的后端直接调用 `/api/chat`，把回答渲染到现有页面任意位置。

```bash
curl -X POST http://localhost:8300/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"几点开门"}'
```

返回示例：

```json
{
  "answer": "泉城数字博物馆每天周二至周日 9:00—17:00 开放……",
  "mode": "llm",
  "matched": { "title": "开放时间", "category": "馆务信息" },
  "confidence": 1.0,
  "references": [{"title":"开放时间","score":1.0}],
  "suggested_questions": ["博物馆有哪些展厅？", "如何预约门票？", "地址在哪里？"]
}
```

### 多页面/多场馆嵌入（首页 + 各场馆页）

你的最终形态是「博物馆展览网页上的悬浮助手」：

| 页面 | Agent 侧职责 | 展示网页侧职责 |
|------|-------------|--------------|
| **首页** | 提供通用问答（开放时间、预约、全馆展厅列表、任意文物） | 悬浮按钮 + 弹窗/侧边栏，图标用博物馆 LOGO |
| **场馆页** | 接收 `current_hall` 参数，优先回答当前场馆相关文物与介绍 | 悬浮按钮 + 传递当前场馆名（如 `青铜馆`），图标可换为场馆主题图标 |

场馆页调用示例：

```javascript
// 在青铜馆页面加载时，把 current_hall 传给 Agent
const res = await fetch('http://localhost:8300/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: '这个馆有什么文物？',
    current_hall: '青铜馆'   // ← 关键参数
  })
});
```

这样用户在场馆页问「这里有什么」「介绍一下这个」时，Agent 会自动理解为当前场馆。

**架构边界总结**：
- **Agent（本项目）**：负责知识库、检索、大模型生成、推荐问题、场馆关系——即「回答什么」
- **展示网页**：负责悬浮按钮样式、图标、页面路由、是否展开、视觉动效——即「长什么样、在哪出现」

不同场馆换图标、换主题色、决定悬浮窗默认展开/收起，**全部在展示网页实现**，Agent 只需要知道 `current_hall` 即可。

### 3. 语音朗读（浏览器 TTS）

页面右上角有一个 🔊 / 🔇 按钮，点击可开启或关闭**自动朗读**。

- 每次机器人回答生成后，会自动用浏览器内置语音合成朗读出来
- 每条机器人消息左侧有一个小喇叭按钮，可单独朗读/停止该条
- 默认音色为中文女声，浏览器会自动选择系统已安装的中文语音
- 用户偏好（是否开启语音）保存在浏览器本地存储中

> 浏览器 TTS 完全免费、无需配置；若对音色质量有更高要求，后续可升级为云端 TTS（阿里云、科大讯飞等），只需在前端把 `speak()` 函数改成调用后端 `/api/tts` 接口即可，Agent 端只需新增一个转发接口。

### 4. 历史人物对话 / 时空穿梭

页面顶部有一个下拉选择器「🏛️ 智能讲解员 → 秦始皇 / 李白 / 李清照 / 苏轼 / 武则天」。

选择某位历史人物后：

- 对话框会显示人物专属欢迎语
- 所有后续问答由该人物以**第一人称**回答
- 模型会结合人物生平、性格、名言与馆藏文物，生成具有时空对话感的回答
- 快捷问题也会变成与人物相关（如「你的一生经历了哪些大事？」「讲讲兵马俑与你的关系」）

实现原理：

```
用户选择人物 → 前端把人物 id 通过 role 参数传给 /api/chat
              → 后端检索到对应历史人物条目
              → 构造角色扮演 system prompt（生平/性格/名言）
              → 拼接普通知识库条目 + 人物资料 → 调用大模型生成第一人称回答
```

知识库中的历史人物条目示例（可直接导入）：

```json
{
  "id": "char-qinshihuang",
  "title": "秦始皇",
  "category": "历史人物",
  "era": "秦朝",
  "identity": "首位皇帝",
  "keywords": ["秦始皇", "嬴政", "秦朝", "兵马俑", "统一六国"],
  "content": "秦始皇嬴政，中国历史上第一位皇帝……",
  "persona": "威严霸气，自称朕，言简意赅",
  "quotes": ["朕统六国，天下归一。", "书同文，车同轨，行同伦。"],
  "related_artifacts": ["兵马俑", "青铜剑"]
}
```

你可以随时在「知识库管理」中新增/编辑历史人物，无需改代码。

## 扩展建议

- **上传图片**：为条目增加 `image` 字段并在前端展示
- **公网访问**：用 `ngrok http 8300` 或部署到任意支持 Python 的服务器
- **更换模型**：设置面板中改 Base URL / 模型名即可，无需改代码
- **云端语音**：前端把 `speak()` 改为调用后端 `/api/tts`（接入阿里云/讯飞语音合成）以获得更自然、多种音色的朗读效果
