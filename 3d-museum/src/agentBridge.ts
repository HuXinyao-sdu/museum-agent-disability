// 侧边栏 Agent 桥接层：把 3D 展厅里「当前选中文物」同步给 agent_bi 的两套 Agent，
// 并通过 agent_bi 提供的 REST 接口（README「方案 C」）实现古人角色扮演对话与儿童动画。
//
// 说明：本文件不修改 agent_bi 内部任何代码，只做「页面挂载 + 展厅联动」。
// Agent 服务默认地址 http://localhost:8300（对应 agent_bi/agent/museum-agent/server.py）。
// 同时备选 127.0.0.1：Windows 下 Python 服务只监听 IPv4，若浏览器对 localhost 先解析到
// IPv6(::1) 且回退失败，会自动切换到 IPv4 地址重试。

import type { WorldArtifact } from "./worldArtifacts";

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
  appendSystem(`正在开启与「${char.title}」的时空对话，可以连续提问…`);
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
  kidsOutput.innerHTML = `<p class="agent-hint">正在为「${escapeHtml(currentArtifact.name)}」生成儿童讲解动画剧本…</p>`;
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
  }
}

function renderTheaterScript(script: string) {
  const lines = script.split("\n").map((line) => line.trim()).filter(Boolean);
  const html = lines
    .map((line) => {
      const m = line.match(/^([^：:\n]{1,12})[：:](.+)$/);
      if (!m) {
        return `<p class="agent-line narration">🎬 ${escapeHtml(line)}</p>`;
      }
      return `<p class="agent-line"><b>${escapeHtml(m[1])}：</b>${escapeHtml(m[2])}</p>`;
    })
    .join("");
  kidsOutput.innerHTML = `
    <div class="agent-script">
      <div class="agent-script-head">🎞 讲解动画剧本（儿童白话版）</div>
      <div class="agent-script-body">${html}</div>
    </div>
    <button class="agent-gen" id="agent-gen-video" type="button">🎬 生成讲解动画视频</button>
    <div class="agent-video" id="agent-video"></div>`;
  const videoBtn = kidsOutput.querySelector<HTMLButtonElement>("#agent-gen-video");
  videoBtn?.addEventListener("click", generateVideo);
}

// 把知识库中的历史人物映射为视频工坊要求的角色字段（与 agent_bi 前端契约一致）。
function toBridgeCharacter(char: AgentCharacter) {
  return {
    id: char.id || `char-${char.title}`,
    title: char.title,
    era: char.era,
    identity: char.identity,
    persona: char.persona,
    quotes: char.quotes ?? [],
    related_artifacts: char.related_artifacts ?? [],
  };
}

async function generateVideo() {
  if (!lastTheater || !currentArtifact) {
    return;
  }
  const videoBox = kidsOutput.querySelector<HTMLDivElement>("#agent-video");
  if (!videoBox) {
    return;
  }
  videoBox.innerHTML = `<p class="agent-hint">正在提交视频生成工坊…（需启动 ai-short-drama-studio，端口 8000）</p>`;
  const payload = {
    title: `${lastTheater.characterA.title}×${lastTheater.characterB.title}`,
    topic: `讲解文物《${currentArtifact.name}》`,
    style: "kids",
    aspect_ratio: "9:16",
    target_duration_sec: 30,
    character_a: toBridgeCharacter(lastTheater.characterA),
    character_b: toBridgeCharacter(lastTheater.characterB),
    dialogue_script: lastTheater.script,
  };
  try {
    const res = await fetch(`${DRAMA_BASE}/api/v1/projects/from-museum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      videoBox.innerHTML = `<p class="agent-hint error">⚠️ 提交失败：${escapeHtml(err.error || err.detail || `HTTP ${res.status}`)}</p>`;
      return;
    }
    const data = (await res.json()) as { project_id?: string; video_url?: string };
    if (!data.project_id || !data.video_url) {
      videoBox.innerHTML = `<p class="agent-hint error">⚠️ 返回格式异常：缺少 project_id / video_url。</p>`;
      return;
    }
    const videoUrl = /^https?:/.test(data.video_url) ? data.video_url : `${DRAMA_BASE}${data.video_url}`;
    await pollVideo(videoUrl, videoBox, data.project_id);
  } catch (error) {
    videoBox.innerHTML = `<p class="agent-hint error">⚠️ 无法连接视频生成工坊：${escapeHtml(error instanceof Error ? error.message : String(error))}。请确认 ai-short-drama-studio 已启动。</p>`;
  }
}

async function pollVideo(videoUrl: string, videoBox: HTMLDivElement, projectId: string) {
  videoBox.innerHTML = `<p class="agent-hint">已创建项目，正在生成视频（约 3–10 分钟）…</p>`;
  const maxAttempts = 720;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(videoUrl, { method: "HEAD", cache: "no-store" });
      if (response.ok) {
        videoBox.innerHTML = `
          <video controls autoplay playsinline style="width:100%;max-height:320px;border-radius:10px;background:#000;">
            <source src="${escapeHtml(videoUrl)}" type="video/mp4" />
            您的浏览器不支持 video 标签。
          </video>
          <p class="agent-hint">✅ 视频生成完成（项目 ${escapeHtml(projectId.slice(0, 8))}）。</p>`;
        return;
      }
    } catch {
      // 视频文件尚未就绪，继续轮询
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (attempt % 15 === 0) {
      videoBox.innerHTML = `<p class="agent-hint">视频生成中… 已等待 ${Math.floor(attempt / 60)} 分 ${attempt % 60} 秒。</p>`;
    }
  }
  videoBox.innerHTML = `<p class="agent-hint error">⚠️ 等待超时，请直接访问视频链接：<a href="${escapeHtml(videoUrl)}" target="_blank">${escapeHtml(videoUrl)}</a></p>`;
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
  kidsOutput.innerHTML = `<p class="agent-hint">点击上方「生成讲解动画」，为「${escapeHtml(artifact.name)}」生成儿童白话讲解动画。</p>`;
  if (characters.length) {
    agentStatus.textContent = `当前文物：${artifact.name}`;
  }
}
