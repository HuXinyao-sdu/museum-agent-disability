// 趣味游戏中心入口：渲染游戏中心（卡片 / 难度 / 成就积分），
// 负责把点击的卡片交给游戏壳（shell）启动，并挂载「AI 陪玩」悬浮 NPC。

import { t } from "./lang";
import { GAME_META, GameMeta } from "./games/data";
import { Difficulty, GameModule } from "./games/types";
import { initShell, startGame } from "./games/shell";
import { puzzle3dGame } from "./games/puzzle3d";
import { castingGame } from "./games/casting";
import { scrollGame } from "./games/scroll";
import { motifGame } from "./games/motif";
import { timelineGame } from "./games/timeline";
import { BADGES, getState, getLeaderboard } from "./games/achievements";
import { askNpc, checkNpcOnline } from "./games/ai";
import { el } from "./games/dom";

const MODULES: Record<string, GameModule> = {
  puzzle3d: puzzle3dGame,
  casting: castingGame,
  scroll: scrollGame,
  motif: motifGame,
  timeline: timelineGame,
};

// 游戏 id → 对应徽章 id（用于在卡片上显示「已通关」）
const GAME_BADGE: Record<string, string> = {
  puzzle3d: "first-repair",
  casting: "bronze-master",
  scroll: "scroll-complete",
  motif: "motif-master",
  timeline: "dynasty-master",
};

const GAME_TITLE: Record<string, string> = Object.fromEntries(GAME_META.map((m) => [m.id, m.title]));

function mustQuery<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Required element not found: ${selector}`);
  return node;
}

const hub = mustQuery<HTMLElement>("#games-hub");
const stage = mustQuery<HTMLElement>("#game-stage");
const cardsEl = mustQuery<HTMLElement>("#games-cards");
const difficultyEl = mustQuery<HTMLElement>("#games-difficulty");
const achievementsEl = mustQuery<HTMLElement>("#games-achievements");

let currentDifficulty: Difficulty = "youth";

function renderCards() {
  const state = getState();
  cardsEl.innerHTML = "";
  GAME_META.forEach((meta) => {
    const card = el("button", "game-card", "");
    const cleared = state.badges.includes(GAME_BADGE[meta.id] ?? "");
    card.appendChild(el("span", "game-card-glyph", meta.glyph));
    card.appendChild(el("span", "game-card-level", `${meta.level} · ${meta.theme}`));
    card.appendChild(el("strong", "game-card-title", meta.title));
    card.appendChild(el("span", "game-card-tagline", meta.tagline));
    if (cleared) card.appendChild(el("span", "game-card-cleared", "✓ " + t("gm_completed")));
    card.addEventListener("click", () => enterGame(meta));
    cardsEl.appendChild(card);
  });
}

function renderDifficulty() {
  difficultyEl.innerHTML = "";
  difficultyEl.appendChild(el("span", "shell-difficulty-label", t("gm_difficulty")));
  (["child", "youth", "adult"] as Difficulty[]).forEach((d) => {
    const btn = el("button", "shell-diff-btn" + (d === currentDifficulty ? " active" : ""), d === "child" ? t("gm_diff_child") : d === "youth" ? t("gm_diff_youth") : t("gm_diff_adult"));
    btn.dataset.diff = d;
    btn.addEventListener("click", () => {
      currentDifficulty = d;
      renderDifficulty();
    });
    difficultyEl.appendChild(btn);
  });
}

function renderAchievements() {
  const state = getState();
  const board = getLeaderboard();
  achievementsEl.innerHTML = "";

  const head = el("div", "games-ach-head");
  head.appendChild(el("h3", "", t("gm_achievements")));
  head.appendChild(el("span", "games-points", `${t("gm_points")} ${state.points}`));
  achievementsEl.appendChild(head);

  const wall = el("div", "games-badges");
  BADGES.forEach((badge) => {
    const got = state.badges.includes(badge.id);
    const b = el("div", "game-badge" + (got ? " got" : ""), badge.glyph);
    b.title = `${badge.name} · ${badge.desc}`;
    const label = el("span", "game-badge-name", badge.name);
    const cell = el("div", "game-badge-cell");
    cell.append(b, label);
    wall.appendChild(cell);
  });
  achievementsEl.appendChild(wall);

  if (board.length) {
    const list = el("ul", "games-board");
    board.slice(0, 5).forEach((entry) => {
      list.appendChild(el("li", "", `${GAME_TITLE[entry.gameId] ?? entry.gameId} · ${entry.score} 分`));
    });
    achievementsEl.appendChild(list);
  }
}

function enterGame(meta: GameMeta) {
  const module = MODULES[meta.id];
  if (!module) return;
  hub.hidden = true;
  stage.hidden = false;
  startGame(meta, module, currentDifficulty);
}

function exitGame() {
  stage.hidden = true;
  stage.innerHTML = "";
  hub.hidden = false;
  renderCards();
  renderAchievements();
}

initShell(stage, exitGame);

renderCards();
renderDifficulty();
renderAchievements();

// ---------- AI 陪玩：右下角悬浮 NPC，复用 agent_bi 后端 ----------

const npcFab = mustQuery<HTMLElement>("#gm-agent");
const npcPanel = mustQuery<HTMLElement>("#gm-agent-panel");
const npcStatus = mustQuery<HTMLElement>("#gm-agent-status");
const npcChat = mustQuery<HTMLElement>("#gm-agent-chat");
const npcForm = mustQuery<HTMLFormElement>("#gm-agent-form");
const npcInput = mustQuery<HTMLInputElement>("#gm-agent-input");
const npcClose = mustQuery<HTMLElement>("#gm-agent-close");

let npcOnline = false;
let npcHistory: { role: "user" | "assistant"; content: string }[] = [];

function npcContextText(): string {
  return hub.hidden && !stage.hidden ? "正在游戏中，需要讲解或点评" : "在游戏中心浏览，准备选择游戏";
}

function appendNpc(role: "user" | "bot", text: string) {
  const row = el("div", "home-msg " + role, "");
  row.innerHTML = `<span class="home-avatar">${role === "bot" ? "伴" : t("me")}</span><span class="home-bubble"></span>`;
  (row.querySelector(".home-bubble") as HTMLElement).textContent = text;
  npcChat.appendChild(row);
  npcChat.scrollTop = npcChat.scrollHeight;
}

npcFab.addEventListener("click", () => {
  npcPanel.hidden = !npcPanel.hidden;
});

npcClose.addEventListener("click", () => {
  npcPanel.hidden = true;
});

npcForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const q = npcInput.value.trim();
  if (!q) return;
  npcInput.value = "";
  appendNpc("user", q);
  if (!npcOnline) {
    appendNpc("bot", "⚠️ AI 陪玩未连接（端口 8300）。请先在 agent_bi/agent/museum-agent 目录运行 python server.py。");
    return;
  }
  void askNpc(q, { gameTitle: "趣味游戏中心", role: "讲解员", progress: npcContextText() }, npcHistory)
    .then((reply) => {
      appendNpc("bot", reply.answer);
      npcHistory.push({ role: "user", content: q }, { role: "assistant", content: reply.answer });
      if (npcHistory.length > 12) npcHistory = npcHistory.slice(-12);
    })
    .catch((err: unknown) => {
      appendNpc("bot", `⚠️ ${err instanceof Error ? err.message : String(err)}`);
    });
});

void checkNpcOnline().then((ok) => {
  npcOnline = ok;
  npcStatus.textContent = ok ? "已连接 · 可陪你出题讲解" : "未连接讲解服务";
});
