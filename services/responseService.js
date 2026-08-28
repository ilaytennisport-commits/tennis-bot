const {
  polishResponse,
} = require("./responsePolisher");

const {
  classifyIntent,
} = require("../utils/intentClassifier");

const {
  getFaqResponse,
} = require("./faqService");


function detectAudience(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  /*
   * קודם בודקים את ההודעה הנוכחית.
   * כך "כמה עולה לילד?" לא יושפע מגיל ישן
   * שנשמר בטעות בפרופיל.
   */
  const childPatterns = [
    /ילד/,
    /ילדה/,
    /לילד/,
    /לילדה/,
    /ילדים/,
    /נוער/,
    /בן שלי/,
    /בת שלי/,
    /הבן שלי/,
    /הבת שלי/,
    /לבני/,
    /לבתי/,
    /בן\s+\d{1,2}/,
    /בת\s+\d{1,2}/,
  ];

  if (
    childPatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "child";
  }

  const adultPatterns = [
    /מבוגר/,
    /מבוגרת/,
    /מבוגרים/,
    /למבוגר/,
    /למבוגרת/,
    /בשבילי/,
    /לעצמי/,
    /עבורי/,
    /אני בן\s+\d{1,2}/,
    /אני בת\s+\d{1,2}/,
  ];

  if (
    adultPatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "adult";
  }

  /*
   * רק אם ההודעה עצמה לא מספקת תשובה,
   * משתמשים בגיל שכבר שמור בפרופיל.
   */
  const savedAge = Number(
    profile.age
  );

  if (
    Number.isFinite(savedAge) &&
    savedAge > 0
  ) {
    return savedAge >= 18
      ? "adult"
      : "child";
  }

  return null;
}


/*
 * שאלות על ימים / שעות / מערכת אימונים.
 *
 * אין כאן המצאה של ימים או שעות.
 * הזמינות נקבעת לפי הקבוצות הקיימות
 * וההתאמה בפועל.
 */
function isScheduleQuestion(
  message = ""
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (!text) {
    return false;
  }

  return (
    /באיזה ימים/.test(text) ||
    /באילו ימים/.test(text) ||
    /איזה ימים/.test(text) ||
    /מה הימים/.test(text) ||
    /ימי האימון/.test(text) ||
    /ימי אימון/.test(text) ||
    /מתי יש אימונים/.test(text) ||
    /מתי האימונים/.test(text) ||
    /באיזה שעות/.test(text) ||
    /באילו שעות/.test(text) ||
    /איזה שעות/.test(text) ||
    /מה השעות/.test(text) ||
    /שעות האימון/.test(text) ||
    /שעות אימון/.test(text) ||
    /מערכת אימונים/.test(text) ||
    /לוח אימונים/.test(text)
  );
}


function buildScheduleResponse(
  profile = {}
) {
  const branch =
    profile.branch || null;

  const audience =
    detectAudience(
      "",
      profile
    );

  const parts = [
    "יש מספר קבוצות וימי אימון, וההתאמה נעשית לפי גיל, רמה והקבוצות הקיימות.",
  ];

  if (branch) {
    parts.push("");
    parts.push(
      `כבר שמור לי שהסניף המבוקש הוא ${branch}.`
    );
  }

  if (
    audience === "child"
  ) {
    parts.push("");
    parts.push(
      "לילדים, הצוות מתאים את הקבוצה לפי הגיל והרמה ולא לפי שעה קבועה מראש."
    );
  }

  if (
    audience === "adult"
  ) {
    parts.push("");
    parts.push(
      "למבוגרים, ההתאמה נעשית לפי הרמה וסוג האימון המתאים."
    );
  }

  parts.push("");
  parts.push(
    "אחרי קבלת הפרטים, צוות האקדמיה יבדוק את הקבוצות המתאימות ויחזור עם הימים והשעות הרלוונטיים."
  );

  return parts.join("\n");
}


function getAutomatedResponse(
  message,
  profile = {}
) {
  /*
   * קודם כל שאלות לוח אימונים,
   * כדי שלא יגיעו בטעות ל-OpenAI.
   */
  if (
    isScheduleQuestion(
      message
    )
  ) {
    const audience =
      detectAudience(
        message,
        profile
      );

    const response =
      buildScheduleResponse(
        profile
      );

    console.log(
      "🧭 זיהוי תשובה אוטומטית:",
      {
        message,
        intent: "schedule",
        confidence: 1,
        audience,
        handled: true,
      }
    );

    return {
      handled: true,
      intent: "schedule",
      confidence: 1,
      audience,
      response:
        polishResponse(
          response
        ),
    };
  }

  const {
    intent,
    confidence,
  } = classifyIntent(
    message
  );

  const audience =
    detectAudience(
      message,
      profile
    );

  const response =
    getFaqResponse(
      intent,
      {
        audience,
        profile,
        originalMessage:
          message,
      }
    );

  console.log(
    "🧭 זיהוי תשובה אוטומטית:",
    {
      message,
      intent,
      confidence,
      audience,
      handled:
        Boolean(response),
    }
  );

  return {
    handled:
      Boolean(response),
    intent,
    confidence,
    audience,
    response:
      polishResponse(
        response
      ),
  };
}


module.exports = {
  getAutomatedResponse,
  detectAudience,
};