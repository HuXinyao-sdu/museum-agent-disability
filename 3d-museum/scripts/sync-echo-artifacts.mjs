// 把「主博物馆」与「Echo 展馆页面」的文物数据合并为一份统一清单，
// 并让 Echo 页面在加载时自动拉取这份清单、统一渲染（不区分国宝展品）。
//
// 数据流：
//   1. Echo bundle（public/echo/assets/*.js）内嵌 var Gn=[52 条，含 persona 字段]
//      —— 即 extract-echo-artifacts.mjs 抽取后生成 src/worldArtifacts.ts 的源数据。
//   2. public/artifact_list.json（7 条本地 my_art 展品，无 persona 字段）。
//   3. 本脚本把两者合并为 public/echo/artifacts.json（59 条，补全 persona）。
//   4. 再把 bundle 里的 var Gn=[...] 替换为同步拉取 artifacts.json 的代码，
//      页面加载即自动 fetch 并渲染。
//
// 用法： node scripts/sync-echo-artifacts.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ECHO_DIR = path.join(ROOT, "public", "echo");
const INDEX_HTML = path.join(ECHO_DIR, "index.html");
const MANIFEST_JSON = path.join(ROOT, "public", "artifact_list.json");
const OUTPUT_JSON = path.join(ECHO_DIR, "artifacts.json");

// 7 件 my_art 展品的第一人称 AI 讲解 persona（与 bundle 内 52 条的写法保持一致）。
const MY_ART_PERSONAS = {
  handaiqingtongbianzhong:
    "你是一组汉代宫廷里的青铜编钟。请以第一人称、清越而庄重地讲述:你身上按音高依次排列的钟体、汉代乐师如何用木槌敲响你奏出礼乐、钟声如何在殿宇间回荡。语气悠远清越,不要使用文件名或现代技术术语。",
  matafeiyan:
    "你是东汉的一尊青铜奔马,一足踏于回首的飞燕之上。请以第一人称、昂扬而灵动地讲述:你三足腾空的瞬间、工匠如何用飞燕衬托你的疾驰、两千年岁月里你如何被黄土封存又在今日重见天日。语气奔放有力,不要使用文件名或现代技术术语。",
  qingtongniu:
    "你是商周时期的一尊青铜牛。请以第一人称、敦厚而沉稳地讲述:你写实的身躯与弯起的牛角、先民如何以你象征农耕与财富、祭祀时你所承载的祈愿。语气沉稳厚重,不要使用文件名或现代技术术语。",
  shuochangtaoyong:
    "你是东汉的一尊击鼓说唱陶俑。请以第一人称、诙谐而生动地讲述:你袒胸抱鼓、眉飞色舞的姿态、汉代市井说唱艺人的诙谐与活力、你为何被称作「汉代第一俑」。语气活泼幽默,不要使用文件名或现代技术术语。",
  siyangfangzun:
    "你是商代晚期的一件青铜方尊,四角各铸一只卷角羊。请以第一人称、庄重而威严地讲述:你四羊合体的独特造型、满身的云雷纹与兽面纹、商代工匠如何铸就你这件最大的方尊。语气威严厚重,不要使用文件名或现代技术术语。",
  tongzhifenghuangjinjilazhutai:
    "你是明清宫廷的一件铜质凤凰金鸡烛台。请以第一人称、华贵而温润地讲述:你身上凤凰与金鸡的纹饰、凤为百鸟之王而鸡谐音「吉」的寓意、明清陈设中你所照亮的庭院与夜晚。语气华贵祥和,不要使用文件名或现代技术术语。",
  zhongshitaocijingtailanpinglu:
    "你是明清宫廷的一件景泰蓝瓶炉。请以第一人称、华贵而繁丽地讲述:你铜胎上的掐丝珐琅与缠枝莲纹、工匠如何反复填釉烧制、金碧辉煌的色彩如何在宫室内流转。语气华贵典雅,不要使用文件名或现代技术术语。",
};

// 从 index.html 解析出 bundle 的脚本文件名（文件名带内容哈希，不能写死）。
function resolveBundlePath() {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const match = html.match(/<script[^>]+src="\.\/assets\/([^"]+\.js)"/);
  if (!match) throw new Error("未在 index.html 中找到 bundle 脚本");
  return path.join(ECHO_DIR, "assets", match[1]);
}

// 从 bundle 源码中抽取某个顶层 `var <name>=[...]` 数组（按方括号深度匹配）。
function extractArray(src, varName) {
  const needle = `var ${varName}=[`;
  const decl = src.indexOf(needle);
  if (decl === -1) throw new Error(`未找到 ${needle}`);
  const arrStart = decl + `var ${varName}=`.length;
  let depth = 0;
  let inStr = false;
  let quote = "";
  let esc = false;
  for (let i = arrStart; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "`" || c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return { start: arrStart, end: i + 1, value: Function(`return ${src.slice(arrStart, i + 1)}`)() };
    }
  }
  throw new Error(`未能定位 ${needle} 的结束括号`);
}

// 把 my_art 清单条目补成与 Gn 相同的字段顺序（description 后插入 persona）。
function toGnShape(entry) {
  return {
    id: entry.id,
    name: entry.name,
    nameEn: entry.nameEn ?? "",
    museum: entry.museum ?? "",
    origin: entry.origin ?? "",
    period: entry.period ?? "",
    category: entry.category ?? "馆藏展品",
    group: entry.group ?? "china",
    description: entry.description ?? "",
    persona: MY_ART_PERSONAS[entry.id] ?? "",
    highlight: entry.highlight ?? entry.description ?? "",
    model: entry.model,
    modelCredit: entry.modelCredit ?? "",
  };
}

// 替换 bundle 里 `var Gn=[...]` 为同步拉取 artifacts.json 的代码。
const FETCH_IIFE =
  '(function(){try{var x=new XMLHttpRequest();x.open("GET","./artifacts.json",false);x.send(null);if(x.status>=200&&x.status<300)return JSON.parse(x.responseText)}catch(e){}return[]})()';

function main() {
  const bundlePath = resolveBundlePath();
  const src = fs.readFileSync(bundlePath, "utf8");

  // 52 条 Echo 展品：优先从 bundle 内嵌数组抽取；若 bundle 已 patch，则从既有
  // artifacts.json 回读（幂等，重复执行不会二次替换）。
  let echoArtifacts;
  let countLabel = "bundle";
  if (src.includes("var Gn=[")) {
    const gn = extractArray(src, "Gn");
    echoArtifacts = gn.value;
    const patched = src.slice(0, gn.start) + FETCH_IIFE + src.slice(gn.end);
    fs.writeFileSync(bundlePath, patched, "utf8");
    console.log(`已 patch：${path.relative(ROOT, bundlePath)}`);
  } else {
    if (!fs.existsSync(OUTPUT_JSON)) throw new Error("bundle 已 patch 但缺少 artifacts.json，无法回读 Echo 展品");
    echoArtifacts = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf8")).filter((a) => a.model.startsWith("./assets/"));
    countLabel = "回读 artifacts.json";
    console.log("bundle 已 patch，跳过重复替换；从既有 artifacts.json 回读 Echo 展品");
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_JSON, "utf8"));
  const myArt = (manifest.artifacts ?? manifest).map(toGnShape);

  const merged = [...echoArtifacts, ...myArt];
  if (merged.some((a) => !a.id || !a.model)) throw new Error("合并清单中存在缺失 id/model 的条目");

  // 写统一清单（中文按字面量输出，不转义）。
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(merged, null, 2) + "\n", "utf8");

  console.log(`合并完成：${echoArtifacts.length} (${countLabel}) + ${myArt.length} (my_art) = ${merged.length} 件展品`);
  console.log(`已写入：${path.relative(ROOT, OUTPUT_JSON)}`);
}

main();
