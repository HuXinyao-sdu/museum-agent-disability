// 趣味游戏内容数据：五款游戏的题目、通关解锁内容、游戏中心卡片元信息。
// 文物年代/名称尽量复用 worldArtifacts 的口径，保持与图鉴一致。

export type GameMeta = {
  id: string;
  title: string;
  tagline: string;
  glyph: string;
  level: "P0" | "P1" | "P2";
  theme: string;
};

export const GAME_META: GameMeta[] = [
  {
    id: "puzzle3d",
    title: "瓷器 3D 拼图",
    tagline: "把打碎的瓷瓶，按口沿—颈—腹—足底重新拼回。",
    glyph: "瓷",
    level: "P0",
    theme: "瓷韵千年",
  },
  {
    id: "casting",
    title: "青铜铸造还原",
    tagline: "按制范、熔炼、浇筑、打磨，亲历青铜器诞生。",
    glyph: "铸",
    level: "P1",
    theme: "青铜礼乐",
  },
  {
    id: "scroll",
    title: "书画长卷拼接",
    tagline: "把打乱的画面段落，拖回卷轴的叙事顺序。",
    glyph: "卷",
    level: "P1",
    theme: "丹青长卷",
  },
  {
    id: "motif",
    title: "纹饰配对",
    tagline: "把纹饰与器物、寓意一一配对，读懂吉祥密码。",
    glyph: "纹",
    level: "P2",
    theme: "器物纹样",
  },
  {
    id: "timeline",
    title: "年代排序",
    tagline: "把文物放回时间轴的正确朝代，点亮朝代图鉴。",
    glyph: "序",
    level: "P2",
    theme: "千年序列",
  },
];

// ---------- 青铜铸造还原 ----------

export type CastingStep = { glyph: string; name: string; desc: string; hint: string };

export const CASTING_STEPS: CastingStep[] = [
  { glyph: "范", name: "制范", desc: "以陶土塑出器物内范与外范", hint: "先用陶土做出内外两层的模范" },
  { glyph: "熔", name: "熔炼", desc: "铜、锡、铅按比例熔成铜液", hint: "把铜、锡、铅按配比加热熔炼" },
  { glyph: "浇", name: "浇筑", desc: "铜液注入范腔，冷却成形", hint: "把铜液浇进范的腔体里" },
  { glyph: "磨", name: "打磨", desc: "破范取器，修整打磨纹饰", hint: "打碎陶范、取出器物再打磨" },
];

export const CASTING_UNLOCK = {
  title: "工艺词条 · 范铸法",
  body: "范铸法：先以陶土制作内范与外范，合范后浇入铜液，待冷却破范取器，再行打磨修整。商周青铜器的绝大多数重器，皆以此法铸成。",
};

// ---------- 书画长卷拼接 ----------

export type ScrollSegment = { id: string; title: string; line: string; clue: string; art: string };

// 长卷各段的「画面」：内联水墨 SVG，保证离线自包含、与牛皮纸国风视觉一致。
const ink = "#5c5140";
const inkSoft = "#6b5d48";
const paper = "#e9dcba";
const paperDeep = "#cdbc92";
const water = "#93a79b";

export const SCROLL_SEGMENTS: ScrollSegment[] = [
  {
    id: "s1",
    title: "城郊晨曦",
    line: "破晓，远山笼雾，城门初开，一日的市声渐起。",
    clue: "画卷的开端，天色未明",
    art: `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="城郊晨曦">
      <rect width="260" height="150" fill="${paper}"/>
      <circle cx="196" cy="80" r="15" fill="#c8933d" opacity="0.9"/>
      <circle cx="196" cy="80" r="15" fill="none" stroke="#b98a34" opacity="0.55"/>
      <path d="M0 118 Q36 84 70 102 Q96 72 130 94 Q158 66 196 92 Q226 76 260 96 L260 150 L0 150 Z" fill="#b7a47e" opacity="0.6"/>
      <path d="M0 126 Q44 104 88 116 Q124 96 164 112 Q202 100 234 114 L260 108 L260 150 L0 150 Z" fill="#8f7d5c" opacity="0.65"/>
      <rect x="20" y="66" width="11" height="46" fill="${ink}"/>
      <rect x="15" y="61" width="22" height="6" fill="#4a4233"/>
      <path d="M24 122 Q60 116 96 122 M120 120 Q150 118 176 120" stroke="#7a6a4f" fill="none" stroke-width="1.4" opacity="0.7"/>
      <path d="M40 118 L40 96 M40 104 Q32 100 36 91 M40 104 Q48 100 44 91" stroke="${ink}" fill="none" stroke-width="1.5"/>
      <path d="M0 108 Q70 100 140 106 Q210 110 260 104" stroke="#efe2c2" fill="none" stroke-width="4" opacity="0.6"/>
    </svg>`,
  },
  {
    id: "s2",
    title: "漕运繁忙",
    line: "河上舟楫往来，纤夫号子与桨声交织。",
    clue: "晨曦之后，河面开始忙碌",
    art: `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="漕运繁忙">
      <rect width="260" height="150" fill="${paper}"/>
      <path d="M0 44 Q60 38 130 42 Q200 46 260 40 L260 0 L0 0 Z" fill="#cbbd98" opacity="0.6"/>
      <path d="M0 74 Q80 70 160 74 Q220 78 260 74 L260 150 L0 150 Z" fill="${water}"/>
      <path d="M0 82 Q60 86 120 82 M140 90 Q190 86 240 90 M20 100 Q80 104 140 100" stroke="#7d8f84" fill="none" stroke-width="1.3" opacity="0.7"/>
      <path d="M50 74 L62 74 L60 50 L50 74 Z" fill="${ink}"/>
      <path d="M56 74 L56 50" stroke="${ink}" stroke-width="1.2"/>
      <path d="M46 76 Q56 82 68 76" stroke="#4a4233" fill="none" stroke-width="1.4"/>
      <path d="M120 78 Q132 86 148 78 L148 80 Q132 90 120 80 Z" fill="${ink}"/>
      <path d="M128 78 L128 70 M138 79 L138 71" stroke="#4a4233" stroke-width="1.2"/>
      <path d="M196 80 Q210 90 232 80 L232 82 Q210 92 196 82 Z" fill="${inkSoft}"/>
      <path d="M206 80 L206 70 M216 80 L216 70" stroke="#4a4233" stroke-width="1.2"/>
      <path d="M0 74 Q60 70 120 74" stroke="#8f7d5c" fill="none" stroke-width="1.6"/>
      <circle cx="30" cy="70" r="2.6" fill="${ink}"/>
      <circle cx="52" cy="69" r="2.6" fill="${ink}"/>
      <circle cx="74" cy="69" r="2.6" fill="${ink}"/>
      <circle cx="96" cy="70" r="2.6" fill="${ink}"/>
    </svg>`,
  },
  {
    id: "s3",
    title: "市井喧闹",
    line: "街市商铺林立，行人如织，叫卖声此起彼伏。",
    clue: "最热闹的一段，人最多",
    art: `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="市井喧闹">
      <rect width="260" height="150" fill="${paper}"/>
      <rect x="12" y="34" width="52" height="52" fill="#d8c9a2"/>
      <path d="M8 34 L40 22 L72 34" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <rect x="70" y="36" width="48" height="50" fill="#e2d3ac"/>
      <path d="M66 36 L96 24 L126 36" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <rect x="124" y="34" width="50" height="52" fill="#d8c9a2"/>
      <path d="M120 34 L150 22 L180 34" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <rect x="180" y="36" width="60" height="50" fill="#e2d3ac"/>
      <path d="M176 36 L212 24 L248 36" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path d="M18 40 L58 40 M20 48 L56 48" stroke="#a84a2c" stroke-width="1.4"/>
      <rect x="30" y="18" width="3" height="18" fill="#a84a2c"/>
      <rect x="150" y="16" width="3" height="20" fill="#a84a2c"/>
      <path d="M150 16 L156 22 L150 28" fill="#a84a2c"/>
      <rect x="210" y="16" width="3" height="20" fill="#a84a2c"/>
      <circle cx="34" cy="92" r="3" fill="${ink}"/><circle cx="46" cy="94" r="3" fill="${inkSoft}"/>
      <circle cx="88" cy="92" r="3" fill="${ink}"/><circle cx="100" cy="94" r="3" fill="${inkSoft}"/>
      <circle cx="142" cy="92" r="3" fill="${ink}"/><circle cx="156" cy="94" r="3" fill="${inkSoft}"/>
      <circle cx="198" cy="92" r="3" fill="${ink}"/><circle cx="216" cy="94" r="3" fill="${inkSoft}"/>
      <path d="M0 120 Q130 114 260 120 L260 150 L0 150 Z" fill="${paperDeep}"/>
    </svg>`,
  },
  {
    id: "s4",
    title: "虹桥观景",
    line: "虹桥飞架两岸，众人凭栏远眺，指点风光。",
    clue: "一座桥把两岸连起来",
    art: `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="虹桥观景">
      <rect width="260" height="150" fill="${paper}"/>
      <path d="M0 96 Q130 40 260 96 L260 150 L0 150 Z" fill="${water}"/>
      <path d="M30 110 Q130 44 230 110" fill="none" stroke="${ink}" stroke-width="7"/>
      <path d="M30 110 Q130 44 230 110" fill="none" stroke="${paper}" stroke-width="2" opacity="0.8"/>
      <path d="M22 112 Q130 50 238 112" fill="none" stroke="#4a4233" stroke-width="2.4"/>
      <path d="M52 96 L54 84 M84 72 L86 62 M130 54 L130 46 M176 66 L174 76 M210 84 L208 94" stroke="${ink}" stroke-width="1.6"/>
      <circle cx="130" cy="52" r="2.6" fill="${ink}"/>
      <circle cx="140" cy="56" r="2.6" fill="${inkSoft}"/>
      <circle cx="120" cy="58" r="2.6" fill="${ink}"/>
      <path d="M120 108 Q130 116 146 108 L146 110 Q130 118 120 110 Z" fill="${inkSoft}"/>
      <circle cx="133" cy="110" r="2" fill="${ink}"/>
      <path d="M150 116 Q170 122 190 116 M210 122 Q226 126 242 122" stroke="#7d8f84" fill="none" stroke-width="1.3" opacity="0.7"/>
    </svg>`,
  },
  {
    id: "s5",
    title: "归途夕照",
    line: "暮色四合，炊烟袅袅，行人踏上归途。",
    clue: "画卷的收束，天色将晚",
    art: `<svg viewBox="0 0 260 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="归途夕照">
      <rect width="260" height="150" fill="#eed7ae"/>
      <circle cx="130" cy="92" r="30" fill="#c8742f" opacity="0.9"/>
      <circle cx="130" cy="92" r="30" fill="none" stroke="#a8621f" opacity="0.5"/>
      <path d="M0 128 Q40 100 80 116 Q110 96 150 112 Q190 100 220 114 L260 106 L260 150 L0 150 Z" fill="#8a735a" opacity="0.7"/>
      <rect x="40" y="96" width="26" height="24" fill="${inkSoft}"/>
      <path d="M36 96 L54 82 L72 96" fill="none" stroke="#4a4233" stroke-width="1.6"/>
      <rect x="168" y="92" width="30" height="28" fill="${inkSoft}"/>
      <path d="M162 92 L184 76 L206 92" fill="none" stroke="#4a4233" stroke-width="1.6"/>
      <path d="M54 82 Q56 72 50 64 Q56 58 52 50" stroke="#cbbd98" fill="none" stroke-width="2.4" opacity="0.8"/>
      <path d="M184 76 Q188 66 182 58 Q188 52 184 44" stroke="#cbbd98" fill="none" stroke-width="2.4" opacity="0.8"/>
      <path d="M120 120 L120 96 M120 106 Q110 100 116 90 M120 106 Q130 100 124 90" stroke="#4a4233" fill="none" stroke-width="1.6"/>
      <circle cx="86" cy="114" r="2.6" fill="#4a4233"/><path d="M86 117 L86 126" stroke="#4a4233" stroke-width="1.4"/>
      <circle cx="150" cy="118" r="2.6" fill="#4a4233"/><path d="M150 121 L150 130" stroke="#4a4233" stroke-width="1.4"/>
    </svg>`,
  },
];

export const SCROLL_TITLE = "江南春晓图";

// ---------- 纹饰配对 ----------

export type MotifPair = {
  id: string;
  motif: string; // 纹饰名
  motifGlyph: string;
  artifact: string; // 器物
  meaning: string; // 寓意
};

export const MOTIF_PAIRS: MotifPair[] = [
  { id: "cloud", motif: "云雷纹", motifGlyph: "云", artifact: "青铜方彝", meaning: "回环绵延 · 敬天礼神" },
  { id: "lotus", motif: "缠枝莲纹", motifGlyph: "莲", artifact: "景泰蓝瓶炉", meaning: "连绵不绝 · 清雅吉祥" },
  { id: "dragon", motif: "蟠龙纹", motifGlyph: "龙", artifact: "青花龙纹盘", meaning: "皇权威仪 · 祥瑞之兆" },
  { id: "taotie", motif: "兽面纹", motifGlyph: "面", artifact: "青铜兽面纹觥", meaning: "狰狞威严 · 祭祀通灵" },
];

// ---------- 年代排序 ----------

export type TimelineItem = { id: string; artifact: string; dynasty: string; hint: string };

// 朝代按时间先后排列（index 即正确位置）
export const TIMELINE_ITEMS: TimelineItem[] = [
  { id: "shang", artifact: "青铜兽面纹觥", dynasty: "商", hint: "三千多年前，甲骨与青铜并盛" },
  { id: "xizhou", artifact: "青铜方彝", dynasty: "西周", hint: "礼乐制度确立的时代" },
  { id: "xihan", artifact: "镶嵌博山炉", dynasty: "西汉", hint: "博山炉焚香，仙山缥缈" },
  { id: "beiqin", artifact: "宇宙佛", dynasty: "北齐", hint: "石窟造像兴盛的南北朝" },
  { id: "qing", artifact: "青花龙纹盘", dynasty: "清", hint: "景德镇青花的鼎盛年代" },
];

// ---------- 瓷器 3D 拼图：通关解锁的深度讲解与瓷片档案 ----------

export const PORCELAIN_INFO = {
  name: "清康熙青花瓷瓶",
  period: "清 · 康熙年间（1662–1722）",
  glaze: "青花（钴蓝料，发色青翠明快，浓淡五色）",
  kiln: "景德镇窑",
  craft: "釉下彩绘，一次性高温烧成",
  shard: {
    title: "瓷片档案",
    body: "在考古中，一片带款识的瓷片，往往就能精确断代一座窑口、还原一段贸易史。你刚刚拼回的这件瓷瓶，正来自景德镇——从一块胎土，到窑火中的一次涅槃，青花在釉下永恒定格。",
  },
};
