import { uniqueQuestions, shuffled } from "./question-pool.js";
export type RacePrompt = {
  prompt: string;
  answers: string[];
  /** خيارات ظاهرة للاعب عند استخدام وضع الاختيارات. لا تحمل علامة الإجابة الصحيحة. */
  choices?: string[];
  mediaUrl?: string;
};

export interface RaceGame {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly basePoints: number;
  readonly durationMs: number;
  readonly category?: string;
  readonly aliases?: readonly string[];
  readonly questionSource?: "MODULE" | "DATABASE";
  /** حجم بنك الأسئلة الجاهز لهذه اللعبة، قبل أسئلة الإدارة الإضافية. */
  readonly questionCount?: number;
  readonly questions?: readonly RacePrompt[];
  readonly icon?: string;
  generate(random: () => number): RacePrompt;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

const translate: RaceGame = {
  slug: "translate",
  name: "ترجم",
  description: "أول ترجمة صحيحة تخطف أعلى نقاط.",
  basePoints: 100,
  durationMs: 60_000,
  generate: (random) => {
    const item = pick([
      ["sunrise", "شروق"], ["brave", "شجاع"], ["journey", "رحلة"], ["victory", "انتصار"],
    ] as const, random);
    return { prompt: `🌍 ترجم كلمة: ${item[0]}`, answers: [item[1]] };
  },
};

const completeWord: RaceGame = {
  slug: "complete-word",
  name: "إكمل الكلمة",
  description: "اكتشف الحروف الناقصة قبل الجميع.",
  basePoints: 100,
  durationMs: 45_000,
  generate: (random) => {
    const item = pick([
      ["بر_م_ج", "برمجة"], ["م_ا_س", "منافس"], ["ا_ت_ار", "انتصار"], ["مغ_م_ة", "مغامرة"],
    ] as const, random);
    return { prompt: `🧩 أكمل الكلمة: ${item[0]}`, answers: [item[1]] };
  },
};

const flags: RaceGame = {
  slug: "flags",
  name: "أعلام",
  description: "اعرف الدولة من علمها بأسرع وقت.",
  basePoints: 100,
  durationMs: 45_000,
  generate: (random) => {
    const item = pick([
      ["🇯🇴", ["الأردن", "الاردن"]], ["🇵🇸", ["فلسطين"]], ["🇸🇦", ["السعودية", "المملكة العربية السعودية"]], ["🇲🇦", ["المغرب"]], ["🇪🇬", ["مصر"]],
    ] as const, random);
    return { prompt: `🚩 لأي دولة هذا العلم؟ ${item[0]}`, answers: [...item[1]] };
  },
};

const math: RaceGame = {
  slug: "math",
  name: "تحدي الحساب",
  description: "سباق حساب سريع لمدة أقل من دقيقة.",
  basePoints: 120,
  durationMs: 40_000,
  generate: (random) => {
    const a = 4 + Math.floor(random() * 9);
    const b = 3 + Math.floor(random() * 8);
    const c = 1 + Math.floor(random() * 9);
    return { prompt: `🎯 ما ناتج: ${a} × ${b} + ${c}؟`, answers: [String(a * b + c)] };
  },
};

const capitals: RaceGame = {
  slug: "capitals",
  name: "عواصم ودول",
  description: "اعرف العاصمة أو الدولة قبل الجميع.",
  basePoints: 110,
  durationMs: 45_000,
  aliases: ["عواصم", "دول"],
  generate: (random) => {
    const item = pick([
      ["ما عاصمة الأردن؟", ["عمان", "عمّان"]], ["ما عاصمة فلسطين؟", ["القدس", "قدس"]], ["ما عاصمة المغرب؟", ["الرباط", "رباط"]], ["القاهرة عاصمة أي دولة؟", ["مصر"]], ["الرياض عاصمة أي دولة؟", ["السعودية", "المملكة العربية السعودية"]],
    ] as const, random);
    return { prompt: `🌍 ${item[0]}`, answers: [...item[1]] };
  },
};

const fastType: RaceGame = {
  slug: "fast-type",
  name: "أسرع كتابة",
  description: "انسخ الجملة بأسرع وقت وبدون أخطاء.",
  basePoints: 100,
  durationMs: 35_000,
  aliases: ["اسرع", "أسرع", "كتابة"],
  generate: (random) => {
    const sentence = pick(["Zark يجمع اللاعبين بسرعة", "المنافسة تبدأ بخطوة واحدة", "فريقك ينتظرك الآن", "السرعة تصنع الفارق"], random);
    return { prompt: `⌨️ اكتب بالضبط: **${sentence}**`, answers: [sentence] };
  },
};

const emojiGuess: RaceGame = {
  slug: "emoji-guess",
  name: "خمن الإيموجي",
  description: "فك الشفرة واعرف الكلمة أو اللعبة.",
  basePoints: 100,
  durationMs: 45_000,
  aliases: ["ايموجي", "إيموجي"],
  generate: (random) => {
    const item = pick([["⛏️🧱🌲", ["ماينكرافت", "minecraft"]], ["🚗⚽🥅", ["روكيت ليق", "rocket league"]], ["🕷️🧑", ["سبايدرمان", "سبايدر مان"]], ["🌍🚀🪐", ["فضاء", "الفضاء"]]] as const, random);
    return { prompt: `😀 ماذا تمثل؟ ${item[0]}`, answers: [...item[1]] };
  },
};

const wordOrder: RaceGame = {
  slug: "word-order",
  name: "ترتيب الجملة",
  description: "رتب الكلمات واكتب الجملة الصحيحة.",
  basePoints: 105,
  durationMs: 50_000,
  aliases: ["ترتيب", "جملة"],
  generate: (random) => {
    const sentence = pick(["فريقك جاهز للعب الآن", "المنافسة تزيد حماس السيرفر", "Zark يجمع أفضل اللاعبين"], random);
    const words = sentence.split(" ");
    const shuffled = [...words].sort(() => random() - 0.5);
    return { prompt: `🔤 رتب الكلمات: **${shuffled.join(" — ")}**`, answers: [sentence] };
  },
};

const trueFalse: RaceGame = {
  slug: "true-false",
  name: "صح أو خطأ",
  description: "احسم العبارة بسرعة قبل بقية اللاعبين.",
  basePoints: 95,
  durationMs: 35_000,
  aliases: ["صح", "خطأ", "صح خطأ"],
  generate: (random) => {
    const item = pick([
      ["الشمس نجم", ["صح", "صحيح"]],
      ["عاصمة اليابان هي سيول", ["خطأ", "غلط"]],
      ["الماء يتكون من الهيدروجين والأكسجين", ["صح", "صحيح"]],
      ["عدد قارات العالم ثماني قارات", ["خطأ", "غلط"]],
    ] as const, random);
    return { prompt: `✅❌ صح أم خطأ: **${item[0]}**`, answers: [...item[1]] };
  },
};

const quickChoice: RaceGame = {
  slug: "quick-choice",
  name: "اختيارات سريعة",
  description: "اختر الإجابة الصحيحة من ثلاثة أزرار قبل الجميع.",
  basePoints: 105,
  durationMs: 30_000,
  aliases: ["اختيارات", "خيارات", "choice"],
  generate: (random) => {
    const item = pick([
      ["ما الكوكب المعروف بالكوكب الأحمر؟", "المريخ", ["المريخ", "الزهرة", "زحل"]],
      ["كم عدد أضلاع المثلث؟", "3", ["3", "4", "5"]],
      ["ما اللغة الرسمية في البرازيل؟", "البرتغالية", ["البرتغالية", "الإسبانية", "الفرنسية"]],
      ["في أي لعبة يوجد Creeper؟", "ماينكرافت", ["ماينكرافت", "فورتنايت", "روبلوكس"]],
      ["ما عاصمة اليابان؟", "طوكيو", ["طوكيو", "سيول", "بكين"]],
      ["ما الغاز الذي يحتاجه الإنسان للتنفس؟", "الأكسجين", ["الأكسجين", "النيتروجين", "ثاني أكسيد الكربون"]],
    ] as const, random);
    return { prompt: `🎯 اختر الإجابة الصحيحة: **${item[0]}**`, answers: [item[1]], choices: [...item[2]].sort(() => random() - 0.5) };
  },
};

const letterOrder: RaceGame = {
  slug: "letter-order",
  name: "ترتيب الحروف",
  description: "رتب الحروف واكتشف الكلمة المخفية.",
  basePoints: 105,
  durationMs: 40_000,
  aliases: ["حروف"],
  generate: (random) => {
    const word = pick(["منافسة", "مغامرة", "برمجة", "انتصار", "تعاون"], random);
    const shuffled = [...word].sort(() => random() - 0.5).join(" ـ ");
    return { prompt: `🔡 رتب الحروف: **${shuffled}**`, answers: [word] };
  },
};

const whoAmI: RaceGame = {
  slug: "who-am-i",
  name: "من أنا؟",
  description: "ثلاث تلميحات تقودك إلى الشخصية أو الشيء.",
  basePoints: 115,
  durationMs: 50_000,
  aliases: ["من انا", "من أنا"],
  generate: (random) => {
    const item = pick([
      ["كوكب أحمر، رابع كواكب الشمس، اسمي يبدأ بحرف الميم", ["المريخ", "مريخ"]],
      ["بطل خارق، يتسلق الجدران، شعاره عنكبوت", ["سبايدرمان", "سبايدر مان"]],
      ["لغة برمجة، تعمل في المتصفح، اسمي يبدأ بـJava", ["جافاسكربت", "javascript", "java script"]],
    ] as const, random);
    return { prompt: `👤 من أنا؟ **${item[0]}**`, answers: [...item[1]] };
  },
};

const trivia: RaceGame = {
  slug: "trivia",
  name: "معلومات عامة",
  description: "أسئلة متنوعة في العلوم والألعاب والثقافة.",
  basePoints: 110,
  durationMs: 45_000,
  aliases: ["تريفيا", "معلومات"],
  generate: (random) => {
    const item = pick([
      ["ما أكبر محيط على الأرض؟", ["المحيط الهادئ", "الهادئ"]],
      ["كم ضلعًا للشكل السداسي؟", ["6", "ستة"]],
      ["ما العنصر الذي رمزه O؟", ["الأكسجين", "اكسجين", "أكسجين"]],
      ["في أي لعبة نجد Creeper؟", ["ماينكرافت", "minecraft"]],
    ] as const, random);
    return { prompt: `❓ ${item[0]}`, answers: [...item[1]] };
  },
};

const riddles: RaceGame = {
  slug: "riddles",
  name: "ألغاز سريعة",
  description: "حل اللغز قبل الجميع وخذ نقاط الجولة.",
  basePoints: 115,
  durationMs: 50_000,
  aliases: ["ألغاز", "الغاز", "لغز"],
  generate: (random) => {
    const item = pick([
      ["ما الشيء الذي كلما أخذت منه كبر؟", ["الحفرة", "حفرة"]],
      ["ما الشيء الذي له أسنان ولا يعض؟", ["المشط", "مشط"]],
      ["ما الشيء الذي يكتب ولا يقرأ؟", ["القلم", "قلم"]],
      ["ما الشيء الذي له رقبة بلا رأس؟", ["الزجاجة", "زجاجة"]],
      ["ما الشيء الذي يمشي بلا أرجل ويدخل الأذنين؟", ["الصوت", "صوت"]],
      ["ما الشيء الذي إذا زاد نقص؟", ["العمر", "عمر"]],
      ["ما الشيء الذي له وجه ويدان بلا جسم؟", ["الساعة", "ساعة"]],
      ["ما الشيء الذي يجففك وهو مبلل؟", ["المنشفة", "منشفة"]],
      ["ما الشيء الذي يرى كل شيء بلا عيون؟", ["المرآة", "مرآة"]],
      ["ما الشيء الذي لا يتحرك إلا بالضرب؟", ["المسمار", "مسمار"]],
      ["ما الشيء الذي يولد كبيرًا ثم يصغر؟", ["الشمعة", "شمعة"]],
      ["ما الشيء الذي يملأ الغرفة ولا يشغل حيزًا؟", ["الضوء", "ضوء"]],
    ] as const, random);
    return { prompt: `🧠 لغز: **${item[0]}**`, answers: [...item[1]] };
  },
};

const gamingQuiz: RaceGame = {
  slug: "gaming-quiz",
  name: "اختبار اللاعبين",
  description: "أسئلة سريعة من عالم الألعاب.",
  basePoints: 115,
  durationMs: 45_000,
  aliases: ["قيمنق", "gaming", "ألعاب"],
  generate: (random) => {
    const item = pick([
      ["في أي لعبة تظهر شخصية Steve؟", ["ماينكرافت", "minecraft"]],
      ["ما اسم اللعبة التي فيها Battle Royale وبناء؟", ["فورتنايت", "fortnite"]],
      ["أي لعبة فيها سيارات تلعب كرة قدم؟", ["روكيت ليق", "rocket league"]],
      ["في أي لعبة توجد خريطة San Andreas؟", ["جي تي اي", "gta", "gta v", "جراند ثفت اوتو"]],
      ["ما اسم لعبة البقاء مع Creeper؟", ["ماينكرافت", "minecraft"]],
      ["أي لعبة تنافسية مشهورة تضع قنبلة Spike؟", ["فالورانت", "valorant"]],
      ["أي لعبة تحتوي على Impostor؟", ["امونق اس", "among us", "amongus"]],
      ["أي لعبة Battle Royale فيها Erangel؟", ["ببجي", "pubg", "playerunknowns battlegrounds"]],
      ["ما اسم منصة الألعاب التي تضم Brookhaven؟", ["روبلوكس", "roblox"]],
      ["في أي لعبة نجد Poké Ball؟", ["بوكيمون", "pokemon"]],
      ["أي لعبة سباق سيارات من تطوير Psyonix؟", ["روكيت ليق", "rocket league"]],
      ["أي لعبة تصويب فيها Dust II؟", ["كاونتر سترايك", "counter strike", "cs2", "cs go"]],
    ] as const, random);
    return { prompt: `🎮 اختبار اللاعبين: **${item[0]}**`, answers: [...item[1]] };
  },
};

function quizGame(slug: string, name: string, description: string, aliases: string[], questions: ReadonlyArray<readonly [string, readonly string[]]>): RaceGame {
  return {
    slug, name, description, aliases, basePoints: 110, durationMs: 45_000,
    generate: (random) => {
      const item = pick(questions, random);
      return { prompt: `❓ ${name}: **${item[0]}**`, answers: [...item[1]] };
    },
  };
}

const extraQuizGames: RaceGame[] = [
  quizGame("animals", "عالم الحيوانات", "أسئلة سريعة عن الحيوانات والطبيعة.", ["حيوانات"], [["ما أسرع حيوان بري؟", ["الفهد", "فهد"]], ["ما الحيوان المعروف بسفينة الصحراء؟", ["الجمل", "جمل"]], ["ما أكبر حيوان في العالم؟", ["الحوت الأزرق", "الحوت الازرق"]], ["ما الحيوان الذي يغيّر لونه للتمويه؟", ["الحرباء", "حرباء"]]]),
  quizGame("science", "علوم", "اختبر معلوماتك العلمية بسرعة.", ["علوم"], [["ما الغاز الذي نتنفسه؟", ["الأكسجين", "اكسجين"]], ["ما الكوكب الأقرب للشمس؟", ["عطارد"]], ["ما وحدة قياس القوة؟", ["نيوتن"]], ["ما العضو الذي يضخ الدم؟", ["القلب", "قلب"]]]),
  quizGame("space", "الفضاء", "رحلة قصيرة بين الكواكب والنجوم.", ["فضاء"], [["ما الكوكب المعروف بالكوكب الأحمر؟", ["المريخ", "مريخ"]], ["ما أكبر كوكب في النظام الشمسي؟", ["المشتري", "مشتري"]], ["ما اسم مجرتنا؟", ["درب التبانة", "درب التبانه"]], ["ما القمر الطبيعي للأرض؟", ["القمر", "قمر"]]]),
  quizGame("football", "كرة القدم", "تحدي لعشاق المستديرة.", ["كرة", "فوتبول"], [["كم لاعبًا في الفريق داخل الملعب؟", ["11", "أحد عشر", "احد عشر"]], ["ما لون البطاقة التي تعني الطرد؟", ["الأحمر", "الاحمر"]], ["ما اسم ركلة البداية من نقطة المنتصف؟", ["ركلة البداية", "بداية"]], ["ما الدولة التي استضافت كأس العالم 2022؟", ["قطر"]]]),
  quizGame("technology", "تقنية", "أسئلة عن الأجهزة والبرمجة والتقنية.", ["تقنية", "تكنولوجيا"], [["ما اختصار وحدة المعالجة المركزية؟", ["cpu"]], ["ما اللغة الأساسية لتنسيق صفحات الويب؟", ["css"]], ["ما المتصفح الذي تطوره Google؟", ["كروم", "chrome"]], ["ما معنى RAM؟", ["ذاكرة الوصول العشوائي", "رام"]]]),
  quizGame("movies", "أفلام", "خمن معلومات من عالم السينما.", ["أفلام", "افلام"], [["ما اسم الفيلم الذي فيه شخصية Harry Potter؟", ["هاري بوتر", "harry potter"]], ["من هو بطل فيلم Titanic؟", ["ليوناردو دي كابريو", "ليوناردو"]], ["ما الفيلم الذي فيه شخصية Simba؟", ["الأسد الملك", "الاسد الملك", "lion king"]], ["أي سلسلة أفلام فيها Darth Vader؟", ["ستار وورز", "star wars"]]]),
  quizGame("series", "مسلسلات", "تحدي خفيف لمحبي المسلسلات.", ["مسلسلات"], [["في أي مسلسل تظهر شخصية Walter White؟", ["بريكنغ باد", "breaking bad"]], ["ما اسم مسلسل عن لعبة العروش؟", ["صراع العروش", "game of thrones"]], ["في أي مسلسل تظهر شخصية Eleven؟", ["سترينجر ثينغز", "stranger things"]], ["ما اسم المسلسل الكوميدي الذي فيه Friends؟", ["فريندز", "friends"]]]),
  quizGame("music", "موسيقى", "أسئلة عامة عن الموسيقى والآلات.", ["موسيقى"], [["كم وترًا في الجيتار التقليدي؟", ["6", "ستة"]], ["ما الآلة التي لها مفاتيح سوداء وبيضاء؟", ["البيانو", "بيانو"]], ["ما الرمز الموسيقي للصمت؟", ["السكتة", "سكتة"]], ["ما الآلة الوترية المشهورة في الموسيقى العربية؟", ["العود", "عود"]]]),
  quizGame("food", "مأكولات", "خمن مكونات وأطباقًا معروفة.", ["أكل", "مأكولات"], [["ما المكوّن الأساسي للحمص؟", ["الحمص", "حب الحمص"]], ["من أي بلد جاءت البيتزا أصلًا؟", ["إيطاليا", "ايطاليا"]], ["ما الفاكهة الصفراء المعروفة بغناها بالبوتاسيوم؟", ["الموز", "موز"]], ["ما الطبق الذي يتكون من أرز وسمك نيء غالبًا؟", ["سوشي", "السوشي"]]]),
  quizGame("nature", "الطبيعة", "أسئلة عن الأرض والبيئة.", ["طبيعة"], [["ما العملية التي تصنع بها النباتات غذاءها؟", ["البناء الضوئي", "التمثيل الضوئي"]], ["ما اسم الماء المتجمد؟", ["الجليد", "ثلج"]], ["ما أكبر محيط في العالم؟", ["المحيط الهادئ", "الهادئ"]], ["ما المصدر الطبيعي الرئيسي للضوء على الأرض؟", ["الشمس", "شمس"]]]),
  quizGame("colors", "ألوان", "تحدي سريع للألوان والخلط.", ["ألوان", "الوان"], [["ما اللون الناتج عن خلط الأزرق والأصفر؟", ["الأخضر", "الاخضر"]], ["ما لون السماء في يوم صافٍ؟", ["الأزرق", "الازرق"]], ["ما اللون المقابل للأبيض؟", ["الأسود", "الاسود"]], ["ما اللون الناتج عن الأحمر والأبيض؟", ["الوردي", "وردي"]]]),
  quizGame("languages", "لغات", "أسئلة لطيفة عن لغات العالم.", ["لغات"], [["ما اللغة الأكثر انتشارًا في البرازيل؟", ["البرتغالية", "برتغالي"]], ["ما لغة اليابان الرسمية؟", ["اليابانية", "ياباني"]], ["ما اللغة الرسمية في إسبانيا؟", ["الإسبانية", "الاسبانية", "إسباني"]], ["ما اللغة التي تبدأ بها عبارة Hello؟", ["الإنجليزية", "الانجليزية", "إنجليزي"]]]),
  quizGame("history", "تاريخ", "تحدي معلومات تاريخية عامة.", ["تاريخ"], [["من بنى الأهرامات في مصر القديمة؟", ["المصريون القدماء", "الفراعنة"]], ["ما المدينة التي كانت عاصمة الدولة الرومانية؟", ["روما"]], ["ما القارة التي بدأت فيها الحضارة المصرية القديمة؟", ["أفريقيا", "افريقيا"]], ["ما اسم الكتابة المصرية القديمة الشهيرة؟", ["الهيروغليفية", "هيروغليفية"]]]),
  quizGame("inventions", "اختراعات", "من اخترع ماذا؟", ["اختراعات"], [["من اخترع الهاتف؟", ["ألكسندر غراهام بيل", "غراهام بيل", "الكسندر غراهام بيل"]], ["من اخترع المصباح العملي الشهير؟", ["توماس إديسون", "توماس اديسون", "إديسون"]], ["ما الاختراع الذي يستخدم لالتقاط الصور؟", ["الكاميرا", "كاميرا"]], ["ما الاختراع المستخدم لقياس الوقت؟", ["الساعة", "ساعة"]]]),
  quizGame("internet", "الإنترنت", "أسئلة عن الويب والعالم الرقمي.", ["إنترنت", "انترنت"], [["ما اختصار شبكة الويب العالمية؟", ["www"]], ["ما الرمز المستخدم في البريد الإلكتروني؟", ["@", "آت"]], ["ما اسم محرك البحث الأشهر من Google؟", ["جوجل", "google", "غوغل"]], ["ما الامتداد الشائع للمواقع التجارية؟", ["com", ".com"]]]),
  quizGame("logic", "منطق", "ألغاز منطقية قصيرة.", ["منطق"], [["إذا كان لديك 3 تفاحات وأخذت واحدة، كم تملك؟", ["1", "واحدة", "واحد"]], ["أي رقم يأتي بعد 19؟", ["20", "عشرون"]], ["إذا كان اليوم الاثنين، فما اليوم بعد يومين؟", ["الأربعاء", "الاربعاء"]], ["ما العدد الزوجي بين 7 و9؟", ["8", "ثمانية"]]]),
  quizGame("synonyms", "مرادفات", "اعرف الكلمة القريبة في المعنى.", ["مرادفات"], [["ما مرادف كلمة سعيد؟", ["فرح", "مسرور"]], ["ما مرادف كلمة كبير؟", ["ضخم", "عظيم"]], ["ما مرادف كلمة سريع؟", ["خاطف", "عاجل"]], ["ما مرادف كلمة جميل؟", ["حسن", "رائع"]]]),
  quizGame("antonyms", "أضداد", "أوجد الكلمة المعاكسة بسرعة.", ["أضداد", "اضداد"], [["ما ضد كلمة طويل؟", ["قصير"]], ["ما ضد كلمة بارد؟", ["حار"]], ["ما ضد كلمة قريب؟", ["بعيد"]], ["ما ضد كلمة صعب؟", ["سهل"]]]),
  quizGame("countries", "بلدان العالم", "أسئلة عن الدول والمعالم.", ["بلدان", "دول"], [["في أي قارة تقع اليابان؟", ["آسيا", "اسيا"]], ["ما الدولة المشهورة ببرج إيفل؟", ["فرنسا"]], ["ما الدولة التي تقع فيها الأهرامات؟", ["مصر"]], ["ما الدولة التي تشتهر بالكنغر؟", ["أستراليا", "استراليا"]]]),
  quizGame("sports", "رياضات", "تحدي سريع في الرياضات المختلفة.", ["رياضات"], [["في أي رياضة نستخدم المضرب والكرة الصفراء؟", ["التنس", "تنس"]], ["في أي رياضة يوجد السلة؟", ["كرة السلة", "السلة"]], ["كم حلقة في شعار الألعاب الأولمبية؟", ["5", "خمسة"]], ["في أي رياضة نستخدم القفازات والحلبة؟", ["الملاكمة", "ملاكمة"]]]),
  quizGame("geography", "جغرافيا", "أسئلة خرائط ومعالم وقارات.", ["جغرافيا"], [["ما أطول نهر في أفريقيا؟", ["النيل", "نهر النيل"]], ["ما أكبر قارة في العالم؟", ["آسيا", "اسيا"]], ["ما البحر الذي يفصل أوروبا عن أفريقيا؟", ["البحر المتوسط", "المتوسط"]], ["ما الصحراء الأكبر الحارة في العالم؟", ["الصحراء الكبرى", "الصحراء الكبري"]]]),
  quizGame("books", "كتب وقصص", "أسئلة من عالم القراءة والقصص.", ["كتب", "قصص"], [["من كتب روميو وجولييت؟", ["ويليام شكسبير", "شكسبير"]], ["ما المكان الذي تحفظ فيه الكتب؟", ["المكتبة", "مكتبة"]], ["ما اسم الشخص الذي يكتب كتابًا؟", ["المؤلف", "الكاتب"]], ["ما الذي نستخدمه لحفظ صفحة في كتاب؟", ["علامة الكتاب", "فاصل الكتاب"]]]),
];

const databaseGames: RaceGame[] = [
  { slug: "logos", name: "الشعارات", description: "خمن شعار شركة أو سيارة من الصورة.", basePoints: 120, durationMs: 45_000, aliases: ["شعارات", "سيارات", "شركات", "لوجو", "لوجو سيارات", "لوجو شركات"], questionSource: "DATABASE", generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة"); } },
  { slug: "anime-silhouette", name: "بطل الأنمي", description: "اعرف الشخصية من الظل أو الصورة المخفية.", basePoints: 140, durationMs: 50_000, aliases: ["انمي", "أنمي", "بطل الانمي"], questionSource: "DATABASE", generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة"); } },
  { slug: "game-logos", name: "خمن اللعبة", description: "اعرف اللعبة من رمزها وتلميح سريع.", basePoints: 120, durationMs: 45_000, aliases: ["لعبة", "العاب", "شعار لعبة"], generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة المستورد"); } },
];

function extraQuestions(game: RaceGame): RacePrompt[] {
  const random = seededRandom(7241);
  const sentences = importedQuestionBank['fast-type'] || [];
  if(game.slug === 'word-order') return sentences.map(item => ({prompt: '🔤 رتّب الجملة: ' + shuffled(item.answers[0].split(/\s+/), random).join(' / '),answers:[item.answers[0]]}));
  if(game.slug === 'complete-word') return [...(importedQuestionBank['translate'] || []),...(importedQuestionBank['letter-order'] || [])].filter(item=>item.answers[0].length>=4&&!item.answers[0].includes(' ')).map(item=>({prompt:'🧩 أكمل الكلمة: '+[...item.answers[0]].map((letter,index)=>index===Math.floor(item.answers[0].length/2)?'_':letter).join(''),answers:[item.answers[0]]}));
  if(game.slug === 'quick-choice') return (importedQuestionBank.capitals || []).map(item=>{
    const others=shuffled((importedQuestionBank.capitals || []).map(other=>other.answers[0]).filter(answer=>!item.answers.includes(answer)),random);
    return {prompt:item.prompt,answers:[...item.answers],choices:shuffled([item.answers[0],...new Set(others)].slice(0,3),random)};
  });
  if(game.slug === 'true-false') return Array.from({length:80},(_,index)=>{const a=3+index%16,b=2+Math.floor(index/16),correct=index%2===0;return {prompt:'✅❌ صح أم خطأ: '+a+' + '+b+' = '+(a+b+(correct?0:1)),answers:correct?['صح','صحيح']:['خطأ','غلط']};});
  const topics: Record<string,RegExp> = {
    animals:/حيوان|طائر|طيور|سمك|أسماك|ثدي|زواحف|حشرات/,
    science:/غاز|ذرة|كيميائ|عنصر|جسم|عضو|خلية|عظم|قوة|حرارة|ضوء/,
    space:/كوكب|شمس|قمر|نجم|فضاء|مجرة|مجرات/,
    football:/كرة القدم|كأس العالم|لاعب|فريق/,
    technology:/حاسوب|كمبيوتر|برمجة|تقنية|معالج|ذاكرة/,
    geography:/قارة|محيط|نهر|بحر|جبل|صحراء/,
    nature:/شجر|نبات|زهرة|ماء|بيئة|مطر/,
    history:/تاريخ|حرب|قديمة|حضارة|فرعون|فراعنة/,
    food:/طعام|فاكهة|خضار|طبق|مكون|أكل/,
    sports:/رياضة|رياضي|كرة|سباق|أولمب/,
  };
  const topic=topics[game.slug];
  return topic ? (importedQuestionBank.trivia || []).filter(item=>topic.test(item.prompt)).map(item=>({...item,answers:[...item.answers]})) : [];
}

function sampleModuleQuestions(game: RaceGame): RacePrompt[] {
  const samples: RacePrompt[] = [];
  for(let seed=1;seed<=1500;seed++) {
    const item=game.generate(seededRandom(seed*7919));
    samples.push(item);
  }
  return uniqueQuestions(samples,game.slug);
}

function withImportedQuestions(game: RaceGame): RaceGame {
  const sourceSlugs=game.slug==='logos'?['car-logos','company-logos']:[game.slug];
  const imported=sourceSlugs.flatMap(slug=>[...(visualLogoQuestionBank[slug] || []),...(importedQuestionBank[slug] || [])]);
  const questions=uniqueQuestions<RacePrompt>([...imported,...(imported.length?[]:sampleModuleQuestions(game)),...extraQuestions(game)],game.slug);
  if(!questions.length)throw new Error('لا يوجد بنك أسئلة للعبة '+game.slug);
  const category=['fast-type','word-order','letter-order','complete-word','translate','synonyms','antonyms','languages'].includes(game.slug)?'كلمات ولغات':['logos','car-logos','company-logos','game-logos','anime-silhouette','emoji-guess'].includes(game.slug)?'صور وتخمين':['math','logic','quick-choice','true-false','riddles'].includes(game.slug)?'سرعة وتفكير':['movies','music','series','gaming-quiz','sports','football','books'].includes(game.slug)?'ترفيه وثقافة':'معرفة وعلوم';
  const icons: Record<string,string> = {translate:'🌍',flags:'🚩',capitals:'🌐',math:'🧮','fast-type':'⌨️','quick-choice':'🔘','true-false':'✅','car-logos':'🚘','company-logos':'🏢',logos:'🎯','anime-silhouette':'🎭','game-logos':'🎮','emoji-guess':'😎',music:'🎵',movies:'🎬',series:'📺'};
  const commands: Record<string,string[]> = {translate:['ترجم'],flags:['اعلام','أعلام'],capitals:['عواصم'],math:['حساب'],'fast-type':['اسرع','أسرع'],'complete-word':['اكمل','أكمل']};
  return {...game,aliases:commands[game.slug]||game.aliases,category,icon:icons[game.slug]||'🧠',questionSource:'MODULE',questions,questionCount:questions.length,generate:random=>{const item=pick(questions,random);return {...item,answers:[...item.answers],choices:item.choices?shuffled(item.choices,random):undefined};}};
}

// Counts represent distinct playable questions; decorative variants are never padding.
export const minimumRaceQuestionsPerGame = 1;
export const raceAnswerDurationMs = 15_000;
export const retiredRaceGameSlugs: readonly string[] = [];
const restoredLogoGames: RaceGame[] = [
  {...databaseGames[0],slug:'car-logos',name:'شعارات السيارات',description:'تعرف على شركة السيارة من شعارها أو تلميحها.',aliases:['سيارات','لوجو سيارات']},
  {...databaseGames[0],slug:'company-logos',name:'شعارات الشركات',description:'اختبر معرفتك بعلامات الشركات وصورها.',aliases:['شركات','لوجو شركات']},
];
export const raceGames: ReadonlyMap<string,RaceGame> = new Map(
  [translate,completeWord,flags,math,capitals,fastType,emojiGuess,wordOrder,trueFalse,quickChoice,letterOrder,whoAmI,trivia,riddles,gamingQuiz,...extraQuizGames,...databaseGames,...restoredLogoGames]
    .map(game=>withImportedQuestions({...game,durationMs:raceAnswerDurationMs}))
    .map(game=>[game.slug,game])
);

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ـ/g, "").replace(/[ًٌٍَُِّْ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function isCorrectAnswer(value: string, answers: readonly string[], options: { fuzzy?: boolean } = {}): boolean {
  return evaluateAnswer(value, answers, options).correct;
}

export function evaluateAnswer(value: string, answers: readonly string[], options: { fuzzy?: boolean } = {}) {
  if(!value.trim())return {correct:false,typoCount:Number.POSITIVE_INFINITY,accuracy:0};
  if (options.fuzzy === false) {
    const exact = answers.some((answer) => value.trim() === answer.trim());
    return { correct: exact, typoCount: exact ? 0 : Number.POSITIVE_INFINITY, accuracy: exact ? 1 : 0 };
  }
  const candidateForms = answerForms(value);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLength = 1;
  for (const answer of answers) {
    if(value.trim()===answer.trim())return {correct:true,typoCount:0,accuracy:1};
    const numeric=(text:string)=>text.trim().replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫','.');
    const candidateNumber=numeric(value),expectedNumber=numeric(answer),pattern=/^[+-]?\d+(?:\.\d+)?$/;
    if(pattern.test(candidateNumber)||pattern.test(expectedNumber)){
      if(pattern.test(candidateNumber)&&pattern.test(expectedNumber)&&Number(candidateNumber)===Number(expectedNumber))return {correct:true,typoCount:0,accuracy:1};
      continue;
    }
    for (const candidate of candidateForms) {
      for (const expected of answerForms(answer)) {
        const distance = levenshtein(candidate, expected);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestLength = Math.max(candidate.length, expected.length, 1);
        }
      }
    }
  }
  const exact = bestDistance === 0;
  const correct = exact || fuzzyEquivalentByDistance(bestDistance, bestLength);
  return { correct, typoCount: correct ? bestDistance : Number.POSITIVE_INFINITY, accuracy: correct ? Math.max(0, 1 - bestDistance / bestLength) : 0 };
}

function answerForms(value: string) {
  const normalized = normalizeAnswer(value);
  const withoutArticle = normalized.split(" ").map((token) => token.startsWith("ال") && token.length > 4 ? token.slice(2) : token).join(" ");
  return [...new Set([normalized, withoutArticle])].filter(Boolean);
}

function fuzzyEquivalent(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  const distance = levenshtein(left, right);
  if (Math.abs(left.length - right.length) > 2) return false;
  return fuzzyEquivalentByDistance(distance, longest);
}

function fuzzyEquivalentByDistance(distance: number, longest: number) {
  if (longest < 4) return false;
  const allowed = longest >= 8 ? 2 : 1;
  return distance <= allowed && 1 - distance / longest >= 0.78;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function calculateRacePoints(input: { basePoints: number; elapsedMs: number; durationMs: number; rank: number; daily?: boolean; combo?: number }): number {
  const elapsedRatio = Math.min(1, Math.max(0, input.elapsedMs) / input.durationMs);
  const maximum = Math.max(10, Math.min(15, Math.round(input.basePoints / 10))) + (input.daily ? 1 : 0);
  const minimum = 5;
  return Math.max(minimum, Math.min(15, Math.round(maximum - (maximum - minimum) * elapsedRatio)));
}

export function calculateWinnerPoints(input: { basePoints: number; elapsedMs: number; durationMs: number; typoCount: number; daily?: boolean }) {
  const speedPoints = calculateRacePoints({ ...input, rank: 1 });
  const typoPenalty = Math.min(3, Math.max(0, input.typoCount) * 2);
  return Math.max(5, speedPoints - typoPenalty);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
import { importedQuestionBank } from "./imported-question-bank.js";
import { visualLogoQuestionBank } from "./visual-logo-bank.js";
