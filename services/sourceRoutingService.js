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
   * MOVE / מוב / קופות חולים
   *
   * כל לקוח שמציין קופת חולים
   * מנותב למסלול MOVE.
   *
   * אין מקור נפרד למכבי / כללית /
   * מאוחדת / לאומית.
   */
  const movePatterns = [
    /\bmove\b/i,
    /(^|\s)מוב($|\s)/,

    /*
     * אזכור כללי של קופת חולים.
     */
    /קופת חולים/,
    /קופת החולים/,
    /קופח/,

    /*
     * מכבי
     */
    /(^|\s)מכבי($|\s)/,
    /מכבי שירותי בריאות/,

    /*
     * כללית
     */
    /(^|\s)כללית($|\s)/,
    /כללית מושלם/,
    /כללית פלטינום/,
    /שירותי בריאות כללית/,

    /*
     * מאוחדת
     */
    /(^|\s)מאוחדת($|\s)/,
    /מאוחדת עדיף/,
    /מאוחדת שיא/,

    /*
     * לאומית
     */
    /(^|\s)לאומית($|\s)/,
    /לאומית שירותי בריאות/,
  ];

  if (
    movePatterns.some(
      (pattern) => pattern.test(text)
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
    amitPatterns.some(
      (pattern) => pattern.test(text)
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
    freefitPatterns.some(
      (pattern) => pattern.test(text)
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