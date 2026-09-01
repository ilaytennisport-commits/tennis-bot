function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim().length > 0
  );
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
 *
 * שם הפלטפורמה מופיע רק משום
 * שהלקוח עצמו כבר ציין אותה.
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

  /*
   * city עדיין לא קיים בפרופיל.
   * נוסיף אותו למסד הנתונים בשלב הבא.
   */
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
        "אם אין ניסיון קודם, אפשר פשוט לכתוב \"ללא ניסיון\".",
      ].join("\n");

    default:
      return null;
  }
}

/*
 * הודעת סיום איסוף הפרטים.
 *
 * בית דגן לא מופיע כאן.
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

module.exports = {
  isSpecialSource,
  getSourceDisplayName,
  buildSpecialWelcome,
  getMissingSpecialField,
  getQuestionForField,
  buildSpecialRulesMessage,
};