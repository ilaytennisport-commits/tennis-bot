const normalize = (text = "") =>
  String(text)
    .toLowerCase()
    .replace(/[״"'’`]/g, "")
    .replace(/[?!.,:;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (
  text,
  phrases = []
) =>
  phrases.some((phrase) =>
    text.includes(phrase)
  );

function detectConversationIntent(
  message = "",
  profile = {}
) {
  const text = normalize(message);

  if (!text) {
    return {
      stage: "unknown",
      confidence: 0,
    };
  }

  /*
   * בקשה מפורשת לחזרה מנציג.
   */
  if (
    includesAny(text, [
      "תחזרו אליי",
      "תחזרו אלי",
      "שיחזרו אליי",
      "שיחזרו אלי",
      "אפשר שיחזרו אליי",
      "אפשר שיחזרו אלי",
      "תתקשרו אליי",
      "תתקשרו אלי",
      "דברו איתי",
      "שנציג יחזור",
      "רוצה שיחזרו",
    ])
  ) {
    return {
      stage: "callback",
      confidence: 0.98,
    };
  }

  /*
   * כוונת הרשמה ברורה.
   */
  if (
    includesAny(text, [
      "אני רוצה להירשם",
      "רוצה להירשם",
      "רוצה להרשם",
      "איך נרשמים",
      "איך נרשמים לחוג",
      "אפשר להירשם",
      "אפשר להרשם",
      "אני רוצה להצטרף",
      "רוצה להצטרף",
      "רוצה להתחיל להתאמן",
      "רוצה להתחיל",
      "תרשמו אותי",
      "תרשמו את הילד",
      "תרשמו את הילדה",
    ])
  ) {
    return {
      stage: "lead",
      confidence: 0.98,
    };
  }

  /*
   * משפטים קצרים שמעידים שהלקוח
   * מוכן להתקדם.
   *
   * הם נבדקים בהתאמה מלאה ולא עם includes,
   * כדי ש-"מה מתאים לילד?" לא יזוהה
   * בטעות בגלל הביטוי "מתאים לי".
   */
  const exactReadyPhrases =
    new Set([
      "מתאים לי",
      "מתאים לנו",
      "נשמע טוב",
      "נשמע מתאים",
      "יאללה",
      "קדימה",
      "אני בעניין",
      "אנחנו בעניין",
    ]);

  if (
    exactReadyPhrases.has(text) ||
    includesAny(text, [
      "בוא נתקדם",
      "בואו נתקדם",
      "מעוניין להתקדם",
      "מעוניינת להתקדם",
    ])
  ) {
    return {
      stage: "ready",
      confidence: 0.92,
    };
  }

  /*
   * אימון ניסיון.
   */
  if (
    includesAny(text, [
      "אימון ניסיון",
      "שיעור ניסיון",
      "אפשר לנסות",
      "רוצה לנסות",
      "בא לי לנסות",
      "אפשר להגיע לניסיון",
    ])
  ) {
    return {
      stage: "interest",
      confidence: 0.94,
      topic: "trial",
    };
  }

  /*
   * בקשת המלצה.
   */
  if (
    includesAny(text, [
      "מה מתאים",
      "מה יתאים",
      "מה מומלץ",
      "מה אתה ממליץ",
      "מה אתם ממליצים",
      "איזה מסלול",
      "איזו קבוצה",
      "איזה חוג",
      "תמליץ",
      "להתאים לי",
      "להתאים לילד",
      "להתאים לילדה",
    ])
  ) {
    return {
      stage: "recommendation",
      confidence: 0.9,
    };
  }

  /*
   * התעניינות כללית.
   */
  if (
    includesAny(text, [
      "אני מתעניין",
      "אני מתעניינת",
      "מתעניין בחוג",
      "מתעניינת בחוג",
      "רוצה פרטים",
      "אשמח לפרטים",
      "אפשר פרטים",
      "נשמע מעניין",
      "מעניין אותי",
      "אני בודק",
      "אני בודקת",
    ])
  ) {
    return {
      stage: "interest",
      confidence: 0.86,
    };
  }

  /*
   * שאלות מידע.
   */
  if (
    includesAny(text, [
      "כמה עולה",
      "כמה זה עולה",
      "מחיר",
      "מחירים",
      "מחירון",
      "עלות",
      "איפה אתם",
      "איפה נמצאים",
      "כתובת",
      "סניף",
      "סניפים",
      "מאיזה גיל",
      "איזה גיל",
      "גיל מינימום",
      "טלפון",
      "מספר טלפון",
      "שעות",
      "מתי",
      "כמה פעמים",
      "כמה זמן",
      "מבוגרים",
      "ילדים",
      "אימון אישי",
      "אימון זוגי",
    ])
  ) {
    return {
      stage: "information",
      confidence: 0.85,
    };
  }

  /*
   * אם כבר ידועים כמה פרטים,
   * מסיקים שיש שיחה מתקדמת,
   * אבל לא פותחים ליד אוטומטית.
   */
  const knownDetails = [
    profile.name,
    profile.age,
    profile.branch,
    profile.goal,
  ].filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  ).length;

  if (knownDetails >= 2) {
    return {
      stage: "interest",
      confidence: 0.65,
    };
  }

  return {
    stage: "unknown",
    confidence: 0.4,
  };
}

function shouldStartLeadFlow(
  conversationIntent
) {
  if (!conversationIntent) {
    return false;
  }

  return (
    conversationIntent.stage ===
      "lead" ||
    conversationIntent.stage ===
      "callback"
  );
}

module.exports = {
  detectConversationIntent,
  shouldStartLeadFlow,
  normalize,
};