function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim().length > 0
  );
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[״"'׳]/g, "")
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSource(source = "") {
  return String(source)
    .toLowerCase()
    .trim();
}

function getSourceDisplayName(source = "") {
  switch (normalizeSource(source)) {
    case "move":
      return "MOVE";

    case "amit":
      return "עמית";

    case "freefit":
      return "FreeFit";

    default:
      return null;
  }
}

function isSpecialSource(source = "") {
  return [
    "move",
    "amit",
    "freefit",
  ].includes(normalizeSource(source));
}

/*
 * ההודעה הראשונה לאחר שזוהה
 * שהלקוח הגיע דרך אחת הפלטפורמות.
 */
function buildSpecialWelcome(source) {
  const sourceName =
    getSourceDisplayName(source);

  return [
    `מצוין 😊 אשמח לעזור לכם עם ההצטרפות לאימוני הטניס דרך ${sourceName}.`,
    "",
    "כדי לשייך אתכם לקבוצה המתאימה, אשאל כמה שאלות קצרות.",
    "",
    "מה השם המלא של המתאמן או המתאמנת?",
  ].join("\n");
}

/*
 * קובע איזה פרט חסר כרגע
 * במסלול הפלטפורמות.
 */
function getMissingSpecialField(user = {}) {
  if (!hasValue(user.name)) {
    return "name";
  }

  if (!hasValue(user.age)) {
    return "age";
  }

  if (!hasValue(user.city)) {
    return "city";
  }

  if (!hasValue(user.experience)) {
    return "experience";
  }

  return null;
}

function getQuestionForField(field) {
  switch (field) {
    case "name":
      return "מה השם המלא של המתאמן או המתאמנת?";

    case "age":
      return "מה גיל המתאמן או המתאמנת?";

    case "city":
      return "באיזו עיר אתם מתגוררים?";

    case "experience":
      return [
        "מה הניסיון בטניס עד היום?",
        'אם אין ניסיון קודם, אפשר פשוט לכתוב "ללא ניסיון".',
      ].join("\n");

    default:
      return null;
  }
}

/*
 * הודעת סיום איסוף הפרטים.
 */
function buildSpecialRulesMessage(source) {
  const sourceName =
    getSourceDisplayName(source);

  return [
    "מעולה, קיבלתי את הפרטים 🎾",
    "",
    `חשוב לדעת לגבי האימונים דרך ${sourceName}:`,
    "",
    "1. ניתן להצטרף לאימונים המופיעים בפלטפורמה.",
    "2. ההרשמה מתבצעת עד יום שישי עבור השבוע שלאחר מכן.",
    "3. הרשמה בטווח של 24 שעות לפני האימון ללא אישור לא תכובד.",
    "4. ההשתתפות מותנית במינימום משתתפים.",
    "5. תינתן עדיפות למתאמני המועדון הקבועים.",
    "6. במידה שאימון מתבטל, המועדון יעדכן את הנרשמים.",
    "7. אימון שלא יתקיים לא יחויב או יזוכה בהתאם.",
    "8. לעיתים נשלחות בקבוצת העדכונים הודעות על אימונים בהתראה קצרה, וניתן להירשם בהתאם לפרטים שבהודעה.",
    "",
    "האימונים מתקיימים בגלי הדר – ראשון לציון, בקבוצות של עד 8–10 מתאמנים.",
    "",
    "להצטרפות לקבוצת עדכוני האימונים (חובה לצורך הצטרפות לאימונים):",
    "https://chat.whatsapp.com/DiUCuKGCEQi93ziqMgqfzh",
    "",
    "בהצלחה 🎾🇮🇱",
  ].join("\n");
}

/*
 * מזהה שאלות נפוצות של לקוחות
 * MOVE / עמית / FreeFit.
 *
 * חשוב:
 * לא מזכירים מסלולים אחרים,
 * מחירים רגילים או מבצעים.
 */
function getSpecialFaqReply(
  message = "",
  source = ""
) {
  const text =
    normalizeText(message);

  const sourceName =
    getSourceDisplayName(source);

  /*
   * איפה מתקיימים האימונים.
   */
  if (
    text.includes("איפה") ||
    text.includes("מיקום") ||
    text.includes("סניף") ||
    text.includes("איפה האימון") ||
    text.includes("איפה האימונים")
  ) {
    return [
      "האימונים במסגרת המסלול מתקיימים בגלי הדר – ראשון לציון 🎾",
      "",
      "האימונים מתקיימים בקבוצות של עד 8–10 מתאמנים.",
    ].join("\n");
  }

  /*
   * כמה משתתפים בקבוצה.
   */
  if (
    text.includes("כמה אנשים") ||
    text.includes("כמה משתתפים") ||
    text.includes("גודל קבוצה") ||
    text.includes("כמה בקבוצה")
  ) {
    return "הקבוצות הן עד 8–10 מתאמנים 🎾";
  }

  /*
   * הרשמה לשבוע הבא.
   */
  if (
    text.includes("עד מתי") ||
    text.includes("מתי נרשמים") ||
    text.includes("מתי להירשם") ||
    text.includes("הרשמה לשבוע הבא") ||
    text.includes("להירשם לשבוע הבא")
  ) {
    return [
      "ההרשמה לאימוני השבוע הבא מתבצעת עד יום שישי.",
      "",
      "מומלץ להירשם מראש כדי להגדיל את הסיכוי למקום פנוי 😊",
    ].join("\n");
  }

  /*
   * הרשמה למחר / היום / ברגע האחרון.
   */
  if (
    text.includes("למחר") ||
    text.includes("מחר") ||
    text.includes("היום") ||
    text.includes("ברגע האחרון") ||
    text.includes("24 שעות") ||
    text.includes("24 שעה")
  ) {
    return [
      "הרשמה בטווח של 24 שעות לפני האימון ללא אישור לא תכובד.",
      "",
      "אם נשלחה בקבוצת העדכונים הודעה על אימון בהתראה קצרה, אפשר להירשם בהתאם לפרטים שבהודעה.",
    ].join("\n");
  }

  /*
   * האם יש מקום / האם אפשר להצטרף.
   */
  if (
    text.includes("יש מקום") ||
    text.includes("מקום פנוי") ||
    text.includes("אפשר להצטרף") ||
    text.includes("אפשר להירשם") ||
    text.includes("פנוי")
  ) {
    return [
      `ההשתתפות דרך ${sourceName} תלויה באימונים המופיעים בפלטפורמה ובמקום הפנוי בקבוצה.`,
      "",
      "בנוסף, תינתן עדיפות למתאמני המועדון הקבועים.",
    ].join("\n");
  }

  /*
   * מינימום משתתפים.
   */
  if (
    text.includes("מינימום") ||
    text.includes("כמה צריכים") ||
    text.includes("מספיק משתתפים")
  ) {
    return "קיום האימון מותנה במינימום משתתפים.";
  }

  /*
   * ביטול אימון.
   */
  if (
    text.includes("ביטול") ||
    text.includes("מתבטל") ||
    text.includes("בוטל") ||
    text.includes("לא מתקיים") ||
    text.includes("לא יתקיים")
  ) {
    return [
      "אם אימון מתבטל, המועדון יעדכן את הנרשמים.",
      "",
      "אימון שלא יתקיים לא יחויב או יזוכה בהתאם.",
    ].join("\n");
  }

  /*
   * חיוב / זיכוי.
   */
  if (
    text.includes("חיוב") ||
    text.includes("מחייב") ||
    text.includes("זיכוי") ||
    text.includes("יחויב") ||
    text.includes("כסף")
  ) {
    return [
      "אימון שלא יתקיים לא יחויב או יזוכה בהתאם.",
      "",
      "אם יש מקרה ספציפי, אפשר לכתוב כאן מה קרה ואעזור לפי כללי המסלול.",
    ].join("\n");
  }

  /*
   * קבוצת עדכונים.
   */
  if (
    text.includes("קבוצה") ||
    text.includes("קבוצת עדכונים") ||
    text.includes("וואטסאפ") ||
    text.includes("קישור") ||
    text.includes("לינק")
  ) {
    return [
      "זו קבוצת עדכוני האימונים:",
      "https://chat.whatsapp.com/DiUCuKGCEQi93ziqMgqfzh",
      "",
      "ההצטרפות לקבוצה נדרשת לצורך קבלת עדכונים על האימונים.",
    ].join("\n");
  }

  /*
   * אימונים בהתראה קצרה.
   */
  if (
    text.includes("התראה קצרה") ||
    text.includes("אימון נוסף") ||
    text.includes("אימונים נוספים") ||
    text.includes("אימון ספונטני")
  ) {
    return [
      "לעיתים נשלחות בקבוצת העדכונים הודעות על אימונים בהתראה קצרה.",
      "",
      "במקרה כזה ניתן להירשם לפי הפרטים שמופיעים בהודעה.",
    ].join("\n");
  }

  /*
   * האם חייבים להירשם דרך הפלטפורמה.
   */
  if (
    text.includes("פלטפורמה") ||
    text.includes("דרך האפליקציה") ||
    text.includes("דרך האפליקציה")
  ) {
    return [
      `במסלול ${sourceName} ניתן להצטרף לאימונים המופיעים בפלטפורמה.`,
      "",
      "יש לפעול בהתאם להרשמה ולאימונים שמופיעים שם.",
    ].join("\n");
  }

  /*
   * שאלה כללית שלא זוהתה.
   *
   * בכוונה לא שולחים לבוט הרגיל,
   * כדי שלא ייחשפו מחירים או מסלולים אחרים.
   */
  return [
    `אשמח לעזור בכל שאלה לגבי האימונים דרך ${sourceName} 😊`,
    "",
    "אפשר לשאול למשל על הרשמה, מיקום האימונים, ביטולים, גודל הקבוצה או קבוצת העדכונים.",
  ].join("\n");
}

module.exports = {
  isSpecialSource,
  getSourceDisplayName,
  buildSpecialWelcome,
  getMissingSpecialField,
  getQuestionForField,
  buildSpecialRulesMessage,
  getSpecialFaqReply,
};