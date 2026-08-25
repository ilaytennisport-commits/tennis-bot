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
    includesAny(text, [
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
    includesAny(text, [
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
    includesAny(text, [
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
   */
  if (
    includesAny(text, [
      "שיעור ניסיון",
      "אימון ניסיון",
      "ניסיון",
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
   *
   * חשוב לכלול גם שאלות המשך
   * כמו "כמה זה עולה?"
   */
  if (
    includesAny(text, [
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
    includesAny(text, [
      "אימון אישי",
      "מאמן אישי",
      "שיעור פרטי",
      "פרטי",
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
    includesAny(text, [
      "מבוגרים",
      "למבוגר",
      "למבוגרת",
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
    includesAny(text, [
      "להירשם",
      "להרשם",
      "הרשמה",
      "אני רוצה להירשם",
      "אני רוצה להרשם",
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
    includesAny(text, [
      // מחבטים
      "מחבט",
      "מחבטים",
      "רכישת מחבט",
      "לקנות מחבט",
      "קניית מחבט",

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
      "נעלי טניס",
      "נעליים",

      // כדורים
      "כדור",
      "כדורים",

      // ציוד נוסף
      "ציוד",
      "ציוד טניס",
      "תיק",
      "תיק מחבטים",
      "בולם",
      "בולם זעזועים",
      "סופג זעזועים",
      "סרט זיעה",
      "כובע",
    ])
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