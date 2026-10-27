// ---------- 中英文切换：右上角语言按钮 + 全站静态文案切换 ----------

export type Lang = "zh" | "en";

const LANG_KEY = "huaxia-lang";

type Entry = { zh: string; en: string };

const dict: Record<string, Entry> = {
  // 导航
  nav_home: { zh: "首页", en: "Home" },
  nav_gallery: { zh: "馆藏图鉴", en: "Collection" },
  nav_about: { zh: "关于我们", en: "About Us" },
  nav_enter: { zh: "进入展厅 →", en: "Enter Hall →" },
  nav_games: { zh: "趣味游戏", en: "Fun Games" },

  // 首页 hero
  hero_kicker: { zh: "华 夏 文 明 · 千 载 重 器", en: "C H I N E S E · C I V I L I Z A T I O N" },
  hero_title: { zh: "华夏珍宝数字博物馆", en: "Huaxia Digital Museum of Treasures" },
  hero_intro: {
    zh: "一件文物，一段文明。本馆以三维技术复现国之重器，将四羊方尊、马踏飞燕、击鼓说唱陶俑与景泰蓝瓶炉等馆藏陈列于数字展厅，足不出户，亦可驻足凝望千年之美。点击右上角「馆藏图鉴」可按主题逐件欣赏馆藏的纹饰与故事，或点击「进入展厅」亲临 3D 展厅漫游观览。",
    en: "Each artifact holds a story of civilization. With 3D reconstruction, our digital hall brings national treasures—the Four-Goat Square Zun, the Galloping Horse, the Drumming Pottery Figure and the Cloisonné Vase—right to your screen. Browse the gallery by theme to admire patterns and stories piece by piece, or step into the 3D exhibition hall for an immersive tour.",
  },

  // 首页场馆介绍
  v_kicker: { zh: "场 馆 介 绍 · V E N U E", en: "V E N U E · I N T R O" },
  v_title: { zh: "场馆介绍", en: "Venue Introduction" },
  v_stat1: { zh: "三维数字化展品", en: "3D-digitized artifacts" },
  v_stat2: { zh: "主题展区", en: "themed exhibition halls" },
  v_stat3: { zh: "可对话历史人物", en: "historical figures to chat with" },
  v_b1: { zh: "件", en: "Pcs" },
  v_b2: { zh: "大区", en: "Halls" },
  v_b3: { zh: "位", en: "Count" },
  v_c1: { zh: "青铜礼乐馆", en: "Bronze & Ritual Hall" },
  v_p1: { zh: "礼乐重器 · 金声玉振", en: "Ritual bronzes · timeless resonance" },
  v_c2: { zh: "瓷韵千年馆", en: "Porcelain Hall" },
  v_p2: { zh: "千年窑火 · 瓷上流光", en: "Kilns of a thousand years" },
  v_c3: { zh: "佛光庄严馆", en: "Buddhist Hall" },
  v_p3: { zh: "梵音禅意 · 庄严宝相", en: "Serenity & sacred art" },
  v_c4: { zh: "世界文明馆", en: "World Civilizations" },
  v_p4: { zh: "文明互鉴 · 和而不同", en: "Dialogues across civilizations" },
  v_c5: { zh: "自然与宇宙馆", en: "Nature & Cosmos" },
  v_p5: { zh: "万物有灵 · 天地同辉", en: "Nature, cosmos & wonder" },
  v_c6: { zh: "科技体验馆", en: "Tech Experience" },
  v_p6: { zh: "古今科技 · 智启未来", en: "Ancient ingenuity · future vision" },

  // 首页藏品概览
  sc_kicker: { zh: "馆 藏 精 华 · C O L L E C T I O N", en: "F E A T U R E D · C O L L E C T I O N" },
  sc_title: { zh: "藏品概览", en: "Featured Collections" },
  sc_loading: { zh: "正在陈列第 {a} / {b} 件…", en: "Arranging piece {a} / {b}…" },
  sc_tip: { zh: "点击任一藏品，进入馆藏图鉴继续欣赏", en: "Click any piece to explore the full gallery" },

  // 图鉴页
  g_kicker: { zh: "馆 藏 文 物 · 精 品 图 鉴", en: "G A L L E R Y · C U R A T E D" },
  g_title: { zh: "文物图鉴", en: "Artifact Gallery" },
  g_sidebar_title: { zh: "图鉴主题", en: "Gallery Themes" },
  g_sidebar_sub: { zh: "按展厅主题浏览馆藏", en: "Browse by exhibition theme" },
  g_count_pre: { zh: "第 ", en: "Piece " },
  g_count_mid: { zh: " 件 · 共 ", en: " of " },
  g_count_suf: { zh: " 件", en: "" },
  g_caption: { zh: "三维数字模型 · 可拖动旋转、滚动缩放查看纹饰", en: "3D model · Drag to rotate, scroll to zoom" },
  g_loading: { zh: "正在陈列…", en: "Arranging…" },
  g_loading_name: { zh: "正在陈列「{name}」…", en: "Arranging “{name}”…" },
  g_empty_name: { zh: "该主题暂未收录三维展品", en: "No 3D exhibits in this theme yet" },
  g_empty_highlight: { zh: "更多馆藏正在整理中，敬请期待。", en: "More artifacts are being prepared. Stay tuned." },
  g_empty_desc: { zh: "您可以在其他主题图鉴中欣赏已收录的三维文物，或进入 3D 展厅漫游参观。", en: "Explore artifacts in other themes, or wander the 3D exhibition hall." },
  g_talk_pre: { zh: "🗣 假如文物会说话 · 与「", en: "🗣 If Artifacts Could Speak · Talk to “" },
  g_talk_end: { zh: "」对话", en: "”" },

  // 文物对话面板
  talk_title: { zh: "假如文物会说话", en: "If Artifacts Could Speak" },
  talk_sub: { zh: "文物第一人称 · 与游客对话", en: "Speaking as the artifact · Chat with visitors" },
  talk_sub_name: { zh: "文物第一人称 · 与「{name}」对话", en: "Speaking as “{name}” · Chat with the artifact" },
  suggest_title: { zh: "可以这样问我", en: "Try asking" },
  talk_placeholder: { zh: "向这件文物提问…", en: "Ask this artifact…" },

  // 首页智能导航
  agent_title: { zh: "智能导航讲解", en: "AI Guide" },
  agent_status_ok: { zh: "已连接 · 可开始引导讲解", en: "Connected · Ready to guide" },
  agent_status_fail: { zh: "未连接讲解服务", en: "Guide service offline" },
  agent_welcome: {
    zh: "欢迎光临华夏珍宝数字博物馆。点「引导讲解」或直接向我提问，我来为您导览。",
    en: "Welcome to Huaxia Digital Museum. Tap “Guided Tour” or ask me anything—I'll be your guide.",
  },
  agent_placeholder: { zh: "向讲解员提问…", en: "Ask the guide…" },
  suggest_guide: { zh: "🗺 引导讲解 · 由讲解员带您参观", en: "🗺 Guided Tour · Let the guide show you around" },
  me: { zh: "我", en: "Me" },
  agent_role: { zh: "讲解", en: "Guide" },
  g_talk_mark: { zh: "物", en: "Relic" },

  // 首页推荐问题
  q1: { zh: "介绍一下这座博物馆", en: "Introduce this museum" },
  q2: { zh: "推荐一条参观路线", en: "Recommend a route" },
  q3: { zh: "馆里有哪些镇馆之宝？", en: "What are the museum's treasures?" },
  q4: { zh: "馆里有哪些展厅？", en: "What halls does the museum have?" },
  q5: { zh: "青铜器馆里有什么文物？", en: "What artifacts are in the Bronze Hall?" },

  // 关于我们
  ab_kicker: { zh: "关 于 我 们 · ABOUT", en: "A B O U T · U S" },
  ab_title: { zh: "华夏珍宝数字博物馆", en: "Huaxia Digital Museum of Treasures" },
  ab_lead: {
    zh: "一座以三维技术复现华夏珍宝的线上数字博物馆。我们尝试用数字化的方式，让每一件沉默的文物开口说话——让历史可看、可听、可对话，也让更多人跨越时空与障碍，走近文物背后的文明。",
    en: "A digital museum that reconstructs Chinese treasures in 3D. We let silent artifacts speak—making history visible, audible and conversable, so everyone can reach the civilizations behind the relics.",
  },
  ab_s1_title: { zh: "项目简介", en: "About the Project" },
  ab_s1_body: {
    zh: "华夏珍宝数字博物馆是山东大学人工智能学院《智识千面·有声无界》课程项目，面向无障碍博物馆场景构建的数字化服务平台。项目以 3D 数字展厅为核心，复现四羊方尊、马踏飞燕、击鼓说唱陶俑、景泰蓝瓶炉等数十件馆藏珍品，并配套文物图鉴、智能导览讲解、历史人物跨时空对话与“假如文物会说话”等 AI 交互模块，探索“科技 + 文博”的沉浸式观展体验。",
    en: "Huaxia Digital Museum is a course project of the School of Artificial Intelligence, Shandong University (Smart Facets · Sound Without Borders), building an accessible digital museum. Centered on a 3D digital hall, it reconstructs dozens of treasures—the Four-Goat Square Zun, the Galloping Horse, the Drumming Pottery Figure and more—with an artifact gallery, AI-guided tours, cross-time conversations with historical figures and “If Artifacts Could Speak”, exploring immersive “technology × heritage” experiences.",
  },
  ab_s2_title: { zh: "核心功能", en: "Core Features" },
  f1_title: { zh: "3D 数字展厅", en: "3D Digital Hall" },
  f1_body: {
    zh: "模拟真实博物馆的入口、中庭与主题展区（青铜礼乐、瓷韵千年、佛光庄严、世界文明、自然与宇宙、科技体验），文物按主题阵列陈列，支持自由漫游、缩放与自动巡展。",
    en: "Recreates a real museum's entrance, atrium and themed halls (Bronze & Ritual, Porcelain, Buddhism, World Civilizations, Nature & Cosmos, Technology). Artifacts are arrayed by theme, with free roaming, zoom and auto-tour.",
  },
  f2_title: { zh: "文物图鉴", en: "Artifact Gallery" },
  f2_body: {
    zh: "牛皮纸风格的高清图鉴，按主题分类浏览全部馆藏，逐件呈现文物高清画面、纹饰细节与介绍，支持左右箭头切换欣赏。",
    en: "A kraft-paper style HD gallery. Browse every artifact by theme, view high-definition images, pattern details and introductions, and switch with left/right arrows.",
  },
  f3_title: { zh: "智能导航讲解", en: "AI-Guided Tour" },
  f3_body: {
    zh: "悬浮讲解小助手随时可唤，支持引导讲解、实时推荐问题、古文/白话切换，带你认识这座博物馆。",
    en: "A floating guide is always at hand—guided tours, live suggested questions, and classical/vernacular toggles to get to know the museum.",
  },
  f4_title: { zh: "古人跨时空对话", en: "Cross-Time Dialogue" },
  f4_body: {
    zh: "与十余位历史人物实时问答，听他们以第一人称讲述身世、时代与心声。",
    en: "Chat with over a dozen historical figures in real time, hearing their lives, times and voices in the first person.",
  },
  f5_title: { zh: "假如文物会说话", en: "If Artifacts Could Speak" },
  f5_body: {
    zh: "每一件文物都拥有自己的“人格”与记忆，可与其展开第一人称对话，听文物自述身世，向文物提问。",
    en: "Every artifact has its own persona and memory. Hold first-person conversations, hear their stories and ask them questions.",
  },
  f6_title: { zh: "无障碍体验", en: "Accessible Experience" },
  f6_body: {
    zh: "项目面向视障、听障等特殊人群设计：语音朗读文物介绍、键盘漫游操作、清晰的操作指南与简洁的界面，让参观无边界。",
    en: "Designed for visitors with visual or hearing impairments: read-aloud artifact introductions, keyboard navigation, clear guides and a clean interface—exploration without barriers.",
  },
  f7_title: { zh: "皮影小剧场", en: "Shadow Puppet Theater" },
  f7_body: {
    zh: "两位历史人物围绕文物展开对话讲解，皮影戏风格人物剪影，配合文物背景剪影与语音朗读，像看一场儿童皮影戏。",
    en: "Two historical figures dialogue around an artifact in shadow-puppet style, with silhouettes, background artifacts and voiceover—a mini children's theater.",
  },
  f8_title: { zh: "中英文双语", en: "Bilingual (CN/EN)" },
  f8_body: {
    zh: "全站支持中英文切换，界面文字、导航与介绍均可一键切换，面向更广泛的参观者。",
    en: "Full-site Chinese/English toggle for interface, navigation and descriptions, reaching a wider audience.",
  },
  ab_s3_title: { zh: "技术架构", en: "Tech Architecture" },
  t1_label: { zh: "前端", en: "Frontend" },
  t1_body: { zh: "Vite + TypeScript，单页应用架构，首页 / 展厅 / 图鉴 / 关于我们多页面路由", en: "Vite + TypeScript SPA with multi-page routing: Home / Hall / Gallery / About" },
  t2_label: { zh: "3D 渲染", en: "3D Rendering" },
  t2_body: { zh: "Three.js + GLB 模型资产，自适应分辨率与阴影优化，保障大场景流畅度", en: "Three.js + GLB assets with adaptive resolution and shadow optimization for smooth large scenes" },
  t3_label: { zh: "后端服务", en: "Backend" },
  t3_body: { zh: "Python FastAPI（museum-agent），承载知识库检索与问答", en: "Python FastAPI (museum-agent) for knowledge retrieval and Q&A" },
  t4_label: { zh: "AI 大模型", en: "LLM" },
  t4_body: { zh: "智谱 GLM-4-Flash 大模型驱动，角色化人设与多轮对话，支持儿童剧剧本生成", en: "Zhipu GLM-4-Flash powers role-based persona, multi-turn dialogue and children's play script generation" },
  t5_label: { zh: "语音合成", en: "TTS" },
  t5_body: { zh: "浏览器内置 TTS，按人物身份匹配音色（帝王低沉、文人飘逸、僧人沉稳等）", en: "Built-in browser TTS with voice matched to character identity (deep emperors, elegant scholars, calm monks, etc.)" },
  t6_label: { zh: "知识库", en: "Knowledge Base" },
  t6_body: { zh: "结构化 JSON 知识库（文物条目、历史人物条目、主题展区条目），支持检索增强回答", en: "Structured JSON knowledge base (artifacts, figures, halls) with retrieval-augmented answers" },
  t7_label: { zh: "无障碍", en: "Accessibility" },
  t7_body: { zh: "键盘操作、语音朗读、推荐问题引导、操作指南可视化等", en: "Keyboard control, read-aloud, suggested questions, visual operation guides and more" },
  t8_label: { zh: "双语", en: "Bilingual" },
  t8_body: { zh: "中英文双语切换，全站文案支持中英双语展示", en: "Full-site Chinese/English toggle across all copy" },
  ab_s4_title: { zh: "我们的理念", en: "Our Vision" },
  ab_s4_body: {
    zh: "博物馆不应有门槛，历史不应有回声。我们相信，技术可以让文物“被看见”、让知识“被听见”、让对话“无边界”。华夏珍宝数字博物馆将一如既往地在数字技术与人文关怀的交汇处探索，让千年文明走进每一个人的日常。",
    en: "Museums should have no thresholds, and history no echo. We believe technology lets artifacts be seen, knowledge be heard and dialogue know no borders. Huaxia Digital Museum will keep exploring the crossroads of technology and humanity, bringing millennia of civilization into everyone's everyday life.",
  },

  // 页脚
  footer_main: { zh: "华夏珍宝数字博物馆 · 三维馆藏展示 · 让文物活起来", en: "Huaxia Digital Museum · 3D Collections · Bringing Artifacts to Life" },
  footer_about: { zh: "华夏珍宝数字博物馆 · 山东大学人工智能学院《智识千面·有声无界》课程项目", en: "Huaxia Digital Museum · Course project of School of AI, Shandong University" },
  footer_back: { zh: "返回首页", en: "Back to Home" },
  footer_enter: { zh: "进入展厅", en: "Enter Hall" },

  // 通用
  send: { zh: "发送", en: "Send" },

  // 趣味游戏（游戏中心 / 游戏壳）
  gm_kicker: { zh: "趣 味 游 戏 · P L A Y & L E A R N", en: "F U N · G A M E S" },
  gm_title: { zh: "趣味游戏", en: "Fun Games" },
  gm_sub: { zh: "看展引发兴趣，动手理解文化，通关解锁讲解与徽章。", en: "Play to understand, clear to unlock stories and badges." },
  gm_difficulty: { zh: "难度", en: "Difficulty" },
  gm_diff_child: { zh: "儿童", en: "Child" },
  gm_diff_youth: { zh: "青少年", en: "Youth" },
  gm_diff_adult: { zh: "成人", en: "Adult" },
  gm_start: { zh: "开始游戏", en: "Start" },
  gm_tutorial: { zh: "玩法", en: "How to play" },
  gm_steps: { zh: "步数", en: "Steps" },
  gm_time: { zh: "用时", en: "Time" },
  gm_progress: { zh: "完整度", en: "Progress" },
  gm_hint: { zh: "提示", en: "Hint" },
  gm_quit: { zh: "退出", en: "Quit" },
  gm_retry: { zh: "再来一局", en: "Play again" },
  gm_back: { zh: "返回游戏中心", en: "Back to games" },
  gm_result: { zh: "通关成功", en: "Cleared!" },
  gm_score: { zh: "得分", en: "Score" },
  gm_unlock: { zh: "解锁内容", en: "Unlocked" },
  gm_timeup: { zh: "时间到", en: "Time's up" },
  gm_achievements: { zh: "我的成就", en: "Achievements" },
  gm_points: { zh: "积分", en: "Points" },
  gm_completed: { zh: "已通关", en: "Cleared" },
  gm_new_badge: { zh: "获得新徽章", en: "New badge" },
};

let currentLang: Lang = "zh";
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "zh") {
    currentLang = saved;
  }
} catch {
  // localStorage 不可用时保持中文
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  let text = entry ? entry[currentLang] ?? entry.zh : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

function applyLang(lang: Lang) {
  currentLang = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.placeholder = t(key);
    }
  });
  const button = document.getElementById("lang-toggle");
  if (button) {
    button.setAttribute("data-lang", lang);
    button.setAttribute("aria-label", lang === "zh" ? "切换到英文 / Switch to English" : "切换到中文 / Switch to Chinese");
  }
}

function initLang() {
  const button = document.getElementById("lang-toggle");
  if (button) {
    button.addEventListener("click", () => {
      applyLang(currentLang === "zh" ? "en" : "zh");
      try {
        localStorage.setItem(LANG_KEY, currentLang);
      } catch {
        // 忽略存储异常
      }
    });
  }
  applyLang(currentLang);
}

initLang();
