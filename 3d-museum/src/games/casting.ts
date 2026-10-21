// 青铜铸造还原（P1）：按 制范 → 熔炼 → 浇筑 → 打磨 的正确顺序点击四步，
// 点错给工艺提示（不直接失败），全部正确后解锁「范铸法」工艺词条。

import { GameModule } from "./types";
import { CASTING_STEPS, CASTING_UNLOCK } from "./data";
import { el, shuffle, shake } from "./dom";

export const castingGame: GameModule = {
  id: "casting",
  mount(ctx) {
    const root = ctx.root;
    const order = CASTING_STEPS;
    const shuffled = shuffle(order);
    let step = 0;
    let wrong = 0;

    root.innerHTML = "";

    const board = el("div", "g-board");
    board.appendChild(el("p", "g-board-hint", "青铜器要经历四步才能铸成，请按正确顺序点击下方步骤。"));

    // 进度槽：四步空位
    const slots = el("div", "g-casting-slots");
    for (let i = 0; i < order.length; i += 1) {
      const slot = el("div", "g-casting-slot");
      slot.appendChild(el("span", "g-casting-slot-no", String(i + 1)));
      slot.appendChild(el("span", "g-casting-slot-name", "？"));
      slots.appendChild(slot);
    }
    board.appendChild(slots);

    // 步骤卡片（打乱）
    const cards = el("div", "g-casting-cards");
    const cardEls = new Map<string, HTMLButtonElement>();
    shuffled.forEach((s) => {
      const btn = el("button", "g-casting-card", "");
      btn.appendChild(el("span", "g-casting-glyph", s.glyph));
      btn.appendChild(el("span", "g-casting-name", s.name));
      btn.appendChild(el("span", "g-casting-desc", s.desc));
      cardEls.set(s.name, btn);
      cards.appendChild(btn);
    });
    board.appendChild(cards);
    root.appendChild(board);

    function complete() {
      const score = Math.max(10, 100 - wrong * 10);
      ctx.reportProgress(1);
      ctx.finish({ score, unlocks: [CASTING_UNLOCK.title, CASTING_UNLOCK.body], badge: "bronze-master" });
    }

    cardEls.forEach((btn, name) => {
      btn.addEventListener("click", () => {
        const idx = order.findIndex((s) => s.name === name);
        if (idx === step) {
          // 正确：填入当前槽位
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
            window.setTimeout(complete, 320);
          }
        } else {
          // 点错：给工艺提示
          wrong += 1;
          ctx.addStep();
          shake(btn);
          ctx.hint(order[idx].hint);
        }
      });
    });

    return () => {
      root.innerHTML = "";
    };
  },
};
