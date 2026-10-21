// 年代排序（P2）：把文物卡片放回时间轴的正确朝代。
// 点击文物 → 点击朝代格，正确锁定；全部归位后解锁「朝代图鉴」。

import { GameModule } from "./types";
import { TIMELINE_ITEMS } from "./data";
import { el, shuffle, shake } from "./dom";

export const timelineGame: GameModule = {
  id: "timeline",
  mount(ctx) {
    const root = ctx.root;
    const order = TIMELINE_ITEMS;
    const shuffled = shuffle(order);
    let selected: string | null = null;
    let placed = 0;
    let wrong = 0;

    root.innerHTML = "";

    const board = el("div", "g-board");
    board.appendChild(el("p", "g-board-hint", "把文物放回时间轴的正确朝代：点选一件文物，再点选时间轴上的朝代格。"));

    // 时间轴：朝代格按先后排列
    const axis = el("div", "g-timeline");
    const slotEls: HTMLElement[] = [];
    order.forEach((item, i) => {
      const slot = el("div", "g-timeline-slot");
      slot.dataset.index = String(i);
      slot.appendChild(el("span", "g-timeline-dynasty", item.dynasty));
      slot.appendChild(el("span", "g-timeline-place", "？"));
      slotEls.push(slot);
      axis.appendChild(slot);
      if (i < order.length - 1) axis.appendChild(el("span", "g-timeline-arrow", "→"));
    });
    board.appendChild(axis);

    // 文物托盘（打乱）
    const tray = el("div", "g-timeline-tray");
    const cardEls = new Map<string, HTMLButtonElement>();
    shuffled.forEach((item) => {
      const btn = el("button", "g-timeline-card", "");
      btn.appendChild(el("span", "g-timeline-artifact", item.artifact));
      btn.appendChild(el("span", "g-timeline-hint", item.hint));
      cardEls.set(item.id, btn);
      tray.appendChild(btn);
    });
    board.appendChild(tray);
    root.appendChild(board);

    function setSelected(id: string | null) {
      selected = id;
      cardEls.forEach((b, sid) => b.classList.toggle("selected", sid === id));
    }

    cardEls.forEach((btn, id) => {
      btn.addEventListener("click", () => setSelected(id === selected ? null : id));
    });

    slotEls.forEach((slot, i) => {
      slot.addEventListener("click", () => {
        if (!selected) {
          shake(slot);
          ctx.hint("先点选下方的一件文物。");
          return;
        }
        const item = order.find((t) => t.id === selected);
        if (!item) return;
        if (order[i].id === selected) {
          const place = slot.querySelector<HTMLElement>(".g-timeline-place");
          if (place) {
            place.textContent = item.artifact;
            place.classList.add("filled");
          }
          slot.classList.add("filled");
          cardEls.get(selected)?.classList.add("done");
          cardEls.get(selected)!.disabled = true;
          placed += 1;
          ctx.addStep();
          ctx.reportProgress(placed / order.length);
          setSelected(null);
          if (placed === order.length) {
            window.setTimeout(() => {
              ctx.finish({
                score: Math.max(10, 100 - wrong * 10),
                unlocks: [`朝代图鉴 · ${order.map((t) => `${t.dynasty}：${t.artifact}`).join("｜")}`],
                badge: "dynasty-master",
              });
            }, 300);
          }
        } else {
          wrong += 1;
          ctx.addStep();
          shake(slot);
          ctx.hint(item.hint);
        }
      });
    });

    return () => {
      root.innerHTML = "";
    };
  },
};
