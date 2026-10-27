// 侧边栏 Agent 桥接层：把 3D 展厅里「当前选中文物」同步给 agent_bi 的两套 Agent，
// 并通过 agent_bi 提供的 REST 接口（README「方案 C」）实现古人角色扮演对话与儿童动画。
//
// 说明：本文件不修改 agent_bi 内部任何代码，只做「页面挂载 + 展厅联动」。
// Agent 服务默认地址 http://localhost:8300（对应 agent_bi/agent/museum-agent/server.py）。
// 同时备选 127.0.0.1：Windows 下 Python 服务只监听 IPv4，若浏览器对 localhost 先解析到
// IPv6(::1) 且回退失败，会自动切换到 IPv4 地址重试。

import type { WorldArtifact } from "./worldArtifacts";
import * as THREE from "three";

// 预加载浏览器 TTS voice 列表，避免首次说话延迟
if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const AGENT_BASES = ["http://localhost:8300", "http://127.0.0.1:8300"];
const DRAMA_BASE = "http://localhost:8000"; // 视频生成工坊（ai-short-drama-studio，可选）

type AgentCharacter = {
  id: string;
  title: string;
  era: string;
  identity: string;
  persona: string;
  quotes: string[];
  related_artifacts: string[];
};

type AgentReply = {
  answer: string;
  mode: string;
  suggested_questions?: string[];
};

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

const agentStatus = mustQuery<HTMLParagraphElement>("#agent-status");
const agentArtifactName = mustQuery<HTMLSpanElement>("#agent-artifact-name");
const chatHint = mustQuery<HTMLParagraphElement>("#agent-chat-hint");
const rolesBox = mustQuery<HTMLDivElement>("#agent-roles");
const rolesKidsBox = mustQuery<HTMLDivElement>("#agent-roles-kids");
const chatBox = mustQuery<HTMLDivElement>("#agent-chat");
const chatForm = mustQuery<HTMLFormElement>("#agent-chat-form");
const questionInput = mustQuery<HTMLInputElement>("#agent-question");
const kidsOutput = mustQuery<HTMLDivElement>("#agent-kids-output");
const genTheaterBtn = mustQuery<HTMLButtonElement>("#agent-gen-theater");
const fullLink = mustQuery<HTMLAnchorElement>("#agent-full-link");

// 连续聊天界面的"当前对话对象"横幅（动态创建，插在聊天区上方）
let chatHead: HTMLElement | null = null;

// 古人对话面板的两个分离视图：人物列表（选择古人）与对话界面（连续聊天）
const rolesView = mustQuery<HTMLDivElement>("#agent-roles-view");
const chatView = mustQuery<HTMLDivElement>("#agent-chat-view");

// 回答文体：classic=古文（默认），vernacular=白话
let chatStyle: "classic" | "vernacular" = "classic";
const stylebar = mustQuery<HTMLDivElement>("#agent-stylebar");

// 点击人物后从列表跳转到对话界面；返回按钮 / 退出对话时回到人物列表
function showRolesView() {
  rolesView.style.display = "";
  chatView.style.display = "none";
}

function showChatView() {
  rolesView.style.display = "none";
  chatView.style.display = "flex";
}

// 古文 / 白话切换：切换后对后续提问生效
function bindStylebar() {
  stylebar.querySelectorAll<HTMLButtonElement>(".agent-style").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.style === "vernacular" ? "vernacular" : "classic";
      if (next === chatStyle) {
        return;
      }
      chatStyle = next;
      stylebar.querySelectorAll<HTMLButtonElement>(".agent-style").forEach((b) => {
        b.classList.toggle("active", b === button);
      });
      appendSystem(chatStyle === "vernacular" ? "已切换为白话文回答，后续回复将更口语化。" : "已切换为古文风回答，后续回复将保留古韵。");
    });
  });
}

let currentArtifact: WorldArtifact | null = null;
let characters: AgentCharacter[] = [];
let activeRoleId = "";
let chatHistory: { role: "user" | "assistant"; content: string }[] = [];
let kidsRoleA = "";
let kidsRoleB = "";
let lastTheater: { script: string; characterA: AgentCharacter; characterB: AgentCharacter } | null = null;

function escapeHtml(value: string): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

// 依次尝试多个后端地址（localhost → 127.0.0.1），返回成功后固定采用该地址。
let agentBaseIndex = 0;

async function api<T = unknown>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  let lastError: unknown = null;
  for (let i = 0; i < AGENT_BASES.length; i += 1) {
    const base = AGENT_BASES[(agentBaseIndex + i) % AGENT_BASES.length];
    try {
      const response = await fetch(`${base}${path}`, {
        method: options?.method ?? "GET",
        headers: options?.body ? { "Content-Type": "application/json" } : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as T & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Agent 服务返回 HTTP ${response.status}`);
      }
      agentBaseIndex = (agentBaseIndex + i) % AGENT_BASES.length;
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

// 拉取 agent_bi 知识库中的全部「历史人物」。
async function loadCharacters(): Promise<AgentCharacter[]> {
  const kb = await api<Array<Record<string, unknown>>>("/api/knowledge");
  const chars = kb
    .filter((entry) => entry.category === "历史人物")
    .map((entry) => ({
      id: String(entry.id ?? ""),
      title: String(entry.title ?? ""),
      era: String(entry.era ?? ""),
      identity: String(entry.identity ?? ""),
      persona: String(entry.persona ?? ""),
      quotes: Array.isArray(entry.quotes) ? (entry.quotes as string[]) : [],
      related_artifacts: Array.isArray(entry.related_artifacts)
        ? (entry.related_artifacts as string[])
        : [],
    }));
  return chars;
}

// 根据当前文物名，从历史人物中推荐相关人物。
// 匹配规则：人物的 related_artifacts 与文物名互相包含（如「秦始皇兵马俑」↔「兵马俑」）。
// 无精确匹配时，返回全部人物并标注「任选」。
function recommendForArtifact(artifactName: string): { char: AgentCharacter; recommended: boolean }[] {
  const name = artifactName.replace(/\s+/g, "");
  if (!characters.length) {
    return [];
  }
  const matched = characters.filter((char) =>
    (char.related_artifacts ?? []).some((related) => {
      const r = related.replace(/\s+/g, "");
      return r.length > 0 && (name.includes(r) || r.includes(name));
    }),
  );
  if (matched.length > 0) {
    const rest = characters.filter((char) => !matched.includes(char));
    return [
      ...matched.map((char) => ({ char, recommended: true })),
      ...rest.map((char) => ({ char, recommended: false })),
    ];
  }
  return characters.map((char) => ({ char, recommended: false }));
}

function renderRoleChips(container: HTMLDivElement, artifactName: string, multi = false) {
  const list = recommendForArtifact(artifactName);
  if (!list.length) {
    container.innerHTML = "";
    return;
  }
  if (multi) {
    renderRoleSelects(container, list);
    return;
  }
  const hasRecommended = list.some((item) => item.recommended);
  container.innerHTML = list
    .map(
      (item) =>
        `<button type="button" class="agent-role${item.recommended ? " recommended" : ""}" data-role-id="${escapeHtml(item.char.id)}">
          <span class="agent-role-avatar" aria-hidden="true">${escapeHtml((item.char.title || "古").slice(0, 1))}</span>
          <span class="agent-role-main">
            <span class="agent-role-title-row">
              <span class="agent-role-title">${escapeHtml(item.char.title)}</span>
              ${item.recommended ? '<span class="agent-role-badge">推荐</span>' : ""}
            </span>
            <span class="agent-role-era">${escapeHtml(item.char.era)}${item.char.identity ? " · " + escapeHtml(item.char.identity) : ""}</span>
          </span>
        </button>`,
    )
    .join("");
  if (!hasRecommended) {
    chatHint.textContent = `当前文物「${artifactName}」暂无专属历史人物，可任选一位古人开启时空对话。`;
  } else {
    chatHint.textContent = `已为「${artifactName}」推荐相关历史人物，点击即可开启角色扮演对话。`;
  }
}

function renderRoleSelects(container: HTMLDivElement, list: { char: AgentCharacter; recommended: boolean }[]) {
  const options = list
    .map(
      (item) =>
        `<option value="${escapeHtml(item.char.id)}">${escapeHtml(item.char.title)}（${escapeHtml(item.char.era)}）${item.recommended ? " ★" : ""}</option>`,
    )
    .join("");
  const first = list.find((item) => item.recommended)?.char.id ?? list[0]?.char.id ?? "";
  const second = list[1]?.char.id ?? list[0]?.char.id ?? "";
  kidsRoleA = kidsRoleA || first;
  kidsRoleB = kidsRoleB || second;
  container.innerHTML = `
    <label class="agent-select">
      <span>人物 A</span>
      <select id="agent-kids-a">${options}</select>
    </label>
    <label class="agent-select">
      <span>人物 B</span>
      <select id="agent-kids-b">${options}</select>
    </label>`;
  const a = container.querySelector<HTMLSelectElement>("#agent-kids-a");
  const b = container.querySelector<HTMLSelectElement>("#agent-kids-b");
  if (a) {
    a.value = kidsRoleA;
    a.addEventListener("change", () => (kidsRoleA = a.value));
  }
  if (b) {
    b.value = kidsRoleB;
    b.addEventListener("change", () => (kidsRoleB = b.value));
  }
}

function appendChat(role: "user" | "bot", text: string) {
  const bubble = document.createElement("div");
  bubble.className = `agent-msg ${role}`;
  bubble.innerHTML = `<div class="agent-avatar">${role === "bot" ? escapeHtml(activeCharName()) : "我"}</div>
    <div class="agent-bubble">${escapeHtml(text)}</div>`;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
  // 古人回复后自动朗读，按人物身份选音色
  if (role === "bot" && activeRoleId) {
    const char = characters.find((item) => item.id === activeRoleId);
    if (char) speakAsChar(text, char);
  }
}

// 通用：按人物身份用 TTS 朗读一段文字
let currentAudio: HTMLAudioElement | null = null;

async function speakAsChar(text: string, char: AgentCharacter) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis.cancel();
  await new Promise(r => setTimeout(r, 300));
  const cleanText = preprocessTtsText(text);
  const v = getVoiceForChar(char);
  const utter = new SpeechSynthesisUtterance(cleanText);
  utter.lang = "zh-CN";
  utter.rate = v.rate;
  utter.pitch = v.pitch;
  utter.volume = 1.0;
  utter.volume = 1.0;
  const voice = pickVoice(v.voiceName);
  if (voice) utter.voice = voice;
  // 避免长文本卡顿：分段用标点断句
  utter.rate = v.rate;
  window.speechSynthesis.speak(utter);
}

// 预处理 TTS 文本：长专有名词前后加停顿，避免拆字读
function preprocessTtsText(text: string): string {
  // 去掉舞台动作提示（中文括号和英文括号里的内容），如"(转身)"、"(举杯)"
  let t = text.replace(/[（(][^）)]*[）)]/g, "");
  // 确保句末有标点，避免 TTS 连读
  t = t.trim();
  if (t && !/[。！？…；：，、]$/.test(t)) {
    t += "。";
  }
  return t;
}
function getVoiceForChar(char: AgentCharacter): { rate: number; pitch: number; voiceName: string } {
  const name = char.title || "";
  const text = `${name} ${char.identity ?? ""} ${char.persona ?? ""}`;
  const isFemale = /武则天|李清照|昭君|贵妃|西施|貂蝉|妇好|女/.test(text);
  // 帝王系列：浑厚男声
  if (/秦始皇/.test(name)) return { rate: 0.85, pitch: 0.9, voiceName: "男浑厚" };
  if (/汉武帝/.test(name)) return { rate: 0.90, pitch: 0.95, voiceName: "男成熟" };
  if (/唐太宗/.test(name)) return { rate: 0.88, pitch: 0.95, voiceName: "男成熟" };
  if (/康熙/.test(name)) return { rate: 0.92, pitch: 1.0, voiceName: "男成熟" };
  if (/乾隆/.test(name)) return { rate: 0.80, pitch: 0.85, voiceName: "男低沉" };
  // 文人系列
  if (/李白/.test(name)) return { rate: 1.10, pitch: 1.05, voiceName: "男年轻" };
  if (/苏轼/.test(name)) return { rate: 0.95, pitch: 0.95, voiceName: "男成熟" };
  if (/辛弃疾/.test(name)) return { rate: 0.98, pitch: 1.0, voiceName: "男年轻" };
  if (/屈原/.test(name)) return { rate: 0.90, pitch: 0.9, voiceName: "男低沉" };
  // 僧人
  if (/玄奘/.test(name)) return { rate: 0.85, pitch: 0.9, voiceName: "男成熟" };
  // 女性角色：不同女声 + pitch/rate 微调，统一用最自然的晓晓音色避免卡顿
  if (/武则天/.test(name)) return { rate: 0.82, pitch: 0.72, voiceName: "女温柔" }; // 晓晓，沉稳女帝气场
  if (/李清照/.test(name)) return { rate: 0.90, pitch: 0.95, voiceName: "女温柔" }; // 晓晓，温柔婉约
  if (/妇好/.test(name)) return { rate: 0.95, pitch: 1.05, voiceName: "女温柔" }; // 晓晓，飒爽女将
  // 武将系列
  if (/霍去病/.test(name)) return { rate: 1.0, pitch: 1.0, voiceName: "男年轻" };
  if (/秦琼/.test(name)) return { rate: 0.88, pitch: 0.9, voiceName: "男成熟" };
  if (/张骞/.test(name)) return { rate: 0.92, pitch: 0.95, voiceName: "男成熟" };
  if (/岳飞|项羽/.test(name)) return { rate: 0.90, pitch: 0.9, voiceName: "男浑厚" };
  // 通用分类
  if (isFemale) return { rate: 0.95, pitch: 1.0, voiceName: "女" };
  if (/帝|王|皇/.test(text)) return { rate: 0.85, pitch: 0.9, voiceName: "男浑厚" };
  if (/将军|帅|武将/.test(text)) return { rate: 0.92, pitch: 0.95, voiceName: "男成熟" };
  return { rate: 1.0, pitch: 1.0, voiceName: "男成熟" };
}

// 从浏览器可用 voice 里挑对应音色
function pickVoice(prefer?: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const zh = voices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
  if (!zh.length) return null;
  if (prefer === "男浑厚") {
    const v = zh.find((v) => /云健|Yunjian/i.test(v.name));
    return v || zh.find((v) => /男|Male/i.test(v.name)) || zh[0];
  }
  if (prefer === "男成熟") {
    const v = zh.find((v) => /云扬|Yunyang/i.test(v.name));
    return v || zh.find((v) => /男|Male/i.test(v.name)) || zh[0];
  }
  if (prefer === "男年轻") {
    const v = zh.find((v) => /云希|Yunxi/i.test(v.name));
    return v || zh.find((v) => /男|Male/i.test(v.name)) || zh[0];
  }
  if (prefer === "男低沉") {
    const v = zh.find((v) => /云野|Yunye/i.test(v.name));
    return v || zh.find((v) => /男|Male/i.test(v.name)) || zh[0];
  }
  if (prefer === "女温柔") {
    // 温柔女声：晓晓
    const v = zh.find((v) => /Xiaoxiao|晓晓/i.test(v.name));
    return v || zh.find((v) => /女|Female/i.test(v.name)) || zh[zh.length - 1];
  }
  if (prefer === "女系统") {
    // 系统自带女声：慧慧
    const v = zh.find((v) => /Huihui|慧慧/i.test(v.name));
    return v || zh.find((v) => /女|Female/i.test(v.name)) || zh[zh.length - 1];
  }
  if (prefer === "女成熟") {
    // 成熟女声：康康
    const v = zh.find((v) => /Kangkang|康康/i.test(v.name));
    return v || zh.find((v) => /女|Female/i.test(v.name)) || zh[zh.length - 1];
  }
  if (prefer === "女年轻") {
    // 年轻女声：慧慧
    const v = zh.find((v) => /Huihui|慧慧/i.test(v.name));
    return v || zh.find((v) => /女|Female/i.test(v.name)) || zh[zh.length - 1];
  }
  if (prefer === "女活泼") {
    // 活泼女声：晓伊
    const v = zh.find((v) => /Xiaoyi|晓伊/i.test(v.name));
    return v || zh.find((v) => /女|Female/i.test(v.name)) || zh[zh.length - 1];
  }
  if (prefer === "女") {
    const v = zh.find((v) => /Xiaoxiao|晓晓/i.test(v.name));
    return v || zh[zh.length - 1];
  }
  return zh[0];
}

function appendSystem(text: string) {
  const div = document.createElement("div");
  div.className = "agent-sys";
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function resetChat() {
  chatHistory = [];
  chatBox.innerHTML = "";
}

function appendTyping(): HTMLDivElement {
  const bubble = document.createElement("div");
  bubble.className = "agent-msg bot";
  bubble.innerHTML = `<div class="agent-avatar">${escapeHtml(activeCharName())}</div>
    <div class="agent-bubble typing-dots" aria-label="正在输入"><span></span><span></span><span></span></div>`;
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble;
}

// 当前对话中的古人首字（用于消息头像）；未进入对话时显示"古人"
function activeCharName() {
  const char = characters.find((item) => item.id === activeRoleId);
  return char ? (char.title || "古").slice(0, 1) : "古人";
}

// 进入 / 退出连续聊天：切换对话对象横幅、输入框提示语
function setActiveRole(roleId: string) {
  activeRoleId = roleId;
  const char = characters.find((item) => item.id === roleId);
  if (char && chatHead) {
    chatHead.style.display = "";
    chatHead.innerHTML = `
      <div class="agent-chat-head-avatar">${escapeHtml((char.title || "古").slice(0, 1))}</div>
      <div class="agent-chat-head-info">
        <span class="agent-chat-head-name">${escapeHtml(char.title)}</span>
        <span class="agent-chat-head-era">${escapeHtml(char.era)}${char.identity ? " · " + escapeHtml(char.identity) : ""}</span>
      </div>
      <button type="button" class="agent-chat-head-back" title="返回人物列表">← 返回人物</button>
      <button type="button" class="agent-chat-head-exit" title="结束与这位古人的对话">✕</button>`;
    chatHead.querySelector(".agent-chat-head-back")?.addEventListener("click", exitChat);
    chatHead.querySelector(".agent-chat-head-exit")?.addEventListener("click", exitChat);
    questionInput.placeholder = `向「${char.title}」提问…`;
  } else if (chatHead) {
    chatHead.style.display = "none";
    chatHead.innerHTML = "";
    questionInput.placeholder = "向古人提问…";
  }
}

// 结束连续聊天：回到人物列表视图（聊天记录保留可回看）
function exitChat() {
  setActiveRole("");
  document.querySelectorAll("#agent-roles .agent-role").forEach((button) => button.classList.remove("active"));
  showRolesView();
}

async function greetRole(roleId: string) {
  const char = characters.find((item) => item.id === roleId);
  resetChat();
  if (!char) {
    return;
  }
  setActiveRole(roleId);
  showChatView();
  questionInput.focus();
  const typing = appendTyping();
  try {
    const reply = await api<AgentReply>("/api/chat", {
      method: "POST",
      body: { question: "", role: roleId, style: chatStyle },
    });
    typing.remove();
    appendChat("bot", reply.answer);
  } catch (error) {
    typing.remove();
    appendSystem(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function sendChat(question: string) {
  if (!question.trim() || !currentArtifact) {
    return;
  }
  appendChat("user", question);
  questionInput.value = "";
  const typing = appendTyping();
  try {
    const reply = await api<AgentReply>("/api/chat", {
      method: "POST",
      body: {
        question,
        role: activeRoleId || undefined,
        style: chatStyle,
        current_hall: currentArtifact.name,
        history: chatHistory.slice(-6),
      },
    });
    typing.remove();
    appendChat("bot", reply.answer);
    chatHistory.push({ role: "user", content: question });
    chatHistory.push({ role: "assistant", content: reply.answer });
  } catch (error) {
    typing.remove();
    appendSystem(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateKidsTheater() {
  if (!currentArtifact) {
    return;
  }
  const aId = kidsRoleA;
  const bId = kidsRoleB;
  if (!aId || !bId) {
    kidsOutput.innerHTML = `<p class="agent-hint">请先选择两位历史人物。</p>`;
    return;
  }
  const charA = characters.find((item) => item.id === aId);
  const charB = characters.find((item) => item.id === bId);
  if (!charA || !charB) {
    kidsOutput.innerHTML = `<p class="agent-hint">未找到所选历史人物，请重试。</p>`;
    return;
  }
  kidsOutput.innerHTML = `<p class="agent-hint" id="kids-loading">正在为「${escapeHtml(currentArtifact.name)}」生成儿童讲解动画剧本…</p>`;
  // 分步进度提示，轮换显示缓解等待焦虑
  const loadingEl = kidsOutput.querySelector<HTMLElement>("#kids-loading");
  const tips = [
    "正在分析两位历史人物的性格与经历…",
    "正在构思跨越时空的对话场景…",
    "正在撰写文物讲解台词…",
    "正在润色对白，让语言更生动…",
    "剧本即将生成完毕…",
  ];
  let tipIdx = 0;
  const tipTimer = window.setInterval(() => {
    tipIdx = (tipIdx + 1) % tips.length;
    if (loadingEl) loadingEl.textContent = tips[tipIdx];
  }, 2500);
  try {
    const res = await api<{ script: string; mode: string }>("/api/theater", {
      method: "POST",
      body: {
        character_a: aId,
        character_b: bId,
        topic: `讲解文物《${currentArtifact.name}》`,
        style: "kids",
      },
    });
    lastTheater = { script: res.script, characterA: charA, characterB: charB };
    renderTheaterScript(res.script);
  } catch (error) {
    kidsOutput.innerHTML = `<p class="agent-hint error">⚠️ ${error instanceof Error ? error.message : String(error)}</p>`;
  } finally {
    window.clearInterval(tipTimer);
  }
}

// 人物剪影图片：左边人物用 left/ 文件夹（脸朝右），右边人物用 right/ 文件夹（脸朝左）
const FIGURE_NAME_MAP: Record<string, string> = {
  "秦始皇": "秦始皇.png",
  "汉武帝": "汉武帝.png",
  "唐太宗": "唐太宗.png",
  "宋太祖": "宋太祖.png",
  "成吉思汗": "成吉思汗.png",
  "朱元璋": "朱元璋.png",
  "康熙": "康熙.png",
  "乾隆": "乾隆.png",
  "武则天": "武则天.png",
  "玄奘": "玄奘.png",
  "鉴真": "鉴真.png",
  "李白": "李白.png",
  "杜甫": "杜甫.png",
  "苏轼": "苏轼.png",
  "李清照": "李清照.png",
  "屈原": "屈原.png",
  "张骞": "张骞.png",
  "妇好": "妇好.png",
  "项羽": "项羽.png",
  "关羽": "关羽.png",
  "岳飞": "岳飞.png",
  "秦琼": "秦琼.png",
  "霍去病": "霍去病.png",
  "辛弃疾": "辛弃疾.png",
};

function getFigureImgUrl(char: AgentCharacter, side: "left" | "right"): string | null {
  const name = char.title.replace(/（.*?）/g, "").trim();
  // 精确匹配人物名
  let matched: string | null = null;
  if (FIGURE_NAME_MAP[name]) matched = name;
  else {
    for (const key of Object.keys(FIGURE_NAME_MAP)) {
      if (name.includes(key) || key.includes(name)) { matched = key; break; }
    }
  }
  if (!matched) return null;
  return `/figures/${side}/${matched}.png`;
}

// 按身份返回身高缩放比例（戏台内相对高度）
function getFigureHeightRatio(char: AgentCharacter): number {
  const text = `${char.title} ${char.identity ?? ""} ${char.persona ?? ""}`;
  if (/武则天|李清照|昭君|贵妃|西施|貂蝉|妇好|女/.test(text)) return 0.78;
  if (/项羽|关羽|岳飞|秦琼|霍去病|辛弃疾|将军|帅|武将/.test(text)) return 1.0;
  if (/秦始皇|汉武|唐太宗|宋太祖|成吉思汗|朱元璋|康熙|乾隆|帝|王|皇/.test(text)) return 0.95;
  return 0.85; // 文人/僧人默认
}

// 兜底 SVG（没有对应图片时用）
const FIGURE_SVGS: Record<string, string> = {
  emperor: `
<svg viewBox="0 0 70 140" aria-hidden="true">
  <rect x="20" y="4" width="30" height="5" rx="1"/>
  <line x1="24" y1="9" x2="24" y2="14"/><line x1="30" y1="9" x2="30" y2="14"/><line x1="36" y1="9" x2="36" y2="14"/><line x1="42" y1="9" x2="42" y2="14"/>
  <circle cx="35" cy="24" r="11"/>
  <circle class="mouth" cx="42" cy="26" r="1.5" fill="#f5e3b3"/>
  <path d="M25 36 L18 132 L52 132 L45 36 Z"/>
  <line class="arm" x1="30" y1="44" x2="16" y2="82" stroke="#3a2812" stroke-width="4" stroke-linecap="round"/>
  <rect x="20" y="72" width="30" height="4"/>
</svg>`,
  scholar: `
<svg viewBox="0 0 70 140" aria-hidden="true">
  <path d="M24 14 q11 -10 22 0 l-3 4 h-16 z"/>
  <circle cx="35" cy="26" r="10"/>
  <circle class="mouth" cx="42" cy="28" r="1.5" fill="#f5e3b3"/>
  <path d="M26 38 L20 132 L50 132 L44 38 Z"/>
  <line class="arm" x1="30" y1="46" x2="18" y2="84" stroke="#3a2812" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="22" y="74" width="26" height="3"/>
</svg>`,
  monk: `
<svg viewBox="0 0 70 140" aria-hidden="true">
  <ellipse cx="35" cy="14" rx="12" ry="7"/>
  <circle cx="35" cy="28" r="10"/>
  <circle class="mouth" cx="42" cy="30" r="1.5" fill="#f5e3b3"/>
  <path d="M26 40 L22 132 L48 132 L44 40 Z"/>
  <line class="arm" x1="30" y1="48" x2="18" y2="86" stroke="#3a2812" stroke-width="3.5" stroke-linecap="round"/>
</svg>`,
  warrior: `
<svg viewBox="0 0 70 140" aria-hidden="true">
  <path d="M24 18 q11 -12 22 0 l2 6 h-26 z"/>
  <circle cx="35" cy="28" r="10"/>
  <circle class="mouth" cx="42" cy="30" r="1.5" fill="#f5e3b3"/>
  <path d="M24 40 L16 132 L54 132 L46 40 Z"/>
  <line class="arm" x1="30" y1="48" x2="14" y2="80" stroke="#3a2812" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="18" y="70" width="34" height="5"/>
</svg>`,
  lady: `
<svg viewBox="0 0 70 140" aria-hidden="true">
  <ellipse cx="35" cy="12" rx="8" ry="6"/>
  <circle cx="35" cy="26" r="10"/>
  <circle class="mouth" cx="42" cy="28" r="1.5" fill="#f5e3b3"/>
  <path d="M26 38 L18 132 L52 132 L44 38 Z"/>
  <line class="arm" x1="30" y1="46" x2="20" y2="82" stroke="#3a2812" stroke-width="3" stroke-linecap="round"/>
</svg>`,
};

function getFigureSvg(char: AgentCharacter): string {
  const text = `${char.title} ${char.identity ?? ""} ${char.persona ?? ""}`;
  if (/秦始皇|汉武|唐太宗|宋太祖|成吉思汗|忽必烈|朱元璋|康熙|乾隆|帝|王|皇/.test(text)) return FIGURE_SVGS.emperor;
  if (/玄奘|鉴真|达摩|僧|和尚|法师/.test(text)) return FIGURE_SVGS.monk;
  if (/项羽|关羽|张飞|岳飞|韩信|李广|卫青|霍去病|将军|帅|武将/.test(text)) return FIGURE_SVGS.warrior;
  if (/武则天|慈禧|昭君|贵妃|西施|貂蝉|李清照|女/.test(text)) return FIGURE_SVGS.lady;
  return FIGURE_SVGS.scholar;
}

function getArtifactSilhouetteUrl(artifactId: string): string | null {
  try {
    const raw = localStorage.getItem("huaxia-showcase-v4");
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, string>;
    return cache[artifactId] ?? null;
  } catch {
    return null;
  }
}

// 离屏剪影渲染器：把文物 3D 模型渲成纯黑剪影 PNG
let silhouetteRenderer: THREE.WebGLRenderer | null = null;
let silhouetteLoader: GLTFLoader | null = null;

function getSilhouetteRenderer(): THREE.WebGLRenderer {
  if (!silhouetteRenderer) {
    silhouetteRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    silhouetteRenderer.setPixelRatio(1);
    silhouetteRenderer.setSize(240, 200, false);
  }
  return silhouetteRenderer;
}

function getSilhouetteLoader(): GLTFLoader {
  if (!silhouetteLoader) silhouetteLoader = new GLTFLoader();
  return silhouetteLoader;
}

async function renderArtifactSilhouette(modelPath: string): Promise<string> {
  const renderer = getSilhouetteRenderer();
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(35, 240 / 200, 0.1, 200);
  camera.position.set(0, 0.6, 3.5);
  camera.lookAt(0, 0, 0);

  const gltf = await getSilhouetteLoader().loadAsync(modelPath);
  const model = gltf.scene;

  // 所有材质换成纯黑
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = new THREE.MeshBasicMaterial({ color: 0x2a1a08 });
    }
  });

  // 缩放适配
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 1.6 / maxDim : 1;
  model.scale.setScalar(scale);
  model.position.copy(center).multiplyScalar(-scale);

  scene.add(model);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  scene.remove(model);
  return dataUrl;
}

function renderTheaterScript(script: string) {
  if (!lastTheater) return;
  shadowCurrentIndex = 0; // 新剧本重置播放位置
  const charA = lastTheater.characterA;
  const charB = lastTheater.characterB;
  const artId = currentArtifact?.id ?? "";
  const silhouetteUrl = artId ? getArtifactSilhouetteUrl(artId) : null;
  const artifactBg = silhouetteUrl
    ? `<img class="shadow-artifact-img" src="${silhouetteUrl}" alt="" />`
    : `<div class="shadow-artifact">🏺</div>`;
  // 人物：优先用真实剪影图片，没有才用 SVG 兜底
  const leftImg = getFigureImgUrl(charA, "left");
  const rightImg = getFigureImgUrl(charB, "right");
  const leftRatio = getFigureHeightRatio(charA);
  const rightRatio = getFigureHeightRatio(charB);
  const leftFigure = leftImg
    ? `<img class="shadow-figure-img" src="${leftImg}" alt="${escapeHtml(charA.title)}" style="height:${leftRatio * 100}%" />`
    : getFigureSvg(charA);
  const rightFigure = rightImg
    ? `<img class="shadow-figure-img" src="${rightImg}" alt="${escapeHtml(charB.title)}" style="height:${rightRatio * 100}%" />`
    : getFigureSvg(charB);
  kidsOutput.innerHTML = `
    <div class="shadow-box" id="shadow-box">
      <div class="shadow-stage" id="shadow-stage">
        <div id="shadow-artifact-slot">${artifactBg}</div>
        <div class="shadow-figure left" id="shadow-left">${leftFigure}</div>
        <div class="shadow-figure right" id="shadow-right">${rightFigure}</div>
        <div class="shadow-subtitle" id="shadow-subtitle">点击播放，观看两位历史人物讲解「${escapeHtml(currentArtifact?.name ?? "")}」</div>
        <button class="shadow-expand" id="shadow-expand" type="button" title="放大观看">⛶</button>
      </div>
      <div class="shadow-controls" id="shadow-controls">
        <button class="shadow-btn" id="shadow-play" type="button">▶ 播放讲解</button>
        <button class="shadow-btn" id="shadow-stop" type="button" disabled>⏹ 停止</button>
      </div>
    </div>
    <p class="agent-hint" style="margin-top:8px;font-size:11.5px;">${escapeHtml(charA.title)} × ${escapeHtml(charB.title)} · 皮影小剧场</p>`;

  // 缓存没有时，异步渲染当前文物剪影并替换背景
  if (!silhouetteUrl && currentArtifact?.model) {
    const slot = kidsOutput.querySelector("#shadow-artifact-slot");
    renderArtifactSilhouette(currentArtifact.model)
      .then((dataUrl) => {
        if (slot) {
          slot.innerHTML = `<img class="shadow-artifact-img" src="${dataUrl}" alt="" />`;
        }
      })
      .catch(() => {
        // 渲染失败保留占位
      });
  }

  const playBtn = kidsOutput.querySelector<HTMLButtonElement>("#shadow-play");
  const stopBtn = kidsOutput.querySelector<HTMLButtonElement>("#shadow-stop");
  if (playBtn && stopBtn) {
    playBtn.addEventListener("click", () => void playShadowTheater(script, playBtn, stopBtn));
    stopBtn.addEventListener("click", stopShadowTheater);
  }
  const expandBtn = kidsOutput.querySelector<HTMLButtonElement>("#shadow-expand");
  const box = kidsOutput.querySelector<HTMLDivElement>("#shadow-box");
  const stage = kidsOutput.querySelector<HTMLDivElement>("#shadow-stage");
  const controls = kidsOutput.querySelector<HTMLDivElement>("#shadow-controls");
  expandBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!box) return;
    let mask = document.getElementById("shadow-modal-mask");
    if (box.classList.contains("enlarged")) {
      // 关闭：移回原容器
      kidsOutput.appendChild(box);
      box.classList.remove("enlarged");
      expandBtn.textContent = "⛶";
      mask?.remove();
    } else {
      // 放大：创建独立遮罩，把整个戏台容器（舞台+控制条）一起移到 body 下
      mask = document.createElement("div");
      mask.id = "shadow-modal-mask";
      document.body.appendChild(mask);
      document.body.appendChild(box);
      box.classList.add("enlarged");
      expandBtn.textContent = "✕";
      mask.addEventListener("click", () => {
        kidsOutput.appendChild(box);
        box.classList.remove("enlarged");
        expandBtn.textContent = "⛶";
        mask?.remove();
      });
    }
  });
}

interface ShadowLine {
  speaker: string;
  text: string;
  isNarration: boolean;
}

function parseScriptLines(script: string): ShadowLine[] {
  return script.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^：:\n]{1,12})[：:](.+)$/);
      if (!m) {
        return { speaker: "", text: line, isNarration: true };
      }
      return { speaker: m[1].trim(), text: m[2].trim(), isNarration: false };
    });
}

function matchFigure(speaker: string, charA: AgentCharacter, charB: AgentCharacter): "left" | "right" | null {
  const aName = charA.title.replace(/（.*?）/g, "").trim();
  const bName = charB.title.replace(/（.*?）/g, "").trim();
  if (speaker.includes(aName) || aName.includes(speaker)) return "left";
  if (speaker.includes(bName) || bName.includes(speaker)) return "right";
  return null;
}

let shadowPlaying = false;
let shadowStoppedByUser = false;
let shadowCurrentIndex = 0; // 记录当前播放到第几句，用于暂停后继续

function stopShadowTheater() {
  shadowPlaying = false;
  shadowStoppedByUser = true;
  window.speechSynthesis.cancel();
  const left = kidsOutput.querySelector("#shadow-left");
  const right = kidsOutput.querySelector("#shadow-right");
  left?.classList.remove("speaking");
  right?.classList.remove("speaking");
  const sub = kidsOutput.querySelector<HTMLDivElement>("#shadow-subtitle");
  if (sub) sub.textContent = "⏸ 讲解已暂停，点击播放继续";
}

// 根据人物身份选 TTS 音色参数
function getVoiceForLine(line: ShadowLine, charA: AgentCharacter, charB: AgentCharacter): { rate: number; pitch: number; voiceName: string } {
  if (line.isNarration) return { rate: 1.0, pitch: 0.9, voiceName: "男成熟" }; // 旁白用云扬
  const figure = matchFigure(line.speaker, charA, charB);
  const char = figure === "left" ? charA : figure === "right" ? charB : null;
  if (!char) return { rate: 1.0, pitch: 0.9, voiceName: "男成熟" };
  return getVoiceForChar(char);
}

async function playShadowTheater(script: string, playBtn: HTMLButtonElement, stopBtn: HTMLButtonElement) {
  if (!lastTheater) return;
  const lines = parseScriptLines(script);
  if (lines.length === 0) return;

  // 如果是暂停后继续，从当前 index 开始；如果是全新播放，从 0 开始
  const startIndex = shadowStoppedByUser ? shadowCurrentIndex : 0;
  shadowPlaying = true;
  shadowStoppedByUser = false;
  playBtn.disabled = true;
  stopBtn.disabled = false;

  const leftEl = document.querySelector("#shadow-left");
  const rightEl = document.querySelector("#shadow-right");
  const sub = document.querySelector<HTMLDivElement>("#shadow-subtitle");
  const charA = lastTheater.characterA;
  const charB = lastTheater.characterB;

  window.speechSynthesis.cancel();
  await new Promise(r => setTimeout(r, 120)); // 给浏览器清理队列留时间，避免卡顿

  for (let i = startIndex; i < lines.length; i++) {
    if (!shadowPlaying) {
      shadowCurrentIndex = i; // 记录暂停位置
      break;
    }
    const line = lines[i];

    // 更新字幕
    if (sub) {
      sub.textContent = line.isNarration
        ? line.text
        : `${line.speaker}：${line.text}`;
    }

    // 高亮对应人物
    leftEl?.classList.remove("speaking");
    rightEl?.classList.remove("speaking");
    const figure = line.isNarration ? null : matchFigure(line.speaker, charA, charB);
    if (figure === "left") leftEl?.classList.add("speaking");
    if (figure === "right") rightEl?.classList.add("speaking");

    // TTS 朗读
    const cleanText = preprocessTtsText(line.text);
    const voice = getVoiceForLine(line, charA, charB);
    await new Promise<void>((resolve) => {
      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.lang = "zh-CN";
      utter.rate = voice.rate;
      utter.pitch = voice.pitch;
      utter.volume = 1.0;
      const v = pickVoice(voice.voiceName);
      if (v) utter.voice = v;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });

    // 自然节奏：更符合真人说话节奏
    const textLen = line.text.length;
    const basePause = line.isNarration ? 250 : 180; // 对话间停顿更短
    const lenBonus = Math.min(textLen * 10, 280); // 按句长加停顿
    // 对话间加思考停顿（人物接话前像在想）
    const thinkPause = !line.isNarration ? 120 : 0;
    await new Promise((r) => setTimeout(r, basePause + lenBonus + thinkPause));
  }

  // 结束
  shadowPlaying = false;
  leftEl?.classList.remove("speaking");
  rightEl?.classList.remove("speaking");
  if (!shadowStoppedByUser && sub) {
    sub.textContent = "✅ 讲解完毕";
  }
  playBtn.disabled = false;
  stopBtn.disabled = true;
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>(".agent-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".agent-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll<HTMLElement>(".agent-pane").forEach((pane) => {
        pane.classList.toggle("active", pane.dataset.pane === tab.dataset.tab);
      });
    });
  });

  rolesBox.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-role-id]");
    if (!target) {
      return;
    }
    activeRoleId = target.dataset.roleId ?? "";
    document.querySelectorAll("#agent-roles .agent-role").forEach((button) => {
      button.classList.toggle("active", button === target);
    });
    void greetRole(activeRoleId);
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendChat(questionInput.value);
  });

  genTheaterBtn.addEventListener("click", () => {
    void generateKidsTheater();
  });
}

// 连接 Agent 服务：失败后每 3 秒自动重连，最多 10 次；期间状态栏实时提示，
// 避免「页面先于后端就绪」或网络抖动时永久停留在"未连接"。
const MAX_RETRY = 10;
const RETRY_INTERVAL_MS = 3000;

async function bootstrap() {
  bindEvents();
  for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
    try {
      characters = await loadCharacters();
      agentStatus.textContent = `已连接 · 历史人物 ${characters.length} 位`;
      fullLink.style.display = "inline-flex";
      syncArtifactToAgent(currentArtifact);
      return;
    } catch (error) {
      if (attempt < MAX_RETRY) {
        agentStatus.textContent = `未连接 · 正在自动重连（${attempt + 1}/${MAX_RETRY}）…`;
        fullLink.style.display = "none";
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      } else {
        agentStatus.textContent = "未连接 Agent 服务";
        fullLink.style.display = "none";
        const message = error instanceof Error ? error.message : String(error);
        chatBox.innerHTML = "";
        appendSystem(`⚠️ 无法连接 Agent 服务（${AGENT_BASES.join(" / ")}）。请先在 agent_bi/agent/museum-agent 目录运行：python server.py`);
        if (message) {
          appendSystem(message);
        }
      }
    }
  }
}

export function initAgentSidebar() {
  chatHead = document.createElement("div");
  chatHead.className = "agent-chat-head";
  chatHead.style.display = "none";
  chatBox.before(chatHead);
  bindStylebar();
  void bootstrap();
}

// 展厅切换文物时调用：同步当前展品给侧边栏 Agent，人物候选与动画素材随之更新。
export function syncArtifactToAgent(artifact: WorldArtifact | null) {
  currentArtifact = artifact;
  if (!artifact) {
    agentArtifactName.textContent = "未选中";
    rolesBox.innerHTML = "";
    rolesKidsBox.innerHTML = "";
    return;
  }
  agentArtifactName.textContent = artifact.name;
  activeRoleId = "";
  setActiveRole("");
  showRolesView();
  resetChat();
  renderRoleChips(rolesBox, artifact.name, false);
  renderRoleChips(rolesKidsBox, artifact.name, true);
  // 如果已经生成了小剧场剧本，不要重置 kidsOutput，保留当前戏台
  if (!lastTheater) {
    kidsOutput.innerHTML = `<p class="agent-hint">点击上方「生成讲解动画」，为「${escapeHtml(artifact.name)}」生成儿童白话讲解动画。</p>`;
  }
  if (characters.length) {
    agentStatus.textContent = `当前文物：${artifact.name}`;
  }
}
