const {
  normalizeText,
  matchesAnyTerm,
} = require("./text");

const normalize = normalizeText;

/*
 * מונחים של מילה אחת נבדקים כמילה שלמה
 * (עם אותיות שימוש), ולא כחלק ממילה.
 *
 * כך "תגיד" לא מזוהה כ"גיד",
 * ו"ותיק" לא מזוהה כ"תיק".
 */
const EQUIPMENT_PREFIXES = "הבל";

function classifyIntent(
  message = ""
) {
  const text =
    normalize(message);

  if (!text) {
    return {
      intent: "unknown",
      confidence: 0,
    };
  }

  /*
   * יצירת קשר.
   */
  if (
    matchesAnyTerm(text, [
      "מספר טלפון",
      "טלפון",
      "מספר של המנהל",
      "מספר של אשר",
      "איך יוצרים קשר",
    ])
  ) {
    return {
      intent: "contact",
      confidence: 0.96,
    };
  }

  /*
   * סניפים / מיקום.
   */
  if (
    matchesAnyTerm(text, [
      "איפה אתם",
      "כתובת",
      "מיקום",
      "סניפים",
      "איזה סניפים",
      "איפה נמצאים",
    ])
  ) {
    return {
      intent: "branches",
      confidence: 0.95,
    };
  }

  /*
   * גיל מינימום.
   */
  if (
    matchesAnyTerm(text, [
      "מאיזה גיל",
      "איזה גיל",
      "גיל מינימום",
      "בן כמה",
    ])
  ) {
    return {
      intent: "minimum_age",
      confidence: 0.93,
    };
  }

  /*
   * אימון ניסיון.
   *
   * "יש לו ניסיון" אינו בקשה לאימון ניסיון,
   * ולכן המילה "ניסיון" לבדה לא מספיקה.
   */
  if (
    matchesAnyTerm(text, [
      "שיעור ניסיון",
      "אימון ניסיון",
      "שיעור נסיון",
      "אימון נסיון",
      "לנסות",
      "אפשר לנסות",
      "רוצה לנסות",
    ])
  ) {
    return {
      intent: "trial",
      confidence: 0.9,
    };
  }

  /*
   * מחיר.
   */
  if (
    matchesAnyTerm(text, [
      "כמה עולה",
      "כמה זה עולה",
      "כמה זה יעלה",
      "מה המחיר",
      "מה העלות",
      "כמה זה",
      "מחיר",
      "מחירים",
      "מחירון",
      "עלות",
      "יקר",
      "יקרה",
    ])
  ) {
    return {
      intent: "pricing",
      confidence: 0.92,
    };
  }

  /*
   * אימון אישי.
   */
  if (
    matchesAnyTerm(text, [
      "אימון אישי",
      "מאמן אישי",
      "שיעור פרטי",
      "פרטי",
      "פרטית",
    ])
  ) {
    return {
      intent:
        "personal_training",
      confidence: 0.93,
    };
  }

  /*
   * מבוגרים.
   */
  if (
    matchesAnyTerm(text, [
      "מבוגרים",
      "מבוגר",
      "מבוגרת",
      "אני מבוגר",
      "אני מבוגרת",
      "מבוגר מתחיל",
      "מבוגרת מתחילה",
    ])
  ) {
    return {
      intent: "adults",
      confidence: 0.88,
    };
  }

  /*
   * הרשמה / ליד.
   */
  if (
    matchesAnyTerm(text, [
      "להירשם",
      "להרשם",
      "הרשמה",
      "רוצה להצטרף",
      "רוצה להתחיל",
      "תרשמו אותי",
      "תחזרו אליי",
      "תחזרו אלי",
      "שיחזרו אליי",
      "שיחזרו אלי",
    ])
  ) {
    return {
      intent: "lead",
      confidence: 0.94,
    };
  }

  /*
   * ציוד טניס.
   */
  if (
    matchesAnyTerm(
      text,
      [
        // מחבטים
        "מחבט",
        "מחבטים",
        "רקטה",
        "רקטות",

        // גריפים
        "גריפ",
        "גריפים",
        "אוברגריפ",
        "אחיזה",

        // גידים
        "גיד",
        "גידים",
        "מיתר",
        "מיתרים",
        "שזירה",

        // נעליים
        "נעל",
        "נעלי",
        "נעליים",

        // כדורים
        "כדור",
        "כדורי",
        "כדורים",

        // ציוד נוסף
        "ציוד",
        "תיק",
        "תיקים",
        "בולם",
        "בולם זעזועים",
        "סופג זעזועים",
        "סרט זיעה",
        "כובע",
      ],
      {
        prefixes:
          EQUIPMENT_PREFIXES,
      }
    )
  ) {
    return {
      intent:
        "tennis_equipment",
      confidence: 0.98,
    };
  }

  return {
    intent: "openai",
    confidence: 0.5,
  };
}

module.exports = {
  classifyIntent,
  normalize,
};
