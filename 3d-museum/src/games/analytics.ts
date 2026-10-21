// 数据埋点：每局记录完成率、用时、重试次数，落 localStorage 并打 console，
// 供后续回流知识库与关卡迭代使用（本次为前端本地埋点，预留后端上报接口）。

const KEY = "huaxia-games-metrics";

export type RunRecord = {
  gameId: string;
  difficulty: string;
  completed: boolean;
  timeSec: number;
  steps: number;
  retries: number;
  score: number;
  at: number;
};

export function recordRun(record: Omit<RunRecord, "at">) {
  const entry: RunRecord = { ...record, at: Date.now() };
  try {
    const raw = localStorage.getItem(KEY);
    const list: RunRecord[] = raw ? (JSON.parse(raw) as RunRecord[]) : [];
    list.push(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
  } catch {
    // 忽略存储异常
  }
  // 埋点回流：这里预留上报钩子，当前仅打印到控制台。
  console.info("[game-metric]", entry);
}

export function getMetrics(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}
