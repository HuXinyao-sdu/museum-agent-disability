import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { worldArtifacts, type WorldArtifact } from "./worldArtifacts";
import { fetchArtifactManifest, publishArtifactSelection } from "./artifactManifest";
import { initAgentSidebar, syncArtifactToAgent } from "./agentBridge";
import "./styles.css";

function mustQuery<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

type Exhibit = {
  artifact: WorldArtifact;
  hall: Hall;
  accent: string;
  container: THREE.Group;
  position: THREE.Vector3;
  view: THREE.Vector3;
  loaded: boolean;
  loading: boolean;
};

type Hall = {
  id: string;
  name: string;
  template: string;
  position: THREE.Vector3;
  accent: string;
};

const canvas = mustQuery<HTMLCanvasElement>("#museum-canvas");
const exhibitList = mustQuery<HTMLDivElement>("#exhibit-list");
const currentHall = mustQuery<HTMLParagraphElement>("#current-hall");
const loadStatus = mustQuery<HTMLParagraphElement>("#load-status");
const infoTitle = mustQuery<HTMLHeadingElement>("#info-title");
const infoCopy = mustQuery<HTMLParagraphElement>("#info-copy");
const tourToggle = mustQuery<HTMLButtonElement>("#tour-toggle");
const lightToggle = mustQuery<HTMLButtonElement>("#light-toggle");
const resetView = mustQuery<HTMLButtonElement>("#reset-view");
const guideToggle = mustQuery<HTMLButtonElement>("#guide-toggle");
const guideMask = mustQuery<HTMLDivElement>("#guide-mask");
const guideClose = mustQuery<HTMLButtonElement>("#guide-close");
const agentSidebar = mustQuery<HTMLElement>("#agent-sidebar");
const agentToggle = mustQuery<HTMLButtonElement>("#agent-toggle");
const agentClose = mustQuery<HTMLButtonElement>("#agent-close");
const infoRead = mustQuery<HTMLButtonElement>("#info-read");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101419");
scene.fog = new THREE.Fog("#101419", 46, 96);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/echo/draco/");
gltfLoader.setDRACOLoader(dracoLoader);

let lastFrameTime = performance.now();
let elapsedTime = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerStart = new THREE.Vector2();
const selectable = new Map<THREE.Object3D, Exhibit>();

const halls: Hall[] = [
  { id: "bronze", name: "青铜器馆", template: "T_pannels_minimalist.glb", position: new THREE.Vector3(-26, 0, 0), accent: "#f1c365" },
  { id: "porcelain", name: "瓷器馆", template: "T_pannels_minimalist.glb", position: new THREE.Vector3(26, 0, 0), accent: "#d9b66e" },
  { id: "world", name: "世界文明馆", template: "T_nopannels_minimalist.glb", position: new THREE.Vector3(0, 0, -28), accent: "#7ccfbd" },
  { id: "nature", name: "自然标本馆", template: "T_pannels_minimalist.glb", position: new THREE.Vector3(0, 0, 28), accent: "#9db3ff" },
  { id: "buddhist", name: "石窟佛教造像馆", template: "T_small_minimalist.glb", position: new THREE.Vector3(26, 0, 28), accent: "#df8a5f" },
];

const lobbyHall: Hall = { id: "lobby", name: "中央中庭", template: "T_root_minimalist.glb", position: new THREE.Vector3(0, 0, 0), accent: "#e7c06b" };
const museumBounds = { width: 68, depth: 70 };

const roomGroup = new THREE.Group();
const exhibitGroup = new THREE.Group();
scene.add(roomGroup, exhibitGroup);

const orbit = {
  target: new THREE.Vector3(0, 1.4, 0),
  desiredTarget: new THREE.Vector3(0, 1.4, 0),
  theta: Math.PI * 0.18,
  phi: Math.PI * 0.38,
  radius: 48,
  desiredTheta: Math.PI * 0.18,
  desiredPhi: Math.PI * 0.38,
  desiredRadius: 44,
  dragging: false,
};

const paletteByGroup: Record<string, string> = {
  china: "#f1c365",
  world: "#7ccfbd",
  nature: "#9db3ff",
  demo: "#df8a5f",
};

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: "#d0c2a4", roughness: 0.84, metalness: 0.02 }),
  aisle: new THREE.MeshStandardMaterial({ color: "#566167", roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#202932", roughness: 0.78, transparent: true, opacity: 0.2, depthWrite: false }),
  trim: new THREE.MeshStandardMaterial({ color: "#8b6f45", roughness: 0.5, metalness: 0.08 }),
  plinth: new THREE.MeshStandardMaterial({ color: "#d7d0c2", roughness: 0.66 }),
  rail: new THREE.MeshStandardMaterial({ color: "#7f735e", roughness: 0.62, metalness: 0.08 }),
};

const sun = new THREE.DirectionalLight("#fff2d0", 2.25);
sun.position.set(-24, 28, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

const ambient = new THREE.HemisphereLight("#cdd6ff", "#282016", 1.25);
scene.add(ambient);

const fillLight = new THREE.DirectionalLight("#f6fbff", 2.1);
fillLight.position.set(22, 12, 18);
scene.add(fillLight);

const warmSpots: THREE.SpotLight[] = [];

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3Tuple, cast = true) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.castShadow = cast;
  item.receiveShadow = true;
  return item;
}

function resizeRenderer() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function loadVenueTemplate(hall: Hall) {
  gltfLoader.load(`/venue/openvgal/templates/${hall.template}`, (gltf) => {
    const room = gltf.scene;
    // 展柜外壳：OpenVGAL 房间模板里的半透明白色结构（墙、面板、展台等）全部移除，
    // 只保留应用自行创建的文物模型、底座与名称标签。
    const shells: THREE.Object3D[] = [];
    room.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        shells.push(child);
      }
    });
    shells.forEach((child) => child.removeFromParent());
    roomGroup.add(room);
  });
}

function buildMuseumShell() {
  loadVenueTemplate(lobbyHall);
  halls.forEach(loadVenueTemplate);

  const corridors = [
    { position: [0, 0.02, 0] as THREE.Vector3Tuple, size: [58, 0.06, 4.2] as THREE.Vector3Tuple },
    { position: [0, 0.025, 0] as THREE.Vector3Tuple, size: [4.2, 0.06, 60] as THREE.Vector3Tuple },
    { position: [13, 0.03, 14] as THREE.Vector3Tuple, size: [30, 0.06, 4.2] as THREE.Vector3Tuple },
  ];

  corridors.forEach(({ position, size }) => {
    roomGroup.add(mesh(new THREE.BoxGeometry(...size), materials.aisle, position, false));
  });

  const floor = mesh(new THREE.BoxGeometry(museumBounds.width, 0.08, museumBounds.depth), materials.floor, [0, -0.19, 0], false);
  floor.material = new THREE.MeshStandardMaterial({ color: "#bfb59f", roughness: 0.9, transparent: true, opacity: 0.16, depthWrite: false });
  roomGroup.add(floor);

  for (const hall of [lobbyHall, ...halls]) {
    const sign = makeLabel(hall.name, hall.id === "lobby" ? "总览入口" : "分馆陈列", hall.accent);
    sign.position.copy(hall.position).add(new THREE.Vector3(0, 3.6, -7));
    sign.scale.set(3.2, 0.8, 1);
    roomGroup.add(sign);
  }
}

function addSpot(position: THREE.Vector3Tuple, target: THREE.Vector3Tuple, color: string) {
  const spot = new THREE.SpotLight(color, 15, 24, Math.PI * 0.12, 0.44, 1.7);
  spot.position.set(...position);
  spot.target.position.set(...target);
  spot.castShadow = true;
  scene.add(spot, spot.target);
  warmSpots.push(spot);
}

function makeLabel(text: string, subtitle: string, accent: string) {
  const labelCanvas = document.createElement("canvas");
  const context = labelCanvas.getContext("2d");
  if (!context) {
    throw new Error("Label canvas is not available.");
  }

  labelCanvas.width = 640;
  labelCanvas.height = 160;
  context.fillStyle = "rgba(14, 16, 20, 0.84)";
  context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 14, labelCanvas.height);
  context.fillStyle = "#f7f4ec";
  context.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillText(text.slice(0, 11), 42, 70);
  context.fillStyle = "#aeb8c4";
  context.font = '400 25px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillText(subtitle.slice(0, 16), 42, 118);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.95, 0.49, 1);
  return sprite;
}

function makePlaceholder(accent: string, baseY = 1.35) {
  const group = new THREE.Group();
  group.userData.kind = "placeholder";
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.95, 0.12),
    new THREE.MeshStandardMaterial({ color: "#56656a", roughness: 0.4, transparent: true, opacity: 0.82 }),
  );
  glass.position.set(0, baseY, 0);
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.055, 0.14), new THREE.MeshBasicMaterial({ color: accent }));
  line.position.set(0, baseY + 0.01, 0.08);
  group.add(glass, line);
  return group;
}

// 展品 → 分区。按文物类型分区：
//   bronze    青铜器（含铜器）——大展区
//   porcelain 瓷器
//   buddhist  石窟 / 佛教造像
//   nature    古生物 · 自然标本
//   world     世界文明海外文物（heritage）
//   center    中央中庭：香具、木雕、史前艺术、天体、植物、陶俑、景泰蓝、示例展品等少量类别
function zoneForArtifact(artifact: WorldArtifact): string {
  const category = artifact.category;
  if (category.includes("青铜") || category === "铜器") return "bronze";
  if (category.includes("瓷器")) return "porcelain";
  if (category.includes("石窟") || category.includes("佛教")) return "buddhist";
  if (category.includes("古生物") || category.includes("自然标本") || category.includes("海洋贝类") || category.includes("珊瑚")) return "nature";
  if (artifact.group === "heritage") return "world";
  return "center";
}

const zoneHallMap: Record<string, Hall> = {
  bronze: halls.find((hall) => hall.id === "bronze") ?? halls[0],
  porcelain: halls.find((hall) => hall.id === "porcelain") ?? halls[0],
  buddhist: halls.find((hall) => hall.id === "buddhist") ?? halls[0],
  nature: halls.find((hall) => hall.id === "nature") ?? halls[0],
  world: halls.find((hall) => hall.id === "world") ?? halls[0],
};

// 每个分区的展品总数（用于网格居中），在布局前统计。
const zoneTotals = new Map<string, number>();
const zoneCounters = new Map<string, number>();

function registerZones(artifacts: WorldArtifact[]) {
  zoneTotals.clear();
  zoneCounters.clear();
  for (const artifact of artifacts) {
    const zone = zoneForArtifact(artifact);
    zoneTotals.set(zone, (zoneTotals.get(zone) ?? 0) + 1);
  }
}

// 展区内的网格排布：列优先、行列居中，相邻展品间距 >= 4.3，走道不受遮挡。
function gridPosition(order: number, total: number) {
  const columns = total > 9 ? 4 : 3;
  const col = order % columns;
  const row = Math.floor(order / columns);
  const rows = Math.ceil(total / columns);
  const x = (col - (columns - 1) / 2) * 4.5;
  const z = (row - (rows - 1) / 2) * 4.3;
  return new THREE.Vector3(x, 0, z);
}

// 中央中庭排布：四个象限各放一组 2×2 展位（共 16 槽，用 15），
// 中央十字走道与东北走道保持畅通，相邻展品间距 >= 3.8。
function centerPosition(order: number) {
  const quadrant = order % 4;          // 0=NE 1=NW 2=SW 3=SE
  const slot = Math.floor(order / 4);  // 0..3
  const signX = quadrant === 1 || quadrant === 2 ? -1 : 1;
  const signZ = quadrant === 2 || quadrant === 3 ? -1 : 1;
  const near = 4.0;
  const far = 7.8;
  const x = signX * (slot % 2 === 0 ? near : far);
  const z = signZ * (slot < 2 ? near : far);
  return new THREE.Vector3(x, 0, z);
}

function positionForArtifact(artifact: WorldArtifact) {
  const zone = zoneForArtifact(artifact);
  const order = zoneCounters.get(zone) ?? 0;
  zoneCounters.set(zone, order + 1);
  const total = zoneTotals.get(zone) ?? 1;
  if (zone === "center") {
    return { hall: lobbyHall, position: centerPosition(order) };
  }
  const hall = zoneHallMap[zone];
  return { hall, position: hall.position.clone().add(gridPosition(order, total)) };
}

function normalizeModel(model: THREE.Object3D, baseHeight: number) {
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxSize = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  const scale = 3.25 / maxSize;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += baseHeight - box.min.y;
}

function visibleMaterial(material: THREE.Material, accent: string) {
  const source = material as THREE.MeshStandardMaterial;
  const base = source.color instanceof THREE.Color ? source.color.clone() : new THREE.Color(accent);
  base.lerp(new THREE.Color("#f1dec0"), 0.28);
  const visible = new THREE.MeshBasicMaterial({
    color: base,
    map: source.map ?? null,
    side: THREE.DoubleSide,
  });
  visible.needsUpdate = true;
  return visible;
}

// 移除 glb 内包裹模型的白色罩子/背板等占位网格（无贴图的 Cube/Box/Plane 等），
// 避免其影响自动缩放包围盒，并保持展品外观统一。
function stripPlaceholderMeshes(model: THREE.Object3D) {
  const toRemove: THREE.Mesh[] = [];
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const hasTexture = (material as THREE.MeshStandardMaterial).map != null;
    if (isPlaceholderName(child.name) && !hasTexture) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((child) => child.removeFromParent());
}

function isPlaceholderName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "cube" ||
    normalized === "box" ||
    normalized === "plane" ||
    normalized === "backdrop" ||
    normalized === "background" ||
    normalized === "grid"
  );
}

function prepareModel(model: THREE.Object3D, exhibit: Exhibit) {
  model.visible = true;
  stripPlaceholderMeshes(model);
  // 无底座：模型底部直接落在地面（y≈0.05）。
  normalizeModel(model, 0.05);
  model.traverse((child) => {
    child.visible = true;
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => visibleMaterial(material, exhibit.accent))
        : visibleMaterial(child.material, exhibit.accent);
      selectable.set(child, exhibit);
    }
  });
}

function describeModel(model: THREE.Object3D) {
  let meshCount = 0;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount += 1;
    }
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  return `${meshCount}:${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
}

function createExhibit(artifact: WorldArtifact, index: number): Exhibit {
  const { hall, position } = positionForArtifact(artifact);
  const accent = hall.accent || paletteByGroup[artifact.group] || "#f1c365";
  const container = new THREE.Group();
  container.position.copy(position);

  // 全部展品不设底座，模型直接放置场景地面。
  const placeholder = makePlaceholder(accent, 0.55);
  const label = makeLabel(artifact.name, artifact.category, accent);
  label.position.set(0, 0.34, 1.5);

  container.add(placeholder, label);
  exhibitGroup.add(container);

  const exhibit: Exhibit = {
    artifact,
    hall,
    accent,
    container,
    position,
    view: new THREE.Vector3(position.x + 4.4, 3.3, position.z + 5.6),
    loaded: false,
    loading: false,
  };

  container.traverse((child) => selectable.set(child, exhibit));
  return exhibit;
}

let exhibits: Exhibit[] = [];
let activeExhibit: Exhibit | null = null;
let nightMode = false;
let autoTour = false;
let tourIndex = 0;
let tourTimer = 0;
let loadedCount = 0;
let failedCount = 0;

function setLoadStatus() {
  loadStatus.textContent = `已摆入 ${loadedCount}/${exhibits.length} 件模型${failedCount ? `，${failedCount} 件待重试` : ""}`;
  currentHall.textContent = activeExhibit
    ? `${activeExhibit.hall.name} · ${activeExhibit.artifact.category}`
    : `${exhibits.length} 件展品陈列中`;
}

function loadArtifact(exhibit: Exhibit) {
  if (exhibit.loaded || exhibit.loading) {
    return;
  }

  exhibit.loading = true;
  gltfLoader.load(
    exhibit.artifact.model,
    (gltf) => {
      const model = gltf.scene;
      prepareModel(model, exhibit);
      document.body.dataset.lastModel = `${exhibit.artifact.name}:${describeModel(model)}`;
      const placeholder = exhibit.container.children.find((child) => child.userData.kind === "placeholder");
      if (placeholder) {
        exhibit.container.remove(placeholder);
      }
      exhibit.container.add(model);
      exhibit.loaded = true;
      exhibit.loading = false;
      loadedCount += 1;
      setLoadStatus();
      if (exhibit === activeExhibit) {
        updateUi(exhibit);
      }
    },
    undefined,
    () => {
      exhibit.loading = false;
      failedCount += 1;
      setLoadStatus();
    },
  );
}

async function loadAllArtifacts() {
  const queue = [...exhibits];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await new Promise<void>((resolve) => {
        if (next.loaded || next.loading) {
          resolve();
          return;
        }
        next.loading = true;
        gltfLoader.load(
          next.artifact.model,
          (gltf) => {
            const model = gltf.scene;
            prepareModel(model, next);
            document.body.dataset.lastModel = `${next.artifact.name}:${describeModel(model)}`;
            const placeholder = next.container.children.find((child) => child.userData.kind === "placeholder");
            if (placeholder) {
              next.container.remove(placeholder);
            }
            next.container.add(model);
            next.loaded = true;
            next.loading = false;
            loadedCount += 1;
            setLoadStatus();
            if (next === activeExhibit) {
              updateUi(next);
            }
            resolve();
          },
          undefined,
          () => {
            next.loading = false;
            failedCount += 1;
            setLoadStatus();
            resolve();
          },
        );
      });
    }
  });
  await Promise.all(workers);
}

function setCameraFromOrbit() {
  const sinPhi = Math.sin(orbit.phi);
  const x = orbit.target.x + orbit.radius * sinPhi * Math.sin(orbit.theta);
  const y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
  const z = orbit.target.z + orbit.radius * sinPhi * Math.cos(orbit.theta);
  camera.position.set(x, y, z);
  camera.lookAt(orbit.target);
}

function updateUi(exhibit: Exhibit | null) {
  document.querySelectorAll(".exhibit-button").forEach((button) => {
    button.classList.toggle("active", exhibit !== null && (button as HTMLButtonElement).dataset.id === exhibit.artifact.id);
  });
  if (!exhibit) {
    currentHall.textContent = `${exhibits.length} 件展品陈列中`;
    infoTitle.textContent = "请选择展品";
    infoCopy.textContent = "点击展厅中的文物模型或左侧列表，查看文物名称与简介。";
    return;
  }
  const activeBox = new THREE.Box3().setFromObject(exhibit.container);
  const activeSize = activeBox.getSize(new THREE.Vector3());
  const activeCenter = activeBox.getCenter(new THREE.Vector3());
  let activeMeshes = 0;
  exhibit.container.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      activeMeshes += 1;
    }
  });
  document.body.dataset.activeBox = `${activeCenter.x.toFixed(2)},${activeCenter.y.toFixed(2)},${activeCenter.z.toFixed(2)}|${activeSize.x.toFixed(2)},${activeSize.y.toFixed(2)},${activeSize.z.toFixed(2)}`;
  document.body.dataset.activeMeshes = String(activeMeshes);
  document.body.dataset.activeLoaded = String(exhibit.loaded);
  currentHall.textContent = `${exhibit.hall.name} · ${exhibit.artifact.category}`;
  infoTitle.textContent = exhibit.artifact.name;
  infoCopy.textContent = `${exhibit.artifact.description} 看点：${exhibit.artifact.highlight}`;
}

function focusExhibit(exhibit: Exhibit) {
  activeExhibit = exhibit;
  stopReading();
  const focusTarget = exhibit.position.clone().add(new THREE.Vector3(-3.2, 1.45, 0));
  const offset = exhibit.view.clone().sub(focusTarget);
  orbit.desiredTarget.copy(focusTarget);
  orbit.desiredRadius = THREE.MathUtils.clamp(offset.length(), 6, 15);
  orbit.desiredTheta = Math.atan2(offset.x, offset.z);
  orbit.desiredPhi = Math.acos(THREE.MathUtils.clamp(offset.y / orbit.desiredRadius, -0.8, 0.86));
  loadArtifact(exhibit);
  updateUi(exhibit);
  publishArtifactSelection(exhibit.artifact.name);
  syncArtifactToAgent(exhibit.artifact);
}

function resetGalleryView() {
  activeExhibit = null;
  orbit.desiredTarget.set(0, 1.5, 0);
  orbit.desiredTheta = Math.PI * 0.18;
  orbit.desiredPhi = Math.PI * 0.4;
  orbit.desiredRadius = Math.max(museumBounds.width, museumBounds.depth) * 0.64;
  updateUi(null);
  syncArtifactToAgent(null);
  stopReading();
}

let reading = false;

function stopReading() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  reading = false;
  infoRead.textContent = "🔊 朗读";
  infoRead.classList.remove("reading");
}

// 语音朗读：点击「朗读」按钮朗读当前文物的名称与介绍，再次点击停止。
function readArtifactIntro() {
  if (reading) {
    stopReading();
    return;
  }
  if (!activeExhibit) {
    return;
  }
  if (!("speechSynthesis" in window)) {
    infoRead.textContent = "⚠ 不支持";
    return;
  }
  const text = `${infoTitle.textContent}。${infoCopy.textContent}`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  utterance.onend = stopReading;
  utterance.onerror = stopReading;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  reading = true;
  infoRead.textContent = "⏹ 停止";
  infoRead.classList.add("reading");
}

// 侧边栏默认隐藏，点击右侧「智能导览」按钮唤起 / 收起。
function setAgentSidebarOpen(open: boolean) {
  agentSidebar.classList.toggle("open", open);
  agentToggle.classList.toggle("open", open);
}

function toggleAgentSidebar() {
  setAgentSidebarOpen(!agentSidebar.classList.contains("open"));
}

function toggleLight() {
  nightMode = !nightMode;
  lightToggle.classList.toggle("active", nightMode);
  scene.background = new THREE.Color(nightMode ? "#080b10" : "#101419");
  scene.fog = new THREE.Fog(nightMode ? "#080b10" : "#101419", 42, nightMode ? 76 : 96);
}

function toggleTour() {
  autoTour = !autoTour;
  tourToggle.classList.toggle("active", autoTour);
  tourToggle.textContent = autoTour ? "Ⅱ" : "▶";
  tourTimer = 0;
}

function setGuideOpen(open: boolean) {
  guideMask.hidden = !open;
  guideToggle.setAttribute("aria-expanded", String(open));
  guideToggle.classList.toggle("active", open);
}

function buildSidebar() {
  for (const [index, exhibit] of exhibits.entries()) {
    const button = document.createElement("button");
    button.className = "exhibit-button";
    button.type = "button";
    button.dataset.id = exhibit.artifact.id;
    button.innerHTML = `<span class="swatch" style="--accent:${exhibit.accent}"></span><span><span class="exhibit-name">${String(index + 1).padStart(2, "0")} · ${exhibit.artifact.name}</span><span class="exhibit-hall">${exhibit.hall.name} · ${exhibit.artifact.category}</span></span>`;
    button.addEventListener("click", () => focusExhibit(exhibit));
    exhibitList.appendChild(button);
  }
}

function bindEvents() {
  canvas.addEventListener("pointerdown", (event) => {
    orbit.dragging = true;
    pointerStart.set(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!orbit.dragging) {
      return;
    }
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart.set(event.clientX, event.clientY);
    orbit.desiredTheta -= dx * 0.006;
    orbit.desiredPhi = THREE.MathUtils.clamp(orbit.desiredPhi + dy * 0.004, 0.32, 1.34);
  });

  canvas.addEventListener("pointerup", (event) => {
    orbit.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("click", (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(Array.from(selectable.keys()), false);
    const found = hits.map((hit) => selectable.get(hit.object)).find(Boolean);
    if (found) {
      focusExhibit(found);
    }
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.desiredRadius = THREE.MathUtils.clamp(orbit.desiredRadius + event.deltaY * 0.02, 5.5, 68);
  });

  window.addEventListener("keydown", (event) => {
    const stride = event.shiftKey ? 1.7 : 0.72;
    if (event.key === "w" || event.key === "ArrowUp") orbit.desiredTarget.z -= stride;
    if (event.key === "s" || event.key === "ArrowDown") orbit.desiredTarget.z += stride;
    if (event.key === "a" || event.key === "ArrowLeft") orbit.desiredTarget.x -= stride;
    if (event.key === "d" || event.key === "ArrowRight") orbit.desiredTarget.x += stride;
    orbit.desiredTarget.x = THREE.MathUtils.clamp(orbit.desiredTarget.x, -museumBounds.width / 2 + 4, museumBounds.width / 2 - 4);
    orbit.desiredTarget.z = THREE.MathUtils.clamp(orbit.desiredTarget.z, -museumBounds.depth / 2 + 4, museumBounds.depth / 2 - 4);
  });

  tourToggle.addEventListener("click", toggleTour);
  lightToggle.addEventListener("click", toggleLight);
  resetView.addEventListener("click", resetGalleryView);
  guideToggle.addEventListener("click", () => setGuideOpen(true));
  guideClose.addEventListener("click", () => setGuideOpen(false));
  guideMask.addEventListener("click", (event) => {
    if (event.target === guideMask) {
      setGuideOpen(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setGuideOpen(false);
    }
  });
  agentToggle.addEventListener("click", toggleAgentSidebar);
  agentClose.addEventListener("click", () => setAgentSidebarOpen(false));
  infoRead.addEventListener("click", readArtifactIntro);
  window.addEventListener("resize", resizeRenderer);
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  elapsedTime += delta;

  orbit.target.lerp(orbit.desiredTarget, 0.075);
  orbit.theta = THREE.MathUtils.lerp(orbit.theta, orbit.desiredTheta, 0.08);
  orbit.phi = THREE.MathUtils.lerp(orbit.phi, orbit.desiredPhi, 0.08);
  orbit.radius = THREE.MathUtils.lerp(orbit.radius, orbit.desiredRadius, 0.08);

  exhibits.forEach((exhibit, index) => {
    const isActive = exhibit === activeExhibit;
    const targetScale = isActive ? 1.07 : 1;
    exhibit.container.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
    if (isActive && exhibit.loaded) {
      exhibit.container.rotation.y += delta * 0.18;
    } else {
      exhibit.container.rotation.y = THREE.MathUtils.lerp(exhibit.container.rotation.y, Math.sin(index) * 0.08, 0.02);
    }
  });

  if (autoTour) {
    tourTimer += delta;
    if (tourTimer > 4.6) {
      tourTimer = 0;
      tourIndex = (tourIndex + 1) % exhibits.length;
      focusExhibit(exhibits[tourIndex]);
    }
  }

  ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, nightMode ? 0.52 : 1.25, 0.04);
  sun.intensity = THREE.MathUtils.lerp(sun.intensity, nightMode ? 0.28 : 2.25, 0.04);
  fillLight.intensity = THREE.MathUtils.lerp(fillLight.intensity, nightMode ? 0.8 : 2.1, 0.04);
  warmSpots.forEach((spot, index) => {
    spot.intensity = THREE.MathUtils.lerp(spot.intensity, nightMode ? 20 + Math.sin(elapsedTime + index) * 2 : 14, 0.04);
  });

  setCameraFromOrbit();
  renderer.render(scene, camera);
}

async function bootstrap() {
  buildMuseumShell();
  initAgentSidebar();
  for (const hall of halls) {
    addSpot([hall.position.x - 5, 6.2, hall.position.z + 5], [hall.position.x, 1.2, hall.position.z], "#ffe2a3");
    addSpot([hall.position.x + 5, 6.2, hall.position.z - 5], [hall.position.x, 1.2, hall.position.z], "#d7ffe2");
  }
  addSpot([0, 7, 3.2], [0, 1.4, 0], "#ffe2a3");
  addSpot([0, 7, -3.2], [0, 1.4, 0], "#d7ffe2");

  let manifestArtifacts: WorldArtifact[] = [];
  try {
    loadStatus.classList.add("loading");
    loadStatus.textContent = "正在读取展品清单 artifact_list.json…";
    manifestArtifacts = await fetchArtifactManifest();
  } catch (error) {
    loadStatus.classList.remove("loading");
    loadStatus.classList.add("error");
    loadStatus.textContent = `展品清单加载失败：${error instanceof Error ? error.message : String(error)}`;
  }

  const allArtifacts = [...worldArtifacts, ...manifestArtifacts];
  registerZones(allArtifacts);
  exhibits = allArtifacts.map(createExhibit);
  buildSidebar();
  bindEvents();
  resetGalleryView();
  loadArtifact(exhibits[0]);
  void loadAllArtifacts();
  animate();
}

void bootstrap();
