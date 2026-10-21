// 趣味游戏模块：共享类型定义。五款游戏统一走同一套「游戏壳」协议，
// 由 src/games/shell.ts 提供开始页 / HUD / 结算页，游戏只负责 mount 与玩法。

export type Difficulty = "child" | "youth" | "adult";

// 三档难度配置：影响碎片数、提示次数、是否限时。
export type DifficultyConfig = {
  pieceCount: number;
  hintBudget: number;
  timed: boolean;
  timeLimitSec: number;
};

// 游戏壳在玩法运行期间暴露给游戏的上下文：
export type GameContext = {
  root: HTMLElement;
  difficulty: Difficulty;
  config: DifficultyConfig;
  // 步数 +1（HUD 实时计数）
  addStep(): void;
  // 报告完成度 0..1（HUD 进度条）
  reportProgress(fraction: number): void;
  // 显示一条提示（受 hintBudget 限制，预算用完则忽略）
  hint(text: string): void;
  // 通关结算：shell 负责记录用时、写成就/积分/埋点、渲染结算页
  finish(result: { score: number; unlocks?: string[]; badge?: string }): void;
  // 超时主动结算（未通关）
  timeUp?(score: number): void;
  // 不结算直接退出回到游戏中心
  quit(): void;
};

export type GameModule = {
  id: string;
  // 挂载游戏到 ctx.root，返回卸载函数（清理渲染循环 / 事件 / 模型）
  mount(ctx: GameContext): () => void;
};
