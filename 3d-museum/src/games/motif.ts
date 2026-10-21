// 纹饰配对（P2）：把左边的纹饰与右边的「器物 · 寓意」一一配对。
// 点击纹饰 → 点击对应的器物·寓意卡，正确锁定；闯关计分。

import { GameModule } from "./types";
import { MOTIF_PAIRS } from "./data";
import { el, shuffle, shake } from "./dom";

export const motifGame: GameModule = {
  id: "motif",
  mount(ctx) {
    const root = ctx.root;
    const pairs = MOTIF_PAIRS;
    const rightShuffled = shuffle(pairs);
    let selected: string | null = null;
    let matched = 0;
    let wrong = 0;

    root.innerHTML = "";

    const board = el("div", "g-board");
    board.appendChild(el("p", "g-board-hint", "先点选一个纹饰，再点选它对应的器物与寓意，读懂传统纹样背后的吉祥密码。"));

    const cols = el("div", "g-motif-cols");

    // 左列：纹饰
    const left = el("div", "g-motif-col");
    left.appendChild(el("p", "g-motif-col-title", "纹饰"));
    const leftEls = new Map<string, HTMLButtonElement>();
    pairs.forEach((p) => {
      const btn = el("button", "g-motif-card g-motif-left", "");
      btn.appendChild(el("span", "g-motif-glyph", p.motifGlyph));
      btn.appendChild(el("span", "g-motif-name", p.motif));
      leftEls.set(p.id, btn);
      left.appendChild(btn);
    });

    // 右列：器物 · 寓意（打乱）
    const right = el("div", "g-motif-col");
    right.appendChild(el("p", "g-motif-col-title", "器物 · 寓意"));
    const rightEls = new Map<string, HTMLButtonElement>();
    rightShuffled.forEach((p) => {
      const btn = el("button", "g-motif-card g-motif-right", "");
      btn.appendChild(el("span", "g-motif-artifact", p.artifact));
      btn.appendChild(el("span", "g-motif-meaning", p.meaning));
      rightEls.set(p.id, btn);
      right.appendChild(btn);
    });

    cols.append(left, right);
    board.appendChild(cols);
    root.appendChild(board);

    function setSelected(id: string | null) {
      selected = id;
      leftEls.forEach((b, sid) => b.classList.toggle("selected", sid === id));
    }

    leftEls.forEach((btn, id) => {
      btn.addEventListener("click", () => setSelected(id === selected ? null : id));
    });

    rightEls.forEach((btn, id) => {
      btn.addEventListener("click", () => {
        if (!selected) {
          shake(btn);
          ctx.hint("先点选左边的一个纹饰。");
          return;
        }
        if (selected === id) {
          leftEls.get(id)?.classList.add("done");
          leftEls.get(id)!.disabled = true;
          btn.classList.add("done");
          btn.disabled = true;
          matched += 1;
          ctx.addStep();
          ctx.reportProgress(matched / pairs.length);
          setSelected(null);
          if (matched === pairs.length) {
            window.setTimeout(() => {
              ctx.finish({
                score: Math.max(10, 100 - wrong * 10),
                unlocks: pairs.map((p) => `${p.motif} · ${p.artifact} · ${p.meaning}`),
                badge: "motif-master",
              });
            }, 300);
          }
        } else {
          wrong += 1;
          ctx.addStep();
          shake(btn);
          const pair = pairs.find((p) => p.id === selected);
          if (pair) ctx.hint(`${pair.motif} 常见于「${pair.artifact}」，寓意 ${pair.meaning}。`);
        }
      });
    });

    return () => {
      root.innerHTML = "";
    };
  },
};
