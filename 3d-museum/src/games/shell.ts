// 游戏壳：统一「开始页 / 教程 / HUD（步数·用时·完整度·提示）/ 结算页」，
// 五款游戏共用。游戏通过 GameContext 与壳交互，壳负责计时、成就、积分与埋点。

import { t } from "../lang";
import { Difficulty, DifficultyConfig, GameContext, GameModule } from "./types";
import { GAME_META, GameMeta } from "./data";
import { unlockBadge, recordScore } from "./achievements";
import { recordRun } from "./analytics";

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyConfig> = {
  child: { pieceCount: 3, hintBudget: 5, timed: false, timeLimitSec: 0 },
  youth: { pieceCount: 4, hintBudget: 3, timed: false, timeLimitSec: 0 },
  adult: { pieceCount: 5, hintBudget: 1, timed: true, timeLimitSec: 150 },
};

export function difficultyLabel(difficulty: Difficulty): string {
  const map: Record<Difficulty, string> = {
    child: t("gm_diff_child"),
    youth: t("gm_diff_youth"),
    adult: t("gm_diff_adult"),
  };
  return map[difficulty];
}

// 每款游戏的玩法说明（教程文案）
const TUTORIALS: Record<string, string> = {
  puzzle3d: "瓷瓶被打碎成若干段，拖动每一段，把它放回中央虚影的对应位置。段与虚影对齐后会自动吸附，「器物完整度」达 100% 即通关。滚轮可旋转观察、拖动背景可平移视角。",
  casting: "青铜器要经历四步才能铸成。按正确顺序点击下方四步：制范 → 熔炼 → 浇筑 → 打磨。点错了会给出工艺提示，不会直接失败。",
  scroll: "长卷的画面段落被打乱了。先点选一个画面段落，再点选卷轴上正确的叙事位置，把它拼回原位。整卷归位后即可欣赏完整画卷。",
  motif: "左边是纹饰，右边是器物与寓意。先点选一个纹饰，再点选它对应的器物·寓意卡，配对正确即锁定。",
  timeline: "把文物放回时间轴的正确朝代。先点选一件文物，再点选时间轴上正确的朝代格。全部归位后点亮朝代图鉴。",
};

let stage: HTMLElement | null = null;
let onExit: () => void = () => {};

export function initShell(stageEl: HTMLElement, exit: () => void) {
  stage = stageEl;
  onExit = exit;
}

type ShellState = {
  meta: GameMeta;
  module: GameModule;
  difficulty: Difficulty;
  config: DifficultyConfig;
  steps: number;
  progress: number;
  hintLeft: number;
  startedAt: number;
  elapsed: number;
  finished: boolean;
  cleanup: (() => void) | null;
  timerId: number | null;
  timeLeft: number;
};

const state: ShellState = {
  meta: GAME_META[0],
  module: { id: "", mount: () => () => {} },
  difficulty: "youth",
  config: DIFFICULTY_PRESETS.youth,
  steps: 0,
  progress: 0,
  hintLeft: 3,
  startedAt: 0,
  elapsed: 0,
  finished: false,
  cleanup: null,
  timerId: null,
  timeLeft: 0,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearStage() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  state.cleanup?.();
  state.cleanup = null;
  if (stage) stage.innerHTML = "";
}

function hintToast(text: string) {
  if (!stage) return;
  const existing = stage.querySelector<HTMLElement>(".shell-toast");
  existing?.remove();
  const toast = el("div", "shell-toast", text);
  stage.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function buildHud(): HTMLElement {
  const hud = el("div", "shell-hud");

  const steps = el("div", "shell-stat");
  steps.appendChild(el("span", "shell-stat-label", t("gm_steps")));
  const stepsVal = el("b", "shell-stat-value", "0");
  stepsVal.id = "shell-steps";
  steps.appendChild(stepsVal);

  const time = el("div", "shell-stat");
  time.appendChild(el("span", "shell-stat-label", t("gm_time")));
  const timeVal = el("b", "shell-stat-value", "00:00");
  timeVal.id = "shell-time";
  time.appendChild(timeVal);

  const prog = el("div", "shell-progress");
  const progLabel = el("div", "shell-progress-head");
  progLabel.appendChild(el("span", "shell-stat-label", t("gm_progress")));
  const progPct = el("b", "shell-stat-value", "0%");
  progPct.id = "shell-progress-pct";
  progLabel.appendChild(progPct);
  const barWrap = el("div", "shell-progress-bar");
  const bar = el("i", "shell-progress-fill");
  bar.id = "shell-progress-fill";
  barWrap.appendChild(bar);
  prog.appendChild(progLabel);
  prog.appendChild(barWrap);

  const hintBtn = el("button", "shell-btn shell-hint-btn", `${t("gm_hint")} (${state.hintLeft})`);
  hintBtn.id = "shell-hint-btn";
  const quitBtn = el("button", "shell-btn shell-quit-btn", t("gm_quit"));

  hud.append(steps, time, prog, hintBtn, quitBtn);

  hintBtn.addEventListener("click", () => {
    // 提示按钮只给出一条通用引导；具体提示由游戏内部 ctx.hint() 触发。
    hintToast("试着观察每一段的形状，对照中央的虚影结构。");
  });
  quitBtn.addEventListener("click", () => {
    clearStage();
    onExit();
  });

  return hud;
}

function updateHud() {
  if (!stage) return;
  const stepsEl = stage.querySelector<HTMLElement>("#shell-steps");
  const timeEl = stage.querySelector<HTMLElement>("#shell-time");
  const fill = stage.querySelector<HTMLElement>("#shell-progress-fill");
  const pct = stage.querySelector<HTMLElement>("#shell-progress-pct");
  const hintBtn = stage.querySelector<HTMLElement>("#shell-hint-btn");
  if (stepsEl) stepsEl.textContent = String(state.steps);
  if (timeEl) {
    const total = state.config.timed && state.config.timeLimitSec > 0 ? state.timeLeft : Math.floor(state.elapsed);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    timeEl.textContent = `${mm}:${ss}`;
  }
  if (fill) fill.style.width = `${Math.round(state.progress * 100)}%`;
  if (pct) pct.textContent = `${Math.round(state.progress * 100)}%`;
  if (hintBtn) hintBtn.textContent = `${t("gm_hint")} (${state.hintLeft})`;
}

function startTimer() {
  state.startedAt = performance.now();
  state.elapsed = 0;
  state.timeLeft = state.config.timeLimitSec;
  state.timerId = window.setInterval(() => {
    if (state.finished) return;
    state.elapsed = Math.floor((performance.now() - state.startedAt) / 1000);
    if (state.config.timed && state.config.timeLimitSec > 0) {
      state.timeLeft = Math.max(0, state.config.timeLimitSec - state.elapsed);
      if (state.timeLeft <= 0) {
        finishGame(false, 0, [], undefined);
        return;
      }
    }
    updateHud();
  }, 500);
}

function finishGame(completed: boolean, score: number, unlocks: string[], badge?: string) {
  if (state.finished) return;
  state.finished = true;
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  state.elapsed = Math.floor((performance.now() - state.startedAt) / 1000);
  state.cleanup?.();
  state.cleanup = null;

  let newBadgeName: string | null = null;
  if (completed && badge) {
    const got = unlockBadge(badge);
    if (got) newBadgeName = got.name;
  }
  recordScore(state.meta.id, score);
  recordRun({
    gameId: state.meta.id,
    difficulty: state.difficulty,
    completed,
    timeSec: state.elapsed,
    steps: state.steps,
    retries: state.steps,
    score,
  });

  renderResult(completed, score, unlocks, newBadgeName);
}

function renderResult(completed: boolean, score: number, unlocks: string[], newBadgeName: string | null) {
  if (!stage) return;
  stage.innerHTML = "";

  const panel = el("div", "shell-result");
  panel.appendChild(el("div", "shell-result-mark", completed ? "宝" : "时"));
  panel.appendChild(el("h2", "shell-result-title", completed ? t("gm_result") : t("gm_timeup")));

  const scoreRow = el("div", "shell-result-score");
  scoreRow.appendChild(el("span", "shell-result-score-label", t("gm_score")));
  scoreRow.appendChild(el("b", "shell-result-score-value", String(score)));
  panel.appendChild(scoreRow);

  const stats = el("div", "shell-result-stats");
  stats.appendChild(el("span", "", `${t("gm_steps")} ${state.steps}`));
  stats.appendChild(el("span", "", `${t("gm_time")} ${state.elapsed}s`));
  panel.appendChild(stats);

  if (newBadgeName) {
    const badgeBanner = el("div", "shell-result-badge", `🏅 ${t("gm_new_badge")}：${newBadgeName}`);
    panel.appendChild(badgeBanner);
  }

  if (unlocks.length) {
    const unlockWrap = el("div", "shell-result-unlocks");
    unlockWrap.appendChild(el("p", "shell-result-unlock-title", t("gm_unlock")));
    const list = el("ul", "shell-result-unlock-list");
    unlocks.forEach((u) => list.appendChild(el("li", "", u)));
    unlockWrap.appendChild(list);
    panel.appendChild(unlockWrap);
  }

  const actions = el("div", "shell-result-actions");
  const retry = el("button", "shell-btn shell-primary", t("gm_retry"));
  retry.addEventListener("click", () => startGame(state.meta, state.module, state.difficulty));
  const back = el("button", "shell-btn", t("gm_back"));
  back.addEventListener("click", () => {
    stage!.innerHTML = "";
    onExit();
  });
  actions.append(retry, back);
  panel.appendChild(actions);

  stage.appendChild(panel);
}

export function startGame(meta: GameMeta, module: GameModule, difficulty: Difficulty) {
  clearStage();
  if (!stage) return;
  Object.assign(state, {
    meta,
    module,
    difficulty,
    config: DIFFICULTY_PRESETS[difficulty],
    steps: 0,
    progress: 0,
    hintLeft: DIFFICULTY_PRESETS[difficulty].hintBudget,
    finished: false,
    cleanup: null,
    elapsed: 0,
    timeLeft: DIFFICULTY_PRESETS[difficulty].timeLimitSec,
  });

  // —— 开始页 ——
  const start = el("div", "shell-start");
  start.appendChild(el("div", "shell-start-glyph", meta.glyph));
  start.appendChild(el("p", "shell-start-level", `${meta.level} · ${meta.theme}`));
  start.appendChild(el("h2", "shell-start-title", meta.title));
  start.appendChild(el("p", "shell-start-tagline", meta.tagline));
  const tut = el("div", "shell-tutorial");
  tut.appendChild(el("p", "shell-tutorial-title", t("gm_tutorial")));
  tut.appendChild(el("p", "shell-tutorial-body", TUTORIALS[meta.id] ?? ""));
  start.appendChild(tut);

  const diffWrap = el("div", "shell-difficulty");
  diffWrap.appendChild(el("span", "shell-difficulty-label", t("gm_difficulty")));
  (["child", "youth", "adult"] as Difficulty[]).forEach((d) => {
    const btn = el("button", "shell-diff-btn" + (d === difficulty ? " active" : ""), difficultyLabel(d));
    btn.dataset.diff = d;
    btn.addEventListener("click", () => {
      state.difficulty = d;
      state.config = DIFFICULTY_PRESETS[d];
      state.hintLeft = DIFFICULTY_PRESETS[d].hintBudget;
      diffWrap.querySelectorAll<HTMLElement>(".shell-diff-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
    diffWrap.appendChild(btn);
  });
  start.appendChild(diffWrap);

  const beginBtn = el("button", "shell-btn shell-primary shell-begin", t("gm_start"));
  beginBtn.addEventListener("click", () => beginGame());
  start.appendChild(beginBtn);

  stage.appendChild(start);
}

function beginGame() {
  if (!stage) return;
  stage.innerHTML = "";

  stage.appendChild(buildHud());
  const play = el("div", "shell-play");
  play.id = "shell-play";
  stage.appendChild(play);

  const ctx: GameContext = {
    root: play,
    difficulty: state.difficulty,
    config: state.config,
    addStep() {
      state.steps += 1;
      updateHud();
    },
    reportProgress(fraction: number) {
      state.progress = Math.max(0, Math.min(1, fraction));
      updateHud();
    },
    hint(text: string) {
      if (state.hintLeft > 0) {
        state.hintLeft -= 1;
        updateHud();
        hintToast(text);
      } else {
        hintToast("提示次数已用完，试试自己动手吧。");
      }
    },
    finish({ score, unlocks = [], badge }) {
      finishGame(true, score, unlocks, badge);
    },
    timeUp(score) {
      finishGame(false, score, [], undefined);
    },
    quit() {
      clearStage();
      onExit();
    },
  };

  state.cleanup = state.module.mount(ctx);
  startTimer();
  updateHud();
}
