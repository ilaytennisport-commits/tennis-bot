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
  const savedAge = Number(profile.age);

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

function getAutomatedResponse(
  message,
  profile = {}
) {
  const {
    intent,
    confidence,
  } = classifyIntent(message);

  const audience = detectAudience(
    message,
    profile
  );

  const response = getFaqResponse(
    intent,
    {
      audience,
      profile,
      originalMessage: message,
    }
  );

  console.log(
    "🧭 זיהוי תשובה אוטומטית:",
    {
      message,
      intent,
      confidence,
      audience,
      handled: Boolean(response),
    }
  );

  return {
    handled: Boolean(response),
    intent,
    confidence,
    audience,
    response,
  };
}

module.exports = {
  getAutomatedResponse,
  detectAudience,
};