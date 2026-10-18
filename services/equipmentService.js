const equipmentKnowledge = require(
  "../knowledge/equipmentKnowledge"
);

const {
  matchesAnyTerm,
} = require("../utils/text");

/*
 * מילים שלמות בלבד, עם ה/ב/ל בתחילתן.
 * כך "ותיק" לא מזוהה כ"תיק".
 */
const hasEquipmentTerm = (text, terms) =>
  matchesAnyTerm(text, terms, {
    prefixes: "הבל",
  });

function detectEquipmentCategory(message = "") {
  const text = String(message)
    .toLowerCase()
    .trim();

  // בודקים קודם ביטויים ספציפיים,
  // כדי ש"תיק למחבט" לא יזוהה כמחבט.
  if (
    hasEquipmentTerm(text, ["תיק למחבט", "תיקי מחבטים", "תיק", "תיקים"])
  ) {
    return {
      category: "accessories",
      item: "bag",
    };
  }

  if (
    hasEquipmentTerm(text, ["בולם זעזועים", "סופג זעזועים", "בולם", "בולמים"])
  ) {
    return {
      category: "accessories",
      item: "vibration_damper",
    };
  }

  if (
    hasEquipmentTerm(text, ["אוברגריפ", "גריפ", "גריפים", "ידית", "אחיזה"])
  ) {
    return {
      category: "grips",
      item: "grip",
    };
  }

  if (
    hasEquipmentTerm(text, ["גיד", "גידים", "מיתר", "מיתרים", "שזירה", "מתיחה"])
  ) {
    return {
      category: "strings",
      item: "strings",
    };
  }

  if (hasEquipmentTerm(text, ["כדור", "כדורי", "כדורים"])) {
    return {
      category: "balls",
      item: "balls",
    };
  }

  if (
    hasEquipmentTerm(text, ["נעלי טניס", "נעליים", "נעלי", "נעל"])
  ) {
    return {
      category: "shoes",
      item: "shoes",
    };
  }

  if (
    hasEquipmentTerm(text, ["מחבט", "מחבטים", "רקטה", "רקטות"])
  ) {
    return {
      category: "rackets",
      item: "racket",
    };
  }

  if (
    hasEquipmentTerm(text, ["כובע", "בקבוק", "אביזר", "אביזרים", "ציוד נלווה", "ציוד טניס", "ציוד"])
  ) {
    return {
      category: "accessories",
      item: "general",
    };
  }

  return null;
}

function detectEquipmentAudience(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    /ילד|ילדה|ילדים|לילד|לילדה|בן שלי|בת שלי|נוער/.test(
      text
    )
  ) {
    return "child";
  }

  if (
    /מבוגר|מבוגרת|מבוגרים|למבוגר|בשבילי|לעצמי|עבורי/.test(
      text
    )
  ) {
    return "adult";
  }

  const age = Number(profile.age);

  if (
    Number.isFinite(age) &&
    age > 0
  ) {
    return age >= 18
      ? "adult"
      : "child";
  }

  return null;
}

function buildRacketResponse(audience) {
  if (audience === "child") {
    return [
      "בשמחה 😊",
      "",
      "נשמח לעזור בהתאמת מחבט לילד.",
      "ההתאמה נעשית לפי הגיל, הגובה ורמת הניסיון.",
      "",
      "מה הגובה של הילד?",
    ].join("\n");
  }

  if (audience === "adult") {
    return [
      "בשמחה 😊",
      "",
      "נשמח לעזור לבחור מחבט שמתאים לרמת המשחק שלך.",
      "",
      "האם מדובר במחבט ראשון או בשדרוג למחבט קיים?",
    ].join("\n");
  }

  return [
    "בשמחה 😊",
    "",
    "נשמח לעזור לבחור את המחבט המתאים.",
    "",
    "המחבט מיועד לילד או למבוגר?",
  ].join("\n");
}

function getEquipmentResponse(
  message,
  profile = {}
) {
  const equipment =
    detectEquipmentCategory(message);

  if (!equipment) {
    return (
      equipmentKnowledge.fallbackResponse ||
      "באקדמיה יש מגוון אפשרויות בנושא מחבטים וציוד טניס. כדי להתאים נכון, אשמח להבין איזה ציוד אתם מחפשים."
    );
  }

  const { category, item } =
    equipment;

  const audience =
    detectEquipmentAudience(
      message,
      profile
    );

  switch (category) {
    case "rackets":
      return buildRacketResponse(
        audience
      );

    case "grips":
      return [
        "בשמחה 😊",
        "",
        "נשמח לעזור לבחור גריפ שמתאים למחבט שלך.",
        "",
        "הגריפ מיועד לילד או למבוגר?",
      ].join("\n");

    case "strings":
      return [
        "בשמחה 😊",
        "",
        "נשמח לעזור לבחור גידים שמתאימים למחבט ולרמת המשחק.",
        "",
        "האם מדובר בשחקן מתחיל או מנוסה?",
      ].join("\n");

    case "balls":
      return [
        "בשמחה 😊",
        "",
        "נשמח לעזור לבחור כדורי טניס מתאימים.",
        "",
        "הכדורים מיועדים לילד, למבוגר או לאימונים?",
      ].join("\n");

    case "shoes":
      return [
        "בשמחה 😊",
        "",
        "נשמח לעזור לבחור נעלי טניס מתאימות.",
        "",
        "הנעליים מיועדות לילד או למבוגר?",
      ].join("\n");

    case "accessories":
      if (item === "bag") {
        return [
          "בשמחה 😊",
          "",
          "יש אצלנו מגוון תיקים למחבטים בגדלים שונים.",
          "",
          "כמה מחבטים התיק צריך להכיל?",
        ].join("\n");
      }

      if (
        item ===
        "vibration_damper"
      ) {
        return [
          "בשמחה 😊",
          "",
          "יש אצלנו בולמי זעזועים במגוון סוגים.",
          "",
          "הבולם מיועד למחבט של ילד או של מבוגר?",
        ].join("\n");
      }

      return [
        "בשמחה 😊",
        "",
        "יש אצלנו מגוון אביזרי טניס.",
        "",
        "איזה אביזר אתם מחפשים?",
      ].join("\n");

    default:
      return (
        equipmentKnowledge.fallbackResponse ||
        "באקדמיה יש מגוון אפשרויות בנושא ציוד טניס. איזה ציוד אתם מחפשים?"
      );
  }
}

module.exports = {
  getEquipmentResponse,
  detectEquipmentCategory,
  detectEquipmentAudience,
};