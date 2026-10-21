import { execFileSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(process.env.ECHO_EXPORT ?? "3D 世界文物馆.exported.echo");
const target = resolve("public/echo");

if (!existsSync(source)) {
  throw new Error(`Echo export package was not found: ${source}`);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
execFileSync("unzip", ["-q", source, "-d", target], { stdio: "inherit" });

console.log(`Imported Echo export package into ${target}`);
