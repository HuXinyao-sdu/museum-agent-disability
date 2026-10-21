// 瓷器 3D 拼图（P0）：加载一件瓷器 GLB，把它的几何体沿竖直方向真正切开成
// 若干段（口沿—颈—腹—足底），每段是一块独立的「碎片」（几何体级切片 + 顶点插值），
// 打散后由用户拖回中央复原。自动吸附 + 半透明虚影结构提示 + 「器物完整度」进度；
// WebGL 不可用或加载失败时自动降级为 2D 分段排序。
//
// 说明：这里不再依赖 material.clippingPlanes（裁剪面是「世界空间」的，碎片一旦
// 被平移就会整块裁错），而是在 CPU 端把三角面真正裁进每一段的高度区间，生成
// 独立几何体，因此每一块天然就是不同的碎片。

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GameContext, GameModule } from "./types";
import { PORCELAIN_INFO } from "./data";
import { el, shuffle, shake } from "./dom";

// 候选瓷器模型（按顺序尝试，加载失败回退下一个）
const MODEL_CANDIDATES = ["/echo/assets/models/cn-porcelain-baluster-vase.bin", "/my_art/zhongshitaocijingtailanpinglu.glb"];

const TARGET_H = 4; // 归一化后的瓷瓶高度（世界单位）
const SNAP_RADIUS = 0.55;

type SliceVertex = { pos: THREE.Vector3; normal: THREE.Vector3; uv: THREE.Vector2 };

// 把一段高度区间 [bandBottom, bandTop] 内的三角面裁出来，返回独立几何体。
// 顶点法线与 UV 随位置一起插值，保证纹理在碎片断口处连续。
function sliceGeometry(source: THREE.BufferGeometry, bandBottom: number, bandTop: number): THREE.BufferGeometry {
  const nonIndexed = source.toNonIndexed();
  const posAttr = nonIndexed.getAttribute("position") as THREE.BufferAttribute;
  const normalAttr = nonIndexed.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const uvAttr = nonIndexed.getAttribute("uv") as THREE.BufferAttribute | undefined;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const EPS = 1e-5;

  const read = (i: number): SliceVertex => ({
    pos: new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)),
    normal: normalAttr
      ? new THREE.Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i))
      : new THREE.Vector3(0, 1, 0),
    uv: uvAttr ? new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)) : new THREE.Vector2(0, 0),
  });

  const lerpV = (a: SliceVertex, b: SliceVertex, t: number): SliceVertex => ({
    pos: a.pos.clone().lerp(b.pos, t),
    normal: a.normal.clone().lerp(b.normal, t).normalize(),
    uv: a.uv.clone().lerp(b.uv, t),
  });

  // Sutherland–Hodgman：裁掉 y < y 的部分（保留 y >= y）
  const clipMinY = (poly: SliceVertex[], y: number): SliceVertex[] => {
    const out: SliceVertex[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a.pos.y >= y - EPS;
      const bIn = b.pos.y >= y - EPS;
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(lerpV(a, b, (y - a.pos.y) / (b.pos.y - a.pos.y)));
    }
    return out;
  };

  // Sutherland–Hodgman：裁掉 y > y 的部分（保留 y <= y）
  const clipMaxY = (poly: SliceVertex[], y: number): SliceVertex[] => {
    const out: SliceVertex[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a.pos.y <= y + EPS;
      const bIn = b.pos.y <= y + EPS;
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(lerpV(a, b, (y - a.pos.y) / (b.pos.y - a.pos.y)));
    }
    return out;
  };

  const push = (v: SliceVertex) => {
    positions.push(v.pos.x, v.pos.y, v.pos.z);
    normals.push(v.normal.x, v.normal.y, v.normal.z);
    uvs.push(v.uv.x, v.uv.y);
  };

  const count = posAttr.count;
  for (let i = 0; i < count; i += 3) {
    let poly = clipMinY([read(i), read(i + 1), read(i + 2)], bandBottom);
    if (poly.length < 3) continue;
    poly = clipMaxY(poly, bandTop);
    if (poly.length < 3) continue;
    for (let j = 1; j + 1 < poly.length; j += 1) {
      push(poly[0]);
      push(poly[j]);
      push(poly[j + 1]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export const puzzle3dGame: GameModule = {
  id: "puzzle3d",
  mount(ctx) {
    const root = ctx.root;
    const pieceCount = ctx.config.pieceCount; // 难度控碎片数

    // WebGL 不可用：降级为 2D 分段排序
    if (typeof WebGLRenderingContext === "undefined" || !window.WebGLRenderingContext) {
      return mount2DFallback(ctx, pieceCount);
    }

    root.innerHTML = "";
    const wrap = el("div", "p3d-wrap");
    const canvas = el("canvas", "p3d-canvas");
    const overlay = el("div", "p3d-overlay", "正在准备瓷片…");
    wrap.append(canvas, overlay);
    root.appendChild(wrap);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(
      new THREE.HemisphereLight("#fff3e0", "#7a5f33", 1.3),
      (() => {
        const l = new THREE.DirectionalLight("#ffe9c4", 2.2);
        l.position.set(4, 6, 5);
        return l;
      })(),
      (() => {
        const l = new THREE.DirectionalLight("#ffffff", 1.0);
        l.position.set(-4, 2, -5);
        return l;
      })(),
    );

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const spherical = { radius: 6.8, theta: 0.6, phi: 1.12 };

    const raycaster = new THREE.Raycaster();
    // 拖动平面：水平桌面 y=0，碎片只在水平面内平移（不改变其在瓶身上的高度）
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();

    const gltfLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/echo/draco/");
    gltfLoader.setDRACOLoader(draco);

    let ghost: THREE.Group | null = null;
    const pieces: { group: THREE.Group; home: THREE.Vector3; locked: boolean }[] = [];

    let draggingPiece: (typeof pieces)[number] | null = null;
    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    let completed = 0;
    let drags = 0;
    let disposed = false;
    let rafId = 0;

    function resize() {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function applyCamera() {
      camera.position.set(
        spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
        spherical.radius * Math.cos(spherical.phi),
        spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      );
      camera.lookAt(0, 0, 0);
    }

    // 把模型归一化：中心对齐原点、竖直方向缩放到 TARGET_H，变换烤进几何体，
    // 之后所有网格使用单位变换，方便按世界坐标切段。
    function bakeNormalize(model: THREE.Group): THREE.Mesh[] {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = TARGET_H / size.y;
      const normalize = new THREE.Matrix4()
        .makeTranslation(-s * center.x, -s * center.y, -s * center.z)
        .multiply(new THREE.Matrix4().makeScale(s, s, s));

      const meshes: THREE.Mesh[] = [];
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        meshes.push(mesh);
      });
      model.updateMatrixWorld(true);
      return meshes;
    }

    function makeGhost(meshes: THREE.Mesh[]): THREE.Group {
      const g = new THREE.Group();
      meshes.forEach((mesh) => {
        const m = new THREE.Mesh(
          mesh.geometry,
          new THREE.MeshBasicMaterial({ color: 0x8a6a20, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
        );
        g.add(m);
      });
      return g;
    }

    function setupModel(model: THREE.Group) {
      const srcMeshes = bakeNormalize(model);
      ghost = makeGhost(srcMeshes);
      scene.add(ghost);

      const bandH = TARGET_H / pieceCount;
      for (let i = 0; i < pieceCount; i += 1) {
        const top = TARGET_H / 2 - i * bandH;
        const bottom = top - bandH;

        const piece = new THREE.Group();
        srcMeshes.forEach((src) => {
          const geo = sliceGeometry(src.geometry, bottom, top);
          if (geo.getAttribute("position").count === 0) return;
          const mat = (Array.isArray(src.material) ? src.material[0] : src.material).clone();
          mat.side = THREE.DoubleSide;
          piece.add(new THREE.Mesh(geo, mat));
        });

        // 在水平面内打散（保持各自在瓶身上的高度），不改变 y
        const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.6;
        const radius = 2.2 + Math.random() * 1.1;
        piece.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        scene.add(piece);
        pieces.push({ group: piece, home: new THREE.Vector3(0, 0, 0), locked: false });
      }
      overlay.remove();
    }

    function setPointerFromEvent(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    }

    function pickPiece(event: PointerEvent) {
      raycaster.setFromCamera(setPointerFromEvent(event), camera);
      const groupTargets = pieces.filter((p) => !p.locked).map((p) => p.group);
      const hits = raycaster.intersectObjects(groupTargets, true);
      if (!hits.length) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        const found = pieces.find((p) => p.group === obj);
        if (found) return found;
        obj = obj.parent;
      }
      return null;
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      draggingPiece = pickPiece(event);
      if (draggingPiece) {
        drags += 1;
        canvas.setPointerCapture(event.pointerId);
      } else {
        orbiting = true;
      }
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerMove(event: PointerEvent) {
      if (draggingPiece) {
        raycaster.setFromCamera(setPointerFromEvent(event), camera);
        if (raycaster.ray.intersectPlane(dragPlane, hit)) {
          draggingPiece.group.position.x = hit.x;
          draggingPiece.group.position.z = hit.z;
          draggingPiece.group.position.y = 0;
        }
        return;
      }
      if (orbiting) {
        spherical.theta -= (event.clientX - lastX) * 0.006;
        spherical.phi = Math.max(0.25, Math.min(1.85, spherical.phi - (event.clientY - lastY) * 0.006));
        lastX = event.clientX;
        lastY = event.clientY;
        applyCamera();
      }
    }

    function onPointerUp() {
      if (draggingPiece) {
        const p = draggingPiece;
        const dist = Math.hypot(p.group.position.x, p.group.position.z);
        if (dist < SNAP_RADIUS) {
          p.group.position.set(0, 0, 0);
          p.locked = true;
          completed += 1;
          ctx.addStep();
          ctx.reportProgress(completed / pieceCount);
          if (completed === pieceCount) {
            ctx.reportProgress(1);
            window.setTimeout(() => {
              ctx.finish({
                score: Math.max(20, 100 - drags * 4),
                unlocks: [
                  `${PORCELAIN_INFO.name} · ${PORCELAIN_INFO.period}｜釉色：${PORCELAIN_INFO.glaze}｜窑口：${PORCELAIN_INFO.kiln}｜工艺：${PORCELAIN_INFO.craft}`,
                  `${PORCELAIN_INFO.shard.title}：${PORCELAIN_INFO.shard.body}`,
                ],
                badge: "first-repair",
              });
            }, 500);
          }
        } else {
          ctx.hint("把瓷片拖到中央虚影处，与轮廓对齐即可自动吸附。");
        }
        draggingPiece = null;
      }
      orbiting = false;
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      spherical.radius = Math.max(3.5, Math.min(14, spherical.radius + event.deltaY * 0.012));
      applyCamera();
    }

    function animate() {
      if (disposed) return;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }

    async function load() {
      let lastErr: unknown = null;
      for (const url of MODEL_CANDIDATES) {
        try {
          const gltf = await gltfLoader.loadAsync(url);
          setupModel(gltf.scene as THREE.Group);
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      console.warn("[puzzle3d] 3D 模型加载失败，降级 2D", lastErr);
      dispose();
      root.innerHTML = "";
      mount2DFallback(ctx, pieceCount);
    }

    function dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => (m as THREE.Material).dispose());
        }
      });
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);

    resize();
    applyCamera();
    animate();
    void load();

    return () => {
      dispose();
      root.innerHTML = "";
    };
  },
};

// 2D 降级：口沿—颈—腹—足底 分段排序（点击卡片按自上而下顺序放入槽位）。
function mount2DFallback(ctx: GameContext, pieceCount: number): () => void {
  const root = ctx.root;
  const names = ["口沿", "颈", "腹", "足底"];
  const order = names.slice(0, Math.min(pieceCount, names.length));
  const shuffled = shuffle(order);
  let step = 0;
  let wrong = 0;

  root.innerHTML = "";
  const board = el("div", "g-board");
  board.appendChild(el("p", "g-board-hint", "（2D 模式）把瓷瓶自上而下：口沿 → 颈 → 腹 → 足底，按顺序点选拼回。"));

  const slots = el("div", "g-casting-slots");
  for (let i = 0; i < order.length; i += 1) {
    const slot = el("div", "g-casting-slot");
    slot.appendChild(el("span", "g-casting-slot-no", String(i + 1)));
    slot.appendChild(el("span", "g-casting-slot-name", "？"));
    slots.appendChild(slot);
  }
  board.appendChild(slots);

  const cards = el("div", "g-casting-cards");
  shuffled.forEach((name) => {
    const btn = el("button", "g-casting-card", name);
    btn.addEventListener("click", () => {
      const idx = order.indexOf(name);
      if (idx === step) {
        const slotName = slots.children[step]?.querySelector<HTMLElement>(".g-casting-slot-name");
        if (slotName) {
          slotName.textContent = name;
          slotName.classList.add("filled");
        }
        btn.classList.add("done");
        btn.disabled = true;
        step += 1;
        ctx.addStep();
        ctx.reportProgress(step / order.length);
        if (step === order.length) {
          window.setTimeout(() => {
            ctx.finish({
              score: Math.max(10, 100 - wrong * 10),
              unlocks: [
                `${PORCELAIN_INFO.name} · ${PORCELAIN_INFO.period}｜釉色：${PORCELAIN_INFO.glaze}｜窑口：${PORCELAIN_INFO.kiln}｜工艺：${PORCELAIN_INFO.craft}`,
                `${PORCELAIN_INFO.shard.title}：${PORCELAIN_INFO.shard.body}`,
              ],
              badge: "first-repair",
            });
          }, 300);
        }
      } else {
        wrong += 1;
        ctx.addStep();
        shake(btn);
        ctx.hint(`这一块是「${name}」，应该放在瓷瓶的相应位置。`);
      }
    });
    cards.appendChild(btn);
  });
  board.appendChild(cards);
  root.appendChild(board);

  return () => {
    root.innerHTML = "";
  };
}
