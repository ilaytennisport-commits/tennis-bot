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
  /*
   * שמות הקופות הם גם מילים רגילות
   * ("שאלה כללית"), ולכן מזוהים רק כאשר:
   * 1. זו כל התשובה ("כללית", "דרך מכבי", "במאוחדת"), או
   * 2. יש הקשר ברור של קופת חולים / פלטפורמה.
   */
  const kupaNames =
    "מכבי|כללית|מאוחדת|לאומית";

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
     * תשובה קצרה שהיא רק שם הקופה.
     */
    new RegExp(
      `^(?:דרך\\s+|ב|מ)?(?:${kupaNames})(?:\\s+(?:שירותי בריאות|מושלם|פלטינום|עדיף|שיא|זהב|כסף))?$`
    ),

    /*
     * הקשר מפורש של הגעה דרך הקופה.
     */
    new RegExp(
      `(?:^|\\s)(?:דרך|באמצעות|בהטבה של|הטבה של|הטבת)\\s+(?:${kupaNames})(?:\\s|$)`
    ),
    /מכבי שירותי בריאות/,
    /שירותי בריאות כללית/,
    /כללית מושלם/,
    /כללית פלטינום/,
    /מאוחדת עדיף/,
    /מאוחדת שיא/,
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
   *
   * "עמית" הוא גם שם פרטי נפוץ.
   * "חבר שלי עמית המליץ" או "שמעתי מעמית"
   * אינם מסלול עמית.
   */
  const amitPatterns = [
    /^עמית$/,
    /^(?:דרך|ב|באמצעות)\s*עמית$/,
    /תוכנית עמית/,
    /תכנית עמית/,
    /אפליקציית עמית/,
    /פלטפורמת עמית/,
    /(?:^|\s)(?:דרך|באמצעות)\s+עמית(?:\s|$)/,
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