const normalize = (text = "") =>
  text
    .toLowerCase()
    .replace(/[״"'’`]/g, "")
    .replace(/[?!.,:;()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, phrases) => phrases.some((phrase) => text.includes(phrase));

function classifyIntent(message = "") {
  const text = normalize(message);

  if (!text) return { intent: "unknown", confidence: 0 };

  if (includesAny(text, ["מספר טלפון", "טלפון", "מספר של המנהל", "מספר של אשר", "איך יוצרים קשר"])) {
    return { intent: "contact", confidence: 0.96 };
  }

  if (includesAny(text, ["איפה אתם", "כתובת", "מיקום", "סניפים", "איפה נמצאים"])) {
    return { intent: "branches", confidence: 0.95 };
  }

  if (includesAny(text, ["מאיזה גיל", "איזה גיל", "גיל מינימום", "בן כמה"])) {
    return { intent: "minimum_age", confidence: 0.93 };
  }

  if (includesAny(text, ["שיעור ניסיון", "אימון ניסיון", "ניסיון", "לנסות"])) {
    return { intent: "trial", confidence: 0.9 };
  }

  if (includesAny(text, ["כמה עולה", "מחיר", "מחירים", "מחירון", "עלות", "יקר"])) {
    return { intent: "pricing", confidence: 0.9 };
  }

  if (includesAny(text, ["אימון אישי", "מאמן אישי", "פרטי"])) {
    return { intent: "personal_training", confidence: 0.93 };
  }

  if (includesAny(text, ["מבוגרים", "למבוגר", "אני מבוגר", "מבוגר מתחיל"])) {
    return { intent: "adults", confidence: 0.88 };
  }

  if (includesAny(text, ["להירשם", "הרשמה", "רוצה להצטרף", "רוצה להתחיל", "תחזרו אליי", "שיחזרו אליי"])) {
    return { intent: "lead", confidence: 0.94 };
  }

  return { intent: "openai", confidence: 0.5 };
}

module.exports = { classifyIntent, normalize };
