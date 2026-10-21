// 游戏共用的 DOM 小工具：创建元素、洗牌、抖动动画。

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 抖动提示（点错时）
export function shake(node: HTMLElement) {
  node.classList.remove("g-shake");
  // 强制重排以重放动画
  void node.offsetWidth;
  node.classList.add("g-shake");
  node.addEventListener("animationend", () => node.classList.remove("g-shake"), { once: true });
}
