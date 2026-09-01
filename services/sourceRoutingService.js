function normalizeMessage(message = "") {
  return String(message)
    .toLowerCase()
    .trim()
    .replace(/[״"'׳]/g, "")
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * מזהה פלטפורמה רק כאשר הלקוח עצמו
 * הזכיר אותה.
 *
 * חשוב:
 * הבוט לעולם לא משתמש בפונקציה הזו
 * כדי להציע או לחשוף פלטפורמות ללקוח.
 */
function detectSpecialSource(message = "") {
  const text = normalizeMessage(message);

  /*
   * MOVE / מוב
   */
  const movePatterns = [
    /\bmove\b/i,
    /(^|\s)מוב($|\s)/,
  ];

  if (
    movePatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "move";
  }

  /*
   * עמית
   */
  const amitPatterns = [
    /(^|\s)עמית($|\s)/,
    /תוכנית עמית/,
    /תכנית עמית/,
    /דרך עמית/,
  ];

  if (
    amitPatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "amit";
  }

  /*
   * FreeFit / פריפיט
   *
   * מכסים גם מספר צורות כתיבה נפוצות.
   */
  const freefitPatterns = [
    /\bfreefit\b/i,
    /\bfree fit\b/i,
    /(^|\s)פריפיט($|\s)/,
    /(^|\s)פרי פיט($|\s)/,
    /(^|\s)פריפיטנס($|\s)/,
  ];

  if (
    freefitPatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "freefit";
  }

  return null;
}

/*
 * הודעת הפתיחה ללקוח חדש.
 *
 * בכוונה אין כאן שום אזכור
 * להטבות או לפלטפורמות.
 */
function getEntryWelcomeMessage() {
  return [
    "🎾 ברוכים הבאים לאקדמיה לטניס גלי הדר וגזר!",
    "",
    "כיף שהגעתם אלינו 😊",
    "",
    "לפני שנתחיל, איך שמעתם עלינו?",
  ].join("\n");
}

/*
 * קובע האם המשתמש עדיין צריך
 * לעבור את שער הכניסה.
 */
function shouldAskSource(user = {}) {
  return user.source_confirmed !== true;
}

/*
 * מעבד את תשובת המשתמש לשאלת
 * "איך שמעתם עלינו?"
 *
 * אם זוהתה אחת הפלטפורמות הסגורות,
 * נשמור אותה.
 *
 * כל תשובה אחרת מוגדרת כלקוח רגיל,
 * בלי לחשוף בפניו את שמות הפלטפורמות.
 */
function resolveSource(message = "") {
  const specialSource =
    detectSpecialSource(message);

  if (specialSource) {
    return {
      source: specialSource,
      source_confirmed: true,
      isSpecial: true,
    };
  }

  return {
    source: "regular",
    source_confirmed: true,
    isSpecial: false,
  };
}

module.exports = {
  normalizeMessage,
  detectSpecialSource,
  getEntryWelcomeMessage,
  shouldAskSource,
  resolveSource,
};