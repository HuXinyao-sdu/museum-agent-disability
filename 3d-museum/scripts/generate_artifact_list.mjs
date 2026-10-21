// 自动扫描 public/my_art/ 下全部 .glb 文件，按文件名映射生成 public/artifact_list.json。
// 用法：node scripts/generate_artifact_list.mjs
// 每次在 my_art 里新增 / 删除 glb 后重新运行即可，无需手动编辑 artifact_list.json。

import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const artDir = join(root, "public", "my_art");
const outPath = join(root, "public", "artifact_list.json");

// 文件名 → 展品信息。key 必须与 public/my_art 下的实际文件名完全一致（含 .glb 后缀）。
// 若扫描到未登记的文件，脚本会报错并列出，提示你在此补充对应条目。
// 展品按 category 归入对应展区（青铜器→青铜器馆、海洋贝类/珊瑚→自然标本馆等）。
const CATALOG = {
  "siyangfangzun.glb": {
    name: "四羊方尊",
    nameEn: "Four-goat Square Zun (Sì Yáng Fāng Zūn)",
    museum: "中国国家博物馆（原藏）",
    origin: "中国 · 商代",
    period: "商代晚期 · 约公元前 13–11 世纪",
    category: "青铜器",
    group: "china",
    description:
      "四羊方尊是商代晚期的一件青铜礼器，1938 年出土于湖南宁乡，是中国现存商代青铜方尊中最大的一件。整器高约 58.3 厘米、重 34.5 千克，器身四角各铸一只卷角羊，羊首伸出器腹、四羊相背合为一体，通体满饰云雷纹、兽面纹与夔龙纹，是商代青铜铸造工艺的巅峰之作。",
    highlight: "中国现存商代青铜方尊中最大的一件，四羊合体的青铜铸造典范。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "shuochangtaoyong.glb": {
    name: "东汉击鼓说唱陶俑",
    nameEn: "Eastern Han Pottery Figure of a Storyteller",
    museum: "中国国家博物馆",
    origin: "中国 · 东汉",
    period: "东汉 · 约公元 1–2 世纪",
    category: "陶俑",
    group: "china",
    description:
      "东汉时期的击鼓说唱陶俑，1957 年出土于四川成都天回山。陶俑袒胸露腹、左臂抱鼓、右臂高举，眉飞色舞、姿态夸张，被誉为“汉代第一俑”，是中国古代雕塑中现实主义与夸张手法结合的杰作。",
    highlight: "“汉代第一俑”，现实主义与夸张手法结合的典范。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "zhongshitaocijingtailanpinglu.glb": {
    name: "景泰蓝瓶炉",
    nameEn: "Cloisonné (Jingtailan) Vase and Incense Burner",
    museum: "故宫博物院",
    origin: "中国 · 明清",
    period: "明清 · 约公元 15–19 世纪",
    category: "景泰蓝",
    group: "china",
    description:
      "景泰蓝瓶炉，中国传统珐琅工艺的代表作，以掐丝珐琅技法在铜胎上掐出缠枝莲纹并填充珐琅釉料烧制而成。器形端庄，纹饰繁丽，色彩金碧辉煌，是明清宫廷陈设与礼器的典范。",
    highlight: "铜胎掐丝珐琅工艺集大成者，明清宫廷陈设典范。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "handaiqingtongbianzhong.glb": {
    name: "汉代青铜编钟",
    nameEn: "Han Dynasty Bronze Bianzhong (Chime Bells)",
    museum: "湖北省博物馆",
    origin: "中国 · 汉代",
    period: "汉代 · 约公元前 2 世纪",
    category: "青铜器",
    group: "china",
    description:
      "汉代青铜编钟，一套按音高依次排列的铜钟。钟体上窄下宽、饰以乳钉纹与云纹，汉代乐师以木槌敲击演奏，钟声清越悠远、回荡殿宇，是汉代礼乐制度的实物见证，也承载着“钟鸣鼎食”的礼乐传统。",
    highlight: "礼乐之器，汉代编钟奏响的钟鸣之音。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "matafeiyan.glb": {
    name: "马踏飞燕",
    nameEn: "Galloping Horse Treading on a Flying Swallow",
    museum: "甘肃省博物馆",
    origin: "中国 · 东汉",
    period: "东汉 · 约公元 2 世纪",
    category: "青铜器",
    group: "china",
    description:
      "马踏飞燕，又称“铜奔马”“马超龙雀”，1969 年出土于甘肃武威雷台汉墓。奔马三足腾空、一足踏于回首的飞燕之上，以飞燕衬出骏马的疾驰之势，将力学平衡与艺术想象融为一体，是中国古代青铜艺术的杰作，也是中国旅游的标志。",
    highlight: "三足腾空、一足踏燕，中国旅游标志的青铜奔马。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "qingtongniu.glb": {
    name: "青铜牛",
    nameEn: "Bronze Ox",
    museum: "中国国家博物馆",
    origin: "中国 · 商周",
    period: "商周 · 约公元前 13–11 世纪",
    category: "青铜器",
    group: "china",
    description:
      "商周时期的青铜牛，身躯写实、牛角弯起，神态敦厚沉稳。在先民眼中，牛既是农耕之本，也是财富与祭祀的象征，这件青铜牛承载着先民对五谷丰登的祈愿，是青铜时代动物造型艺术与农业文明的缩影。",
    highlight: "敦厚沉稳的青铜牛，农耕与祭祀的双重象征。",
    modelCredit: "三维扫描 · 本地模型",
  },
  "tongzhifenghuangjinjilazhutai.glb": {
    name: "铜制凤凰金鸡蜡烛台",
    nameEn: "Copper Phoenix and Rooster Candlestick",
    museum: "故宫博物院",
    origin: "中国 · 明清",
    period: "明清 · 约公元 15–19 世纪",
    category: "铜器",
    group: "china",
    description:
      "明清宫廷陈设用的铜质凤凰金鸡烛台，器身饰凤凰与金鸡纹样。凤为百鸟之王、鸡谐音“吉”，寓意祥瑞安康。烛台造型华贵，做工精细，是明清宫廷陈设与吉庆民俗相结合的典范之作。",
    highlight: "凤鸣金鸡、寓意吉祥的宫廷烛台。",
    modelCredit: "三维扫描 · 本地模型",
  },
};

if (!existsSync(artDir)) {
  console.error(`[generate_artifact_list] 未找到目录：${artDir}`);
  process.exit(1);
}

const files = readdirSync(artDir)
  .filter((file) => file.toLowerCase().endsWith(".glb"))
  .sort();

if (files.length === 0) {
  console.error(`[generate_artifact_list] ${artDir} 下没有 .glb 文件。`);
  process.exit(1);
}

const missing = files.filter((file) => !CATALOG[file]);
if (missing.length > 0) {
  console.error(
    `[generate_artifact_list] 以下 glb 文件未在 CATALOG 中登记，请补充名称与简介：\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}

const artifacts = files.map((file) => {
  const info = CATALOG[file];
  const base = file.replace(/\.glb$/i, "");
  return {
    id: base,
    name: info.name,
    nameEn: info.nameEn ?? "",
    museum: info.museum ?? "",
    origin: info.origin ?? "",
    period: info.period ?? "",
    category: info.category ?? "馆藏展品",
    group: info.group ?? "china",
    description: info.description ?? "",
    highlight: info.highlight ?? info.description ?? "",
    model: `/my_art/${file}`,
    modelCredit: info.modelCredit ?? "三维扫描 · 本地模型",
  };
});

writeFileSync(outPath, `${JSON.stringify({ artifacts }, null, 2)}\n`, "utf8");
console.log(`[generate_artifact_list] 已生成 ${outPath}，共 ${artifacts.length} 件展品：`);
artifacts.forEach((artifact) => console.log(`  - ${artifact.name}（${artifact.model}）`));
