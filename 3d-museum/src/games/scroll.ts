// 书画长卷拼接（P1）：把打乱的画面段落放回卷轴的叙事位置。
// 点击段落 → 点击卷轴位置完成拼接；整卷归位后逐段播放画面叙事。

import { GameModule } from "./types";
import { SCROLL_SEGMENTS, SCROLL_TITLE } from "./data";
import { el, shuffle, shake } from "./dom";

export const scrollGame: GameModule = {
  id: "scroll",
  mount(ctx) {
    const root = ctx.root;
    const order = SCROLL_SEGMENTS;
    const shuffled = shuffle(order);
    let selected: string | null = null;
    let placed = 0;
    let wrong = 0;

    root.innerHTML = "";

    const board = el("div", "g-board");
    board.appendChild(el("p", "g-board-hint", `《${SCROLL_TITLE}》的画卷段落被打乱了，请点选段落，再点选卷轴上正确的叙事位置。`));

    // 卷轴：纵向叙事槽位
    const scrollEl = el("div", "g-scroll");
    const slotEls: HTMLElement[] = [];
    order.forEach((seg, i) => {
      const slot = el("div", "g-scroll-slot");
      slot.dataset.index = String(i);
      slot.appendChild(el("span", "g-scroll-slot-no", String(i + 1)));
      slot.appendChild(el("span", "g-scroll-slot-ph", "···"));
      slotEls.push(slot);
      scrollEl.appendChild(slot);
    });
    board.appendChild(scrollEl);

    // 段落托盘（打乱）：每段是一幅画面，配一小句题名
    const tray = el("div", "g-scroll-tray");
    const segEls = new Map<string, HTMLButtonElement>();
    shuffled.forEach((seg) => {
      const btn = el("button", "g-scroll-seg", "");
      const art = el("div", "g-scroll-seg-art");
      art.innerHTML = seg.art;
      btn.appendChild(art);
      btn.appendChild(el("span", "g-scroll-seg-title", seg.title));
      segEls.set(seg.id, btn);
      tray.appendChild(btn);
    });
    board.appendChild(tray);
    root.appendChild(board);

    function setSelected(id: string | null) {
      selected = id;
      segEls.forEach((b, sid) => b.classList.toggle("selected", sid === id));
      slotEls.forEach((s) => s.classList.remove("pulse"));
    }

    segEls.forEach((btn, id) => {
      btn.addEventListener("click", () => setSelected(id === selected ? null : id));
    });

    slotEls.forEach((slot, i) => {
      slot.addEventListener("click", () => {
        if (!selected) {
          shake(slot);
          ctx.hint("先点选下方的一个画面段落。");
          return;
        }
        const seg = order.find((s) => s.id === selected);
        if (!seg) return;
        const correctIdx = order.findIndex((s) => s.id === selected);
        if (correctIdx === i) {
          // 正确：把画面填入卷轴
          slot.innerHTML = "";
          slot.classList.add("filled");
          slot.appendChild(el("span", "g-scroll-slot-no", String(i + 1)));
          const art = el("div", "g-scroll-slot-art");
          art.innerHTML = seg.art;
          slot.appendChild(art);
          slot.appendChild(el("span", "g-scroll-slot-title", seg.title));
          segEls.get(selected)?.classList.add("done");
          segEls.get(selected)!.disabled = true;
          placed += 1;
          ctx.addStep();
          ctx.reportProgress(placed / order.length);
          setSelected(null);
          if (placed === order.length) {
            window.setTimeout(() => playNarrative(), 300);
          }
        } else {
          wrong += 1;
          ctx.addStep();
          shake(slot);
          ctx.hint(seg.clue);
        }
      });
    });

    // 整卷归位：逐段播放画面叙事
    function playNarrative() {
      root.innerHTML = "";
      const stageEl = el("div", "g-narrative");
      stageEl.appendChild(el("h3", "g-narrative-title", `《${SCROLL_TITLE}》`));
      const artBox = el("div", "g-narrative-art");
      const lineBox = el("div", "g-narrative-line");
      const lineTitle = el("h4", "", "");
      const lineText = el("p", "", "");
      lineBox.append(lineTitle, lineText);
      stageEl.append(artBox, lineBox);
      root.appendChild(stageEl);

      order.forEach((seg, i) => {
        window.setTimeout(() => {
          artBox.innerHTML = seg.art;
          lineTitle.textContent = `${i + 1} · ${seg.title}`;
          lineText.textContent = seg.line;
          lineTitle.classList.remove("in");
          lineText.classList.remove("in");
          artBox.classList.remove("in");
          void lineTitle.offsetWidth;
          lineTitle.classList.add("in");
          lineText.classList.add("in");
          artBox.classList.add("in");
          if (i === order.length - 1) {
            window.setTimeout(() => {
              ctx.finish({
                score: Math.max(10, 100 - wrong * 10),
                unlocks: [`完整画卷 · 《${SCROLL_TITLE}》`],
                badge: "scroll-complete",
              });
            }, 1200);
          }
        }, i * 1100);
      });
    }

    return () => {
      root.innerHTML = "";
    };
  },
};
