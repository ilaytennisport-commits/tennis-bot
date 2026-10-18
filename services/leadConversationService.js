const {
  hasValue,
  looksLikeQuestion,
} = require("../utils/text");

const {
  QUESTIONS,
  askedQuestion,
  buildBranchQuestion,
} = require("../prompts/questionTexts");

/*
 * =========================================================
 * הגדרת ליד מלא — מקור אמת אחד לכל הבוט
 * =========================================================
 *
 * ליד מלא = שם + גיל + סניף + טלפון.
 * הטלפון נלקח אוטומטית מ-WhatsApp, ונשאל רק כאשר
 * המספר מוסתר (מזהה lid).
 */
const LEAD_STEPS = [
  "name",
  "age",
  "branch",
  "phone",
];

function getNextMissingStep(
  profile = {}
) {
  return (
    LEAD_STEPS.find(
      (step) => !hasValue(profile[step])
    ) || null
  );
}

function isLeadComplete(profile = {}) {
  return getNextMissingStep(profile) === null;
}

function getLastAssistantMessage(
  conversationHistory = []
) {
  return (
    [...conversationHistory]
      .reverse()
      .find(
        (message) =>
          message?.role === "assistant" &&
          typeof message.content === "string"
      )?.content || ""
  );
}

/*
 * מחזיר איזה פרט ליד הבוט שאל עליו לאחרונה.
 */
function getAskedLeadStep(
  assistantMessage = ""
) {
  if (askedQuestion(assistantMessage, "leadName")) {
    return "name";
  }

  if (askedQuestion(assistantMessage, "leadAge")) {
    return "age";
  }

  if (askedQuestion(assistantMessage, "leadBranch")) {
    return "branch";
  }

  if (askedQuestion(assistantMessage, "leadPhone")) {
    return "phone";
  }

  return null;
}

function getQuestionForStep(step) {
  switch (step) {
    case "name":
      return QUESTIONS.leadName;

    case "age":
      return QUESTIONS.leadAge;

    case "branch":
      return buildBranchQuestion();

    case "phone":
      return QUESTIONS.leadPhone;

    default:
      return null;
  }
}

/*
 * בדיקה בסיסית שהטקסט באמת
 * יכול להיות שם של אדם.
 */
function normalizeName(
  message = ""
) {
  const text = String(message).trim();

  /*
   * "ליזה, מתעניינת בחוג טניס" → "ליזה".
   * אם יש פסיק / מקף, מנסים קודם את החלק הראשון.
   */
  const firstPart = text
    .split(/\s*[,،]\s*|\s+[-–—]\s+/)[0];

  if (firstPart && firstPart !== text) {
    const firstPartName =
      normalizeSingleName(firstPart);

    if (firstPartName) {
      return firstPartName;
    }
  }

  return normalizeSingleName(text);
}

function normalizeSingleName(
  message = ""
) {
  const name = String(message)
    .trim()
    .replace(
      /^(קוראים לי|קוראים לו|קוראים לה|השם הוא|השם שלו|השם שלה|השם שלי|שמי|שמו|שמה)\s+/,
      ""
    )
    .replace(/[.!,]+$/, "")
    .trim();

  if (looksLikeQuestion(name)) {
    return null;
  }

  if (
    name.length < 2 ||
    name.length > 40
  ) {
    return null;
  }

  if (/\d/.test(name)) {
    return null;
  }

  const words =
    name
      .split(/\s+/)
      .filter(Boolean);

  if (words.length > 4) {
    return null;
  }

  /*
   * מונע מטקסטים נפוצים של FAQ
   * להפוך לשם.
   */
  if (
    /מחיר|עולה|אימון|אימונים|ימים|שעות|שעה|סניף|כתובת|איפה|מתי|חוג|קבוצה|קבוצות|ניסיון|נסיון|מחבט|ציוד/.test(
      name.toLowerCase()
    )
  ) {
    return null;
  }

  return name;
}

function normalizeBranch(
  message = ""
) {
  const text = String(message)
    .trim()
    .toLowerCase();

  if (
    text.includes("גלי הדר") ||
    text.includes("ראשון לציון") ||
    text === "ראשון" ||
    text === "גלי" ||
    text.includes("רמז 96")
  ) {
    return "גלי הדר – ראשון לציון";
  }

  if (
    text.includes("בית חשמונאי") ||
    text.includes("חשמונאי")
  ) {
    return "בית חשמונאי";
  }

  return null;
}

function normalizeAge(message = "") {
  const ageMatch =
    String(message).match(/\d{1,2}/);

  const age = ageMatch
    ? Number(ageMatch[0])
    : null;

  if (
    !Number.isInteger(age) ||
    age < 4 ||
    age > 99
  ) {
    return null;
  }

  return age;
}

function normalizePhoneAnswer(
  message = ""
) {
  const digits = String(message).replace(
    /[^\d+]/g,
    ""
  );

  if (/^(?:\+972|972)5\d{8}$/.test(digits)) {
    return `0${digits.replace(/^\+?972/, "")}`;
  }

  if (/^05\d{8}$/.test(digits)) {
    return digits;
  }

  if (/^0[2-9]\d{7}$/.test(digits)) {
    return digits;
  }

  return null;
}

const COMPLETED_REPLY =
  "תודה 😊\n\nהפרטים הועברו לצוות האקדמיה, ונחזור אליכם בהקדם.";

function buildNextQuestion(
  profile = {}
) {
  const nextStep =
    getNextMissingStep(profile);

  if (!nextStep) {
    return {
      reply: COMPLETED_REPLY,
      completed: true,
    };
  }

  const opener =
    nextStep === "name"
      ? "בשמחה 😊"
      : "תודה 😊";

  return {
    reply: `${opener}\n\n${getQuestionForStep(
      nextStep
    )}`,
    completed: false,
  };
}

const INVALID_ANSWER_REPLIES = {
  name: "אשמח לקבל את שם המתאמן או המתאמנת.",
  age: `${QUESTIONS.leadAge} אפשר לכתוב את הגיל במספרים.`,
  branch: [
    "איזה סניף מתאים לכם?",
    "• גלי הדר – ראשון לציון",
    "• בית חשמונאי",
  ].join("\n"),
  phone:
    "אפשר לכתוב מספר טלפון בפורמט 05XXXXXXXX 😊",
};

const NORMALIZERS = {
  name: normalizeName,
  age: normalizeAge,
  branch: normalizeBranch,
  phone: normalizePhoneAnswer,
};

function getLeadContinuation({
  userMessage = "",
  conversationHistory = [],
  userProfile = {},
}) {
  const text = String(userMessage)
    .trim();

  const step = getAskedLeadStep(
    getLastAssistantMessage(
      conversationHistory
    )
  );

  if (!step) {
    return null;
  }

  /*
   * שאלה באמצע איסוף הליד —
   * ה-router יענה עליה ויחזור לשאלה.
   */
  if (looksLikeQuestion(text)) {
    return null;
  }

  const value = NORMALIZERS[step](text);

  if (value === null) {
    return {
      reply: INVALID_ANSWER_REPLIES[step],
      updates: {},
      completed: false,
    };
  }

  const next = buildNextQuestion({
    ...userProfile,
    [step]: value,
  });

  return {
    updates: {
      [step]: value,
    },
    reply: next.reply,
    completed: next.completed,
  };
}

module.exports = {
  LEAD_STEPS,
  getNextMissingStep,
  isLeadComplete,
  getAskedLeadStep,
  getQuestionForStep,
  buildNextQuestion,
  getLeadContinuation,
  normalizeName,
  normalizeBranch,
  normalizePhoneAnswer,
  COMPLETED_REPLY,
};
