// ---------- 首页脚本：博物馆首页（介绍 + 藏品概览）＋ 智能导航讲解悬浮球 ----------
// 馆藏图鉴已拆分为独立页面（gallery.html + gallery.ts）

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { worldArtifacts, type WorldArtifact } from "./worldArtifacts";
import { t } from "./lang";

const AGENT_BASE = "http://localhost:8300";

function mustQuery<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}

// ---------- 首页讲解 Agent：豆包式悬浮球（始终为圆形图标，可拖动）＋ 独立对话窗口 ----------

const homeAgent = mustQuery<HTMLDivElement>("#home-agent");
const homePanel = mustQuery<HTMLDivElement>("#home-agent-panel");
const homeStatus = mustQuery<HTMLParagraphElement>("#home-agent-status");
const homeChat = mustQuery<HTMLDivElement>("#home-agent-chat");
const homeForm = mustQuery<HTMLFormElement>("#home-agent-form");
const homeQuestion = mustQuery<HTMLInputElement>("#home-agent-question");
const homeClose = mustQuery<HTMLButtonElement>("#home-agent-close");
const homeNew = mustQuery<HTMLButtonElement>("#home-agent-new");
const homeSuggests = mustQuery<HTMLDivElement>("#home-suggests");
const homeSuggestBtn = mustQuery<HTMLButtonElement>("#home-suggest-btn");
const homeSuggestsList = mustQuery<HTMLDivElement>("#home-suggests-list");

let agentReady = false;
let agentOpen = false;
let agentDragging = false;
let agentMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let dragRect: DOMRect | null = null;
let homeSuggestOpen = true;

// 未对话前的推荐问题（点击可直接提问；对话后按后端 suggested_questions 实时更新）
const HOME_INITIAL_SUGGESTS = [t("q1"), t("q2"), t("q3"), t("q4"), t("q5")];

// 推荐问题区折叠状态：通过发送框右侧的向上箭头圆形图标展开/收起
function setHomeSuggestOpen(open: boolean, hasTalked: boolean) {
  homeSuggestOpen = open;
  homeSuggestBtn.setAttribute("aria-expanded", String(open));
  homeSuggests.hidden = !open;
}

function renderHomeSuggests(questions: string[]) {
  homeSuggestsList.innerHTML = "";
  // 引导讲解与推荐问题合并：推荐区第一项固定为「引导讲解」
  const guideChip = document.createElement("button");
  guideChip.type = "button";
  guideChip.className = "home-suggest-chip home-suggest-guide";
  guideChip.textContent = t("suggest_guide");
  guideChip.addEventListener("click", () => void guideTour());
  homeSuggestsList.appendChild(guideChip);
  // 动态推荐问题
  questions.slice(0, 4).forEach((q) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "home-suggest-chip";
    chip.textContent = q;
    chip.addEventListener("click", () => void askHomeAgent(q));
    homeSuggestsList.appendChild(chip);
  });
}

function resetHomeChat() {
  // 只保留 AI 助手给出的开头引导话，清理用户第一次提问及后续的全部对话内容
  const first = homeChat.querySelector<HTMLDivElement>(".home-msg.bot");
  homeChat.innerHTML = "";
  if (first) {
    homeChat.appendChild(first);
  }
  renderHomeSuggests(HOME_INITIAL_SUGGESTS);
  // 回到首次未提问状态：直接展开推荐问题
  setHomeSuggestOpen(true, false);
}

function setAgentOpen(open: boolean) {
  agentOpen = open;
  homePanel.hidden = !open;
  if (open) {
    // 尚未提问过（欢迎语不算对话）时展开展示初始推荐问题
    if (!homeChat.querySelector(".home-msg.user")) {
      renderHomeSuggests(HOME_INITIAL_SUGGESTS);
      setHomeSuggestOpen(true, false);
    }
    // 面板出现在悬浮球上方：跟随悬浮球当前位置
    syncPanelToAgent();
  }
}

// 让对话窗口跟随悬浮球（面板位于圆球正上方）
function syncPanelToAgent() {
  const rect = homeAgent.getBoundingClientRect();
  homePanel.style.left = "";
  homePanel.style.top = "";
  homePanel.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`;
  homePanel.style.bottom = `${window.innerHeight - rect.top + 14}px`;
}

// 折叠态圆球拖拽：拖动改变位置；位移小于阈值视为点击（弹出对话窗口）
function bindAgentDrag() {
  homeAgent.addEventListener("pointerdown", (event) => {
    agentDragging = true;
    agentMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragRect = homeAgent.getBoundingClientRect();
    homeAgent.setPointerCapture(event.pointerId);
  });

  homeAgent.addEventListener("pointermove", (event) => {
    if (!agentDragging || !dragRect) {
      return;
    }
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      agentMoved = true;
    }
    if (agentMoved) {
      homeAgent.style.left = `${Math.min(Math.max(dragRect.left + dx, 8), window.innerWidth - dragRect.width - 8)}px`;
      homeAgent.style.top = `${Math.min(Math.max(dragRect.top + dy, 8), window.innerHeight - dragRect.height - 8)}px`;
      homeAgent.style.right = "auto";
      homeAgent.style.bottom = "auto";
      if (agentOpen) {
        syncPanelToAgent();
      }
    }
  });

  homeAgent.addEventListener("pointerup", () => {
    if (!agentDragging) {
      return;
    }
    agentDragging = false;
    dragRect = null;
    if (!agentMoved) {
      setAgentOpen(!agentOpen);
    }
  });

  homeClose.addEventListener("click", () => setAgentOpen(false));
  homeNew.addEventListener("click", resetHomeChat);
  homeSuggestBtn.addEventListener("click", () => setHomeSuggestOpen(!homeSuggestOpen, true));
}

function appendHomeBubble(role: "bot" | "user", text: string) {
  const bubble = document.createElement("div");
  bubble.className = `home-msg ${role}`;
  bubble.innerHTML = `<span class="home-avatar">${role === "bot" ? t("agent_role") : t("me")}</span>
    <span class="home-bubble">${escapeHtml(text)}</span>`;
  homeChat.appendChild(bubble);
  homeChat.scrollTop = homeChat.scrollHeight;
}

function appendHomeHint(text: string) {
  const div = document.createElement("div");
  div.className = "home-sys";
  div.textContent = text;
  homeChat.appendChild(div);
  homeChat.scrollTop = homeChat.scrollHeight;
}

async function homeApi<T = unknown>(question: string): Promise<T> {
  const response = await fetch(`${AGENT_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, style: "classic" }),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Agent 服务返回 HTTP ${response.status}`);
  }
  return data;
}

async function askHomeAgent(question: string) {
  if (!question.trim()) {
    return;
  }
  appendHomeBubble("user", question);
  homeQuestion.value = "";
  try {
    const reply = await homeApi<{ answer: string; suggested_questions?: string[] }>(question);
    appendHomeBubble("bot", reply.answer);
    // 按对话内容实时更新推荐问题（更新后折叠为上拉箭头，不占用聊天空间）
    if (Array.isArray(reply.suggested_questions) && reply.suggested_questions.length > 0) {
      renderHomeSuggests(reply.suggested_questions);
    }
    setHomeSuggestOpen(false, true);
  } catch (error) {
    appendHomeHint(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function guideTour() {
  if (!agentReady) {
    appendHomeHint("⚠️ 讲解 Agent 未连接，请先启动 agent_bi 服务（端口 8300）。");
    return;
  }
  await askHomeAgent("请作为博物馆讲解员，先向我介绍一下这座博物馆，再推荐一条合理的参观路线。");
}

async function initHomeAgent() {
  bindAgentDrag();
  try {
    const response = await fetch(`${AGENT_BASE}/api/knowledge`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    agentReady = true;
    homeStatus.textContent = t("agent_status_ok");
    appendHomeBubble("bot", t("agent_welcome"));
  } catch {
    agentReady = false;
    homeStatus.textContent = t("agent_status_fail");
    appendHomeHint(`⚠️ ${t("agent_status_fail")}（${AGENT_BASE}）。请先在 agent_bi/agent/museum-agent 目录运行 python server.py。`);
  }
}

homeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void askHomeAgent(homeQuestion.value);
});

// ---------- 首页藏品概览：文物图片拼接墙（无文字说明，点击进入完整图鉴） ----------

const SHOWCASE_IDS = [
  "cn-bronze-gong",
  "cn-boshanlu",
  "cn-porcelain-vase",
  "cn-cosmic-buddha",
  "cn-sanxingdui-mask",
  "triceratops",
];

const showcaseGrid = mustQuery<HTMLDivElement>("#showcase-grid");
const showcaseLoading = mustQuery<HTMLDivElement>("#showcase-loading");

// 藏品概览图片缓存：渲染结果写入 localStorage，再次打开直接使用缓存，不再重复渲染
const SHOWCASE_CACHE_KEY = "huaxia-showcase-v4";

function loadShowcaseCache(): Partial<Record<string, string>> | null {
  try {
    const raw = localStorage.getItem(SHOWCASE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<Record<string, string>>;
  } catch {
    return null;
  }
}

function saveShowcaseCache(cache: Partial<Record<string, string>>) {
  try {
    localStorage.setItem(SHOWCASE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 存储空间不足时忽略：下次打开重新渲染即可
  }
}

// 离屏渲染器：逐件渲染文物模型并截图为图片，供拼接墙展示；透明背景，由页面 CSS 底色透出
const scRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
scRenderer.setPixelRatio(1);
scRenderer.setSize(400, 400, false);
const scScene = new THREE.Scene();
scScene.background = null;
const scCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
scCamera.position.set(0, 0.7, 4.2);
scCamera.lookAt(0, 0, 0);

scScene.add(
  new THREE.HemisphereLight("#ffffff", "#cbb27e", 1.35),
  (() => {
    const light = new THREE.DirectionalLight("#fff2d8", 2.4);
    light.position.set(3, 5, 4);
    return light;
  })(),
  (() => {
    const light = new THREE.DirectionalLight("#ffe6f0", 1.1);
    light.position.set(-3, 1, -4);
    return light;
  })(),
);

const scGround = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 48),
  new THREE.ShadowMaterial({ color: 0x8a6a20, opacity: 0.22 }),
);
scGround.rotation.x = -Math.PI / 2;
scGround.position.y = -0.92;
scScene.add(scGround);

const scGltfLoader = new GLTFLoader();
const scDraco = new DRACOLoader();
scDraco.setDecoderPath("/echo/draco/");
scGltfLoader.setDRACOLoader(scDraco);

function fitShowcaseModel(model: THREE.Group) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  // 模型最大边 2.1 世界单位：相机可视高度约 2.93，四周保留约 14% 留白，保证完整入画
  const scale = maxDim > 0 ? 2.1 / maxDim : 1;
  model.scale.setScalar(scale);
  // 统一摆放：水平居中（x/z 归零），底部对齐到地面阴影上方（阴影在 y=-0.92）
  model.position.x = -center.x * scale;
  model.position.z = -center.z * scale;
  model.position.y = -(center.y - size.y / 2) * scale - 0.82;
}

function renderShowcaseShot(model: THREE.Group): string {
  scScene.add(model);
  scRenderer.render(scScene, scCamera);
  // PNG 保留透明通道，使背景完全由页面 CSS 控制，避免出现色块边框
  const dataUrl = scRenderer.domElement.toDataURL("image/png");
  scScene.remove(model);
  return dataUrl;
}

function appendShowcaseCell(artifact: WorldArtifact, dataUrl: string | null) {
  const cell = document.createElement("div");
  cell.className = "showcase-cell";
  cell.title = artifact.name;
  if (dataUrl) {
    cell.innerHTML = `<img src="${dataUrl}" alt="${escapeHtml(artifact.name)}" loading="lazy" /><span class="cell-frame" aria-hidden="true"></span>`;
  } else {
    // 加载失败/超时占位：淡金底 + 鼎形剪影，无文字
    cell.classList.add("placeholder");
    cell.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M18 12 h12 l-4 5 h-4 z" />
      <rect x="14" y="17" width="20" height="9" />
      <path d="M14 24 c5 4 10 5 10 5 s5 -1 10 -5 v3 c0 5 -7 8 -10 8 s-10 -3 -10 -8 z" />
      <rect x="11" y="17" width="4" height="8" />
      <rect x="33" y="17" width="4" height="8" />
    </svg><span class="cell-frame" aria-hidden="true"></span>`;
  }
  cell.addEventListener("click", () => {
    // 跳转到文物详情页（馆藏图鉴点击文物后进入的详情页）
    window.location.href = `/gallerydistract.html?id=${encodeURIComponent(artifact.id)}`;
  });
  showcaseGrid.appendChild(cell);
}

function loadWithTimeout<T>(loader: (resolve: (value: T) => void, reject: (error: unknown) => void) => void, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    loader(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function initShowcase() {
  const items = SHOWCASE_IDS
    .map((id) => worldArtifacts.find((item) => item.id === id))
    .filter((item): item is WorldArtifact => Boolean(item));
  // 读取后端保存的模型视角配置（模型视角调整工作台）
  let modelViews: Record<string, unknown> = {};
  try {
    const resp = await fetch(`${AGENT_BASE}/api/model-views`, { cache: "no-store" });
    if (resp.ok) modelViews = await resp.json();
  } catch (e) {
    console.warn("无法读取模型视角配置，使用默认视角:", e);
  }
  const cache = loadShowcaseCache();
  const cachedCount = items.filter((item) => Boolean(cache?.[item.id])).length;
  // 全部命中缓存：直接展示稳定画面，跳过 3D 渲染
  if (cache && cachedCount === items.length) {
    for (const artifact of items) {
      appendShowcaseCell(artifact, cache[artifact.id] ?? null);
    }
    return;
  }
  showcaseLoading.hidden = false;
  let done = 0;
  for (const artifact of items) {
    done += 1;
    showcaseLoading.textContent = t("sc_loading", { a: done, b: items.length });
    const cached = cache?.[artifact.id];
    if (cached) {
      appendShowcaseCell(artifact, cached);
      continue;
    }
    try {
      const gltf = await loadWithTimeout<THREE.Group>((resolve, reject) => {
        scGltfLoader.load(artifact.model, (data) => resolve(data.scene), undefined, reject);
      }, 12000);
      // 应用自定义视角（有配置时覆盖默认适配）
      const view = (modelViews as Record<string, any>)[artifact.id];
      if (view) {
        const box = new THREE.Box3().setFromObject(gltf);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fitScale = maxDim > 0 ? 2.1 / maxDim : 1;
        gltf.rotation.y = THREE.MathUtils.degToRad(Number(view.rotationY ?? 0));
        gltf.scale.setScalar((Number(view.scale ?? 1)) * fitScale);
        gltf.position.set(
          Number(view.posX ?? 0),
          Number(view.posY ?? 0),
          Number(view.posZ ?? 0),
        );
        const az = THREE.MathUtils.degToRad(Number(view.camAzimuth ?? 0));
        const pol = THREE.MathUtils.degToRad(Number(view.camPolar ?? 75));
        const dist = Number(view.camDistance ?? 4.2);
        scCamera.position.setFromSphericalCoords(dist, pol, az);
        scCamera.lookAt(0, 0.45, 0);
      } else {
        fitShowcaseModel(gltf);
        scCamera.position.set(0, 0.9, 4.2);
        scCamera.lookAt(0, 0.45, 0);
      }
      const shot = renderShowcaseShot(gltf);
      gltf.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((material) => material.dispose());
        }
      });
      appendShowcaseCell(artifact, shot);
      if (cache) {
        cache[artifact.id] = shot;
      }
    } catch {
      // 单个模型加载失败或超时：以占位剪影呈现，不阻塞其余藏品
      appendShowcaseCell(artifact, null);
    }
  }
  saveShowcaseCache(cache ?? {});
  showcaseLoading.hidden = true;
}

// ---------- 场馆介绍：仿故宫数字馆的展品数量动态加载效果 ----------

function animateCount(el: HTMLElement, target: number, duration = 1500) {
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function initVenueStats() {
  const nums = document.querySelectorAll<HTMLElement>(".venue-num");
  if (!nums.length) {
    return;
  }
  // 首个统计动态取实际数字化展品数（worldArtifacts.length），与图鉴全量保持一致
  const first = nums[0];
  const total = worldArtifacts.length;
  first.setAttribute("data-count", String(total));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          nums.forEach((el) => {
            const target = Number(el.getAttribute("data-count") || 0);
            animateCount(el, target);
          });
          io.disconnect();
        });
      },
      { threshold: 0.3 },
    );
    io.observe(first.parentElement ?? first);
  } else {
    nums.forEach((el) => {
      el.textContent = el.getAttribute("data-count") || "0";
    });
  }
}

// ---------- 场馆介绍：六馆真实文物代表封面（仿故宫官网"专馆"板块，以真实文物渲染图替代图标） ----------

const CENTER_FEATURED = new Set([
  "siyangfangzun",
  "matafeiyan",
  "shuochangtaoyong",
  "cn-ding-censer",
]);

// 展品 → 图鉴主题（与 gallery.ts 口径一致）
function themeOfArtifact(item: WorldArtifact): string {
  if (CENTER_FEATURED.has(item.id)) {
    return "center";
  }
  const cat = item.category ?? "";
  if (cat.includes("示例展品")) {
    return "tech";
  }
  if (cat.includes("青铜") || cat === "铜器") {
    return "bronze";
  }
  if (cat.includes("瓷器") || cat === "景泰蓝") {
    return "porcelain";
  }
  if (cat.includes("石窟") || cat.includes("佛教") || cat.includes("木雕造像")) {
    return "buddhist";
  }
  if (item.group === "heritage") {
    return "world";
  }
  if (
    cat.includes("古生物") ||
    cat.includes("自然标本") ||
    cat.includes("海洋贝类") ||
    cat.includes("珊瑚") ||
    cat.includes("植物") ||
    cat.includes("史前艺术") ||
    cat.includes("天体")
  ) {
    return "nature";
  }
  return "center";
}

const VENUE_THEMES = ["bronze", "porcelain", "buddhist", "world", "nature", "tech"] as const;

// 六馆封面指定代表文物（真实文物渲染图）
const VENUE_COVER_IDS: Record<string, string> = {
  bronze: "cn-bronze-fangyi", // 青铜方彝
  porcelain: "cn-ding-censer", // 景泰蓝瓶炉
  buddhist: "cn-water-moon-guanyin", // 水月观音像
  world: "tree-of-life", // 生命之树
  nature: "triceratops", // 三角龙化石
  tech: "damaged-helmet", // 受损头盔（科技体验）
};

const VENUE_COVER_CACHE_KEY = "huaxia-venue-covers-v8";

function loadVenueCovers(): Partial<Record<string, string>> | null {
  try {
    const raw = localStorage.getItem(VENUE_COVER_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<Record<string, string>>;
  } catch {
    return null;
  }
}

function saveVenueCovers(cache: Partial<Record<string, string>>) {
  try {
    localStorage.setItem(VENUE_COVER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 存储空间不足时忽略
  }
}

// 渲染六馆代表文物封面：优先使用 VENUE_COVER_IDS 指定文物；模型并行加载、截图串行渲染，缓存后不再重复加载
async function renderVenueCovers() {
  const covers = document.querySelectorAll<HTMLImageElement>(".venue-cover");
  if (!covers.length) {
    return;
  }
  const cache = loadVenueCovers();
  const pending: { img: HTMLImageElement; artifact: WorldArtifact }[] = [];
  for (const img of covers) {
    const themeId = img.dataset.theme ?? "";
    const artifact =
      worldArtifacts.find((item) => item.id === (VENUE_COVER_IDS[themeId] ?? "")) ??
      worldArtifacts.find((item) => themeOfArtifact(item) === themeId);
    if (!artifact) {
      continue;
    }
    const cached = cache?.[themeId];
    if (cached) {
      img.src = cached;
      img.hidden = false;
      continue;
    }
    pending.push({ img, artifact });
  }
  if (!pending.length) {
    return;
  }
  // 并行加载全部模型（网络/解码并行），再串行渲染截图，整体耗时显著缩短
  const groups = await Promise.all(
    pending.map(({ artifact }) =>
      loadWithTimeout<THREE.Group>(
        (resolve, reject) => {
          scGltfLoader.load(artifact.model, (data) => resolve(data.scene), undefined, reject);
        },
        20000,
      ).then(
        (gltf) => ({ gltf }),
        () => null,
      ),
    ),
  );
  for (let i = 0; i < pending.length; i += 1) {
    const group = groups[i];
    if (!group) {
      continue;
    }
    try {
      fitShowcaseModel(group.gltf);
      // 封面比概览略放大（不空旷），并整体略下移：顶部多留白，保证佛像等立件顶部（如佛头）完整露出
      group.gltf.scale.multiplyScalar(1.18);
      group.gltf.position.y -= 0.14;
      const shot = renderShowcaseShot(group.gltf);
      group.gltf.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((material) => material.dispose());
        }
      });
      pending[i].img.src = shot;
      pending[i].img.hidden = false;
      if (cache) {
        cache[pending[i].img.dataset.theme ?? ""] = shot;
      }
    } catch {
      // 渲染失败：保留原剪影图标，不阻塞其余场馆
    }
  }
  saveVenueCovers(cache ?? {});
}

async function bootstrap() {
  void initHomeAgent();
  initShowcase();
  initVenueStats();
  void renderVenueCovers();
}

void bootstrap();
