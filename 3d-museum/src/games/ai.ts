// AI 陪玩：复用 agent_bi 的 REST 接口（与 gallery.ts / home.ts 同一后端），
// 让历史人物 NPC 在游戏中出题、讲解、点评。后端离线时优雅降级。

const AGENT_BASE = "http://localhost:8300";

export type NpcContext = {
  gameTitle: string;
  role: string; // 陪玩 NPC 身份，如「讲解员」「范铸匠人」
  progress: string; // 当前进度/题面简述
};

export type NpcReply = { answer: string; suggested?: string[] };

// 把游戏进度作为上下文，向 NPC 提问（点评/讲解/要提示）。
export async function askNpc(question: string, ctx: NpcContext, history: { role: "user" | "assistant"; content: string }[] = []): Promise<NpcReply> {
  const response = await fetch(`${AGENT_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `【趣味游戏 · ${ctx.gameTitle}】当前进度：${ctx.progress}。请以「${ctx.role}」的身份回答：${question}`,
      role: ctx.role,
      style: "classic",
      current_hall: ctx.gameTitle,
      history,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    answer?: string;
    suggested_questions?: string[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || `Agent 服务返回 HTTP ${response.status}`);
  }
  return { answer: data.answer ?? "", suggested: data.suggested_questions };
}

// 检测后端是否在线，供游戏中心显示 NPC 状态。
export async function checkNpcOnline(): Promise<boolean> {
  try {
    const response = await fetch(`${AGENT_BASE}/api/knowledge`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
