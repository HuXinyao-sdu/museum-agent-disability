// 展品清单（public/artifact_list.json）的加载接口，
// 以及点击文物时向对话 Agent 服务暴露文物名称的预留接口。

import type { WorldArtifact } from "./worldArtifacts";

// 对接对话 Agent 服务的回调签名：点击文物时携带文物名称字符串。
export type ArtifactSelectionHandler = (name: string) => void;

declare global {
  interface Window {
    museum?: {
      // 最近一次被点击的文物名称，例如「四羊方尊」。
      selectedArtifactName: string | null;
      // 预留回调：后续对话 Agent 服务可直接赋值，例如
      // window.museum.onArtifactSelected = (name) => { agent.send(name); };
      onArtifactSelected: ArtifactSelectionHandler | null;
    };
  }
}

// 清单里的单个展品，字段可缺省，缺失项由 normalize 补齐。
type ManifestEntry = Partial<WorldArtifact> & { name: string; model: string };

/**
 * 页面启动时自动读取 public/artifact_list.json。
 * 支持两种清单格式：顶层数组，或包含 `artifacts` 字段的对象。
 * 展品由 main.ts 依据 category / group 归入对应展区。
 */
export async function fetchArtifactManifest(url = "/artifact_list.json"): Promise<WorldArtifact[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  const list = Array.isArray(data) ? data : (data as { artifacts?: unknown }).artifacts;
  if (!Array.isArray(list)) {
    throw new Error("缺少 artifacts 数组");
  }
  return (list as ManifestEntry[]).map(normalizeManifestArtifact);
}

function normalizeManifestArtifact(raw: ManifestEntry): WorldArtifact {
  return {
    id: raw.id ?? raw.name,
    name: raw.name,
    nameEn: raw.nameEn ?? "",
    museum: raw.museum ?? "",
    origin: raw.origin ?? "",
    period: raw.period ?? "",
    category: raw.category ?? "馆藏展品",
    group: raw.group ?? "china",
    placement: raw.placement,
    description: raw.description ?? "",
    highlight: raw.highlight ?? raw.description ?? "",
    model: raw.model,
    modelCredit: raw.modelCredit ?? "",
  };
}

/**
 * 点击文物时调用：把文物名称字符串暴露给外部（对话 Agent 服务）。
 * 暴露方式一：window.museum.selectedArtifactName 与 window.museum.onArtifactSelected 回调；
 * 暴露方式二：派发 DOM 自定义事件 "museum:artifact-selected"，detail 携带 { name }。
 */
export function publishArtifactSelection(name: string): string {
  const museum = (window.museum ??= { selectedArtifactName: null, onArtifactSelected: null });
  museum.selectedArtifactName = name;

  window.dispatchEvent(
    new CustomEvent<{ name: string }>("museum:artifact-selected", {
      detail: { name },
    }),
  );

  museum.onArtifactSelected?.(name);
  return name;
}
