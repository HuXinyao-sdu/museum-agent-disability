// 成就与积分：徽章、积分、本地排行榜，全部持久化到 localStorage。
// 结算时由 shell 调用，前端本地闭环；后续可对接后端数据回流。

export type Badge = { id: string; name: string; desc: string; glyph: string; points: number };

export const BADGES: Badge[] = [
  { id: "first-repair", name: "首件修复", desc: "完成瓷器 3D 拼图", glyph: "瓷", points: 100 },
  { id: "bronze-master", name: "青铜大师", desc: "完成青铜铸造还原", glyph: "铸", points: 80 },
  { id: "scroll-complete", name: "长卷完璧", desc: "完成书画长卷拼接", glyph: "卷", points: 80 },
  { id: "motif-master", name: "纹饰通", desc: "完成纹饰配对", glyph: "纹", points: 60 },
  { id: "dynasty-master", name: "朝代通", desc: "完成年代排序", glyph: "序", points: 60 },
];

const BADGES_KEY = "huaxia-games-badges";
const POINTS_KEY = "huaxia-games-points";
const BEST_KEY = "huaxia-games-best";
const BOARD_KEY = "huaxia-games-board";

export type AchievementState = {
  badges: string[];
  points: number;
  best: Record<string, number>; // gameId -> 最高分
};

function loadState(): AchievementState {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    badges: read<string[]>(BADGES_KEY, []),
    points: read<number>(POINTS_KEY, 0),
    best: read<Record<string, number>>(BEST_KEY, {}),
  };
}

function saveState(state: AchievementState) {
  try {
    localStorage.setItem(BADGES_KEY, JSON.stringify(state.badges));
    localStorage.setItem(POINTS_KEY, JSON.stringify(state.points));
    localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
  } catch {
    // 存储不可用时静默降级
  }
}

export function getState(): AchievementState {
  return loadState();
}

// 解锁徽章；若已解锁返回 false，否则写入并返回 true（用于「获得新徽章」提示）。
export function unlockBadge(id: string): Badge | null {
  const state = loadState();
  if (state.badges.includes(id)) {
    return null;
  }
  const badge = BADGES.find((b) => b.id === id);
  state.badges.push(id);
  if (badge) {
    state.points += badge.points;
  }
  saveState(state);
  return badge ?? null;
}

// 记录一局得分：更新最高分与积分（积分 = 本局得分折算 + 徽章加分）。
export function recordScore(gameId: string, score: number): { points: number; isBest: boolean } {
  const state = loadState();
  const isBest = score > (state.best[gameId] ?? 0);
  if (isBest) {
    state.best[gameId] = score;
  }
  state.points += Math.max(0, Math.round(score));
  saveState(state);
  recordLeaderboard(gameId, score);
  return { points: state.points, isBest };
}

export type BoardEntry = { gameId: string; score: number; at: number };

// 本地排行榜：按 gameId 记录最近若干条高分。
export function recordLeaderboard(gameId: string, score: number) {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const board: BoardEntry[] = raw ? (JSON.parse(raw) as BoardEntry[]) : [];
    board.push({ gameId, score, at: Date.now() });
    board.sort((a, b) => b.score - a.score);
    localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, 20)));
  } catch {
    // 忽略
  }
}

export function getLeaderboard(): BoardEntry[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    return raw ? (JSON.parse(raw) as BoardEntry[]) : [];
  } catch {
    return [];
  }
}
