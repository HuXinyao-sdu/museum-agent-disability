// 同时启动前端 (vite) 与后端 (python server.py)
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const agentDir = path.join(root, "agent", "museum-agent");

const isWin = process.platform === "win32";

function start(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, {
    cwd,
    shell: isWin, // Windows 上 python 可能是 python.exe 需要 shell 解析
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    console.log(`[${name}] 已退出 (code=${code}, signal=${signal})`);
  });
  child.on("error", (err) => {
    console.error(`[${name}] 启动失败:`, err.message);
  });
  return child;
}

console.log("正在启动前端 (vite) 与后端 (python server.py) ...");
console.log("前端: http://127.0.0.1:5174");
console.log("后端: http://127.0.0.1:8300");
console.log("按 Ctrl+C 同时停止前后端");

// 前端
start("前端 vite", isWin ? "npm" : "npm", ["run", "dev"], root);

// 后端
start("后端 python", isWin ? "python" : "python", ["server.py"], agentDir);

process.on("SIGINT", () => {
  process.exit(0);
});
