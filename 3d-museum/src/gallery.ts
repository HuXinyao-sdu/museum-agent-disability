// 国风首页脚本：
//   1) 馆藏文物图鉴：左侧「图鉴主题」侧边栏，点击主题切换该主题的三维文物陈列；
//      右侧为三维模型高清展示 + 文物介绍，左右箭头与缩略导航点在本主题内切换文物。
//   2) "假如文物会说话"：图鉴信息卡可点击进入居中对话面板，文物以第一人称自我介绍，
//      游客可与文物连续对话（走 agent_bi 大模型问答）。
//   3) 首页讲解 Agent：默认收起为豆包式可拖动悬浮球；点击展开提问小窗，
//      点右上角 ✕ 收起回到悬浮球模式。
//
// 说明：只对接 agent_bi 的 REST 接口，不修改 agent_bi 内部代码。

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { worldArtifacts, type WorldArtifact } from "./worldArtifacts";
import { t } from "./lang";

const AGENT_BASE = "http://localhost:8300";

// 图鉴条目统一使用 WorldArtifact（worldArtifacts.ts 52 件 + artifact_list.json 7 件，共 59 件）
type Artifact = WorldArtifact & { group?: string };

// 图鉴主题（与展厅主题展区对应）。全部馆藏按主题归位，每个主题均有三维展品。
type GalleryTheme = {
  id: string;
  name: string;
  glyph: string;
  sub: string;
};

const THEMES: GalleryTheme[] = [
  { id: "center", name: "中央大厅", glyph: "宝", sub: "镇馆之宝" },
  { id: "bronze", name: "青铜礼乐馆", glyph: "鼎", sub: "青铜重器" },
  { id: "porcelain", name: "瓷韵千年馆", glyph: "瓷", sub: "珐琅瓷器" },
  { id: "buddhist", name: "佛光庄严馆", glyph: "佛", sub: "石窟造像" },
  { id: "world", name: "世界文明馆", glyph: "丝", sub: "丝路文明" },
  { id: "nature", name: "自然与宇宙馆", glyph: "宙", sub: "自然标本" },
  { id: "tech", name: "科技体验馆", glyph: "技", sub: "数字体验" },
];

// 中央大厅的镇馆之宝（独立于分类）
const CENTER_FEATURED = new Set([
  "siyangfangzun",
  "matafeiyan",
  "shuochangtaoyong",
  "cn-ding-censer",
]);

// 展品 → 图鉴主题（与展厅 5 馆分区口径一致）
function themeOfArtifact(artifact: Artifact): string {
  if (CENTER_FEATURED.has(artifact.id)) {
    return "center";
  }
  const cat = artifact.category ?? "";
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
  if (artifact.group === "heritage") {
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

// 兜底：worldArtifacts 本地数据本身即完整清单，远端 manifest 加载失败时也不会缺展品
function toArtifact(item: WorldArtifact): Artifact {
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn ?? "",
    museum: item.museum ?? "",
    origin: item.origin ?? "",
    period: item.period ?? "",
    category: item.category ?? "",
    group: item.group ?? "",
    description: item.description ?? "",
    highlight: item.highlight ?? "",
    model: item.model ?? "",
    modelCredit: item.modelCredit ?? "",
  };
}

function mustQuery<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

function escapeHtml(value: string): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

async function loadArtifacts(): Promise<Artifact[]> {
  // 全量馆藏：worldArtifacts.ts 52 件 + artifact_list.json 7 件
  const builtin = worldArtifacts.map(toArtifact);
  try {
    const response = await fetch("/artifact_list.json", { cache: "no-store" });
    const data = (await response.json()) as WorldArtifact[] | { artifacts: WorldArtifact[] };
    const list = Array.isArray(data) ? data : data.artifacts;
    if (Array.isArray(list) && list.length > 0) {
      const extra = list.map(toArtifact);
      const extraIds = new Set(extra.map((a) => a.id));
      // 展厅内置展品在前，my_art 展品在后；id 去重避免重复
      return [...builtin.filter((a) => !extraIds.has(a.id)), ...extra];
    }
  } catch {
    // 忽略，使用内置全量展品
  }
  return builtin;
}

// 由分类推断"质地工艺"展示文案（图鉴信息卡第四项）
function craftFor(artifact: Artifact): string {
  const cat = artifact.category;
  if (cat.includes("景泰蓝")) {
    return "铜胎掐丝珐琅";
  }
  if (cat.includes("陶")) {
    return "灰陶 · 手塑彩绘";
  }
  if (cat.includes("铜")) {
    return "青铜范铸 · 鎏金工艺";
  }
  return cat || "传统工艺";
}

// ---------- 图鉴主题侧边栏 ----------

const themeListEl = mustQuery<HTMLUListElement>("#theme-list");
const themeNameEl = mustQuery<HTMLElement>("#gallery-theme-name");

function themeCount(artifacts: Artifact[], themeId: string): number {
  return artifacts.filter((artifact) => themeOfArtifact(artifact) === themeId).length;
}

function buildThemeSidebar(artifacts: Artifact[]) {
  themeListEl.innerHTML = THEMES.map(
    (theme) => `
      <li>
        <button type="button" class="theme-item" data-theme="${theme.id}" aria-label="浏览${theme.name}">
          <span class="theme-glyph" aria-hidden="true">${theme.glyph}</span>
          <span class="theme-info">
            <span class="theme-name">${theme.name}</span>
            <span class="theme-count">${theme.sub} · ${themeCount(artifacts, theme.id)} 件</span>
          </span>
        </button>
      </li>`,
  ).join("");
  themeListEl.querySelectorAll<HTMLButtonElement>(".theme-item").forEach((button) => {
    button.addEventListener("click", () => {
      themeListEl.querySelectorAll<HTMLButtonElement>(".theme-item").forEach((b) => b.classList.toggle("active", b === button));
      switchTheme(button.dataset.theme ?? "center");
    });
  });
}

// ---------- 馆藏文物图鉴（三维展示，按主题切换） ----------

const galleryCanvas = mustQuery<HTMLCanvasElement>("#gallery-canvas");
const galleryLoading = mustQuery<HTMLDivElement>("#gallery-loading");
const galleryEmpty = mustQuery<HTMLDivElement>("#gallery-empty");
const galleryIndexEl = mustQuery<HTMLElement>("#gallery-index");
const galleryTotalEl = mustQuery<HTMLElement>("#gallery-total");
const galleryDots = mustQuery<HTMLDivElement>("#gallery-dots");
const galleryPrev = mustQuery<HTMLButtonElement>("#gallery-prev");
const galleryNext = mustQuery<HTMLButtonElement>("#gallery-next");

const gInfo = {
  cat: mustQuery<HTMLElement>("#g-info-cat"),
  name: mustQuery<HTMLElement>("#g-info-name"),
  en: mustQuery<HTMLElement>("#g-info-en"),
  period: mustQuery<HTMLElement>("#g-info-period"),
  origin: mustQuery<HTMLElement>("#g-info-origin"),
  museum: mustQuery<HTMLElement>("#g-info-museum"),
  craft: mustQuery<HTMLElement>("#g-info-craft"),
  highlight: mustQuery<HTMLElement>("#g-info-highlight"),
  desc: mustQuery<HTMLElement>("#g-info-desc"),
};

const gTalkButton = mustQuery<HTMLButtonElement>("#gallery-talk");
const gTalkName = mustQuery<HTMLSpanElement>("#g-talk-name");

let allArtifacts: Artifact[] = [];
let galleryList: Artifact[] = [];
let galleryIndex = 0;
let loadToken = 0;
let currentModel: THREE.Group | null = null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(new THREE.Color("#efe3c4"), 1);
renderer.shadowMap.enabled = false;
galleryCanvas.replaceWith(renderer.domElement);
renderer.domElement.id = "gallery-canvas";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.display = "block";
renderer.domElement.style.touchAction = "none";

const galleryScene = new THREE.Scene();
galleryScene.background = new THREE.Color("#efe3c4");

const galleryCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
galleryCamera.position.set(0, 1.6, 7.2);

const galleryControls = new OrbitControls(galleryCamera, renderer.domElement);
galleryControls.enableDamping = true;
galleryControls.dampingFactor = 0.08;
galleryControls.autoRotate = true;
galleryControls.autoRotateSpeed = 1.6;
galleryControls.enablePan = false;
galleryControls.minDistance = 3.2;
galleryControls.maxDistance = 16;

// 暖色陈列灯光：主光 + 环境光 + 补光，凸显纹饰立体感
const gallerySceneLight = {
  hemi: new THREE.HemisphereLight("#fff3e0", "#7a5f33", 1.15),
  key: new THREE.DirectionalLight("#ffe9c4", 2.4),
  fill: new THREE.DirectionalLight("#ffffff", 1.0),
};
gallerySceneLight.key.position.set(4, 6, 5);
gallerySceneLight.fill.position.set(-4, 2, -5);
galleryScene.add(gallerySceneLight.hemi, gallerySceneLight.key, gallerySceneLight.fill);

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/echo/draco/");
gltfLoader.setDRACOLoader(dracoLoader);

// 展示衬垫：牛皮纸展台上的柔和投影线
const groundShadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.9, 48),
  new THREE.MeshBasicMaterial({
    color: 0x8a6a20,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
);
groundShadow.rotation.x = -Math.PI / 2;
groundShadow.position.y = -0.02;
galleryScene.add(groundShadow);

function resizeGallery() {
  const container = renderer.domElement.parentElement;
  if (!container) {
    return;
  }
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);
  galleryCamera.aspect = width / height;
  galleryCamera.updateProjectionMatrix();
}

function fitModelToView(model: THREE.Group) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = 3.4;
  const scale = target / maxDim;
  model.scale.multiplyScalar(scale);
  // 底部落于展台（y=0），水平方向居中
  model.position.x = -center.x * scale;
  model.position.y = -box.min.y * scale;
  model.position.z = -center.z * scale;
}

function disposeModel(model: THREE.Group | null) {
  if (!model) {
    return;
  }
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        const mat = material as THREE.Material & { map?: THREE.Texture | null };
        mat.map?.dispose();
        mat.dispose();
      });
    }
  });
  galleryScene.remove(model);
}

function updateGalleryInfo(artifact: Artifact) {
  gInfo.cat.textContent = artifact.category;
  gInfo.name.textContent = artifact.name;
  gInfo.en.textContent = artifact.nameEn;
  gInfo.period.textContent = artifact.period;
  gInfo.origin.textContent = artifact.origin;
  gInfo.museum.textContent = artifact.museum;
  gInfo.craft.textContent = craftFor(artifact);
  gInfo.highlight.textContent = artifact.highlight;
  gInfo.desc.textContent = artifact.description;
  gTalkName.textContent = artifact.name;
  galleryIndexEl.textContent = String(galleryIndex + 1);
  galleryTotalEl.textContent = String(galleryList.length);
  galleryDots.querySelectorAll<HTMLButtonElement>(".gallery-dot").forEach((dot, index) => {
    dot.classList.toggle("active", index === galleryIndex);
  });
}

async function showGalleryArtifact(index: number) {
  const artifact = galleryList[index];
  if (!artifact) {
    return;
  }
  galleryIndex = index;
  updateGalleryInfo(artifact);

  const token = ++loadToken;
  galleryLoading.classList.remove("hide");
  galleryLoading.textContent = t("g_loading_name", { name: artifact.name });

  if (!artifact.model) {
    galleryLoading.textContent = "暂无三维模型";
    return;
  }

  try {
    const gltf = await gltfLoader.loadAsync(artifact.model);
    if (token !== loadToken) {
      // 用户已切换到其他文物，丢弃本次加载结果
      disposeModel(gltf.scene as THREE.Group);
      return;
    }
    disposeModel(currentModel);
    currentModel = gltf.scene as THREE.Group;
    fitModelToView(currentModel);
    galleryScene.add(currentModel);
    galleryCamera.position.set(0, 1.6, 7.2);
    galleryControls.target.set(0, 1.2, 0);
    galleryControls.update();
    if (token === loadToken) {
      galleryLoading.classList.add("hide");
    }
  } catch (error) {
    if (token === loadToken) {
      galleryLoading.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

function galleryGo(index: number) {
  if (!galleryList.length) {
    return;
  }
  const next = (index + galleryList.length) % galleryList.length;
  void showGalleryArtifact(next);
}

function buildGalleryDots() {
  galleryDots.innerHTML = galleryList
    .map(
      (artifact, index) =>
        `<button type="button" class="gallery-dot" data-index="${index}" title="${escapeHtml(artifact.name)}" aria-label="查看${escapeHtml(artifact.name)}"></button>`,
    )
    .join("");
  galleryDots.querySelectorAll<HTMLButtonElement>(".gallery-dot").forEach((dot) => {
    dot.addEventListener("click", () => galleryGo(Number(dot.dataset.index ?? 0)));
  });
}

function bindGalleryArrows() {
  galleryPrev.addEventListener("click", () => galleryGo(galleryIndex - 1));
  galleryNext.addEventListener("click", () => galleryGo(galleryIndex + 1));
}

// 空主题：显示"暂无三维展品"空态，隐藏箭头与导航点
function showEmptyTheme(theme: GalleryTheme) {
  disposeModel(currentModel);
  currentModel = null;
  galleryList = [];
  galleryIndex = 0;
  galleryEmpty.hidden = false;
  galleryLoading.classList.add("hide");
  galleryLoading.textContent = t("g_loading");
  galleryDots.innerHTML = "";
  galleryPrev.style.visibility = "hidden";
  galleryNext.style.visibility = "hidden";
  galleryIndexEl.textContent = "—";
  galleryTotalEl.textContent = "0";
  gInfo.cat.textContent = theme.name;
  gInfo.name.textContent = t("g_empty_name");
  gInfo.en.textContent = "Collection Coming Soon";
  gInfo.period.textContent = "—";
  gInfo.origin.textContent = "—";
  gInfo.museum.textContent = "—";
  gInfo.craft.textContent = "—";
  gInfo.highlight.textContent = t("g_empty_highlight");
  gInfo.desc.textContent = t("g_empty_desc");
}

function switchTheme(themeId: string) {
  const theme = THEMES.find((th) => th.id === themeId) ?? THEMES[0];
  themeNameEl.textContent = `${theme.name} · ${theme.sub}`;
  const list = allArtifacts.filter((artifact) => themeOfArtifact(artifact) === themeId);
  galleryList = list;
  galleryIndex = 0;
  if (!galleryList.length) {
    showEmptyTheme(theme);
    return;
  }
  galleryEmpty.hidden = true;
  galleryPrev.style.visibility = "visible";
  galleryNext.style.visibility = "visible";
  buildGalleryDots();
  void showGalleryArtifact(0);
}

function initGallery(artifacts: Artifact[]) {
  allArtifacts = artifacts;
  buildThemeSidebar(artifacts);
  bindGalleryArrows();
  resizeGallery();
  window.addEventListener("resize", resizeGallery);
  // 默认选中第一个主题（中央大厅）
  themeListEl.querySelector<HTMLButtonElement>(".theme-item")?.classList.add("active");
  switchTheme("center");
}

// 每帧：阻尼 + 自动旋转 + 渲染
function tickGallery() {
  galleryControls.update();
  renderer.render(galleryScene, galleryCamera);
  requestAnimationFrame(tickGallery);
}

// ---------- "假如文物会说话"：文物第一人称 AI 对话 ----------

const talkMask = mustQuery<HTMLDivElement>("#artifact-chat-mask");
const talkBody = mustQuery<HTMLDivElement>("#artifact-chat-body");
const talkForm = mustQuery<HTMLFormElement>("#artifact-chat-form");
const talkInput = mustQuery<HTMLInputElement>("#artifact-chat-input");
const talkClose = mustQuery<HTMLButtonElement>("#artifact-chat-close");
const talkSub = mustQuery<HTMLElement>("#artifact-chat-sub");
const talkSuggests = mustQuery<HTMLDivElement>("#artifact-suggests");
const talkSuggestsList = mustQuery<HTMLDivElement>("#artifact-suggests-list");

let talkArtifact: Artifact | null = null;
let talkHistory: { role: "user" | "assistant"; content: string }[] = [];
let talkBusy = false;

// 未对话前的推荐问题（点击可直接提问；对话后按后端 suggested_questions 实时更新）
const TALK_INITIAL_SUGGESTS = [
  "你是谁？来自哪个时代？",
  "你有什么特别的故事？",
  "你最想对现代人说什么？",
];

function renderTalkSuggests(questions: string[]) {
  talkSuggestsList.innerHTML = "";
  questions.slice(0, 3).forEach((q) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "artifact-suggest-chip";
    chip.textContent = q;
    chip.addEventListener("click", () => void askArtifactTalk(q));
    talkSuggestsList.appendChild(chip);
  });
  talkSuggests.hidden = false;
}

function appendTalkMsg(role: "bot" | "user", text: string) {
  const row = document.createElement("div");
  row.className = `artifact-msg ${role}`;
  row.innerHTML = `<span class="artifact-avatar">${role === "bot" ? t("g_talk_mark") : t("me")}</span>
    <span class="artifact-bubble">${escapeHtml(text)}</span>`;
  talkBody.appendChild(row);
  talkBody.scrollTop = talkBody.scrollHeight;
}

function appendTalkHint(text: string) {
  const div = document.createElement("div");
  div.className = "artifact-chat-sys";
  div.textContent = text;
  talkBody.appendChild(div);
  talkBody.scrollTop = talkBody.scrollHeight;
}

function openArtifactTalk(artifact: Artifact) {
  talkArtifact = artifact;
  talkHistory = [];
  talkSub.textContent = t("talk_sub_name", { name: artifact.name });
  talkBody.innerHTML = "";
  talkMask.hidden = false;
  renderTalkSuggests(TALK_INITIAL_SUGGESTS);
  appendTalkMsg("bot", `我是${artifact.name}，沉睡千年，如今与你相逢。你想听听我的故事吗？`);
  // 不再自动替用户提问：由用户自行输入或点击推荐问题提问
}

function closeArtifactTalk() {
  talkMask.hidden = true;
  talkArtifact = null;
  talkBody.innerHTML = "";
  talkSuggests.hidden = true;
}

async function askArtifactTalk(question: string) {
  const trimmed = question.trim();
  if (!trimmed || talkBusy || !talkArtifact) {
    return;
  }
  talkBusy = true;
  appendTalkMsg("user", trimmed);
  talkInput.value = "";
  try {
    const response = await fetch(`${AGENT_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: trimmed,
        role: talkArtifact.name,
        style: "classic",
        current_hall: talkArtifact.name,
        history: talkHistory,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      answer?: string;
      suggested_questions?: string[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || `Agent 服务返回 HTTP ${response.status}`);
    }
    const answer = data.answer ?? "";
    appendTalkMsg("bot", answer);
    talkHistory.push({ role: "user", content: trimmed });
    talkHistory.push({ role: "assistant", content: answer });
    // 只保留最近 6 轮
    if (talkHistory.length > 12) {
      talkHistory = talkHistory.slice(-12);
    }
    // 按对话内容实时更新推荐问题
    if (Array.isArray(data.suggested_questions) && data.suggested_questions.length > 0) {
      renderTalkSuggests(data.suggested_questions);
    }
  } catch (error) {
    appendTalkHint(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    talkBusy = false;
  }
}

gTalkButton.addEventListener("click", () => {
  const artifact = galleryList[galleryIndex];
  if (artifact) {
    openArtifactTalk(artifact);
  }
});
talkClose.addEventListener("click", closeArtifactTalk);
talkMask.addEventListener("click", (event) => {
  if (event.target === talkMask) {
    closeArtifactTalk();
  }
});
talkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void askArtifactTalk(talkInput.value);
});

// ---------- 启动：加载图鉴数据并渲染 ----------

// 解析 URL 参数实现首页跳转定位：
//   ?theme=<themeId> —— 定位到对应主题图鉴（首页场馆卡片）
//   ?id=<artifactId> —— 定位到该文物的图鉴页（首页藏品概览图片墙）
function applyGalleryLocation() {
  const params = new URLSearchParams(window.location.search);
  const themeId = params.get("theme");
  const artifactId = params.get("id");

  const selectTheme = (id: string) => {
    const btn = themeListEl.querySelector<HTMLButtonElement>(`.theme-item[data-theme="${id}"]`);
    themeListEl.querySelectorAll<HTMLButtonElement>(".theme-item").forEach((b) => b.classList.toggle("active", b === btn));
    switchTheme(id);
  };

  if (themeId && THEMES.some((th) => th.id === themeId)) {
    selectTheme(themeId);
  }

  if (artifactId) {
    const artifact = allArtifacts.find((a) => a.id === artifactId);
    if (artifact) {
      const targetTheme = themeOfArtifact(artifact);
      if (targetTheme !== themeId) {
        selectTheme(targetTheme);
      }
      const idx = galleryList.findIndex((a) => a.id === artifactId);
      if (idx >= 0) {
        galleryGo(idx);
      }
    }
  }
}

async function bootstrap() {
  const artifacts = await loadArtifacts();
  initGallery(artifacts);
  applyGalleryLocation();
  tickGallery();
}

void bootstrap();
