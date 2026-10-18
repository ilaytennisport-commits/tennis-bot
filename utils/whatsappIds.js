/*
 * =========================================================
 * זיהוי סוג הצ'אט לפי מזהה WhatsApp
 * =========================================================
 *
 * 972501234567@s.whatsapp.net  → שיחה פרטית (יש מספר טלפון)
 * 123456789012345@lid          → שיחה פרטית עם מספר מוסתר
 * 120363...@g.us               → קבוצה
 * ...@newsletter               → ערוץ
 * status@broadcast / @broadcast → סטטוס / רשימת תפוצה
 */

function getChatKind(chatId = "") {
  const value = String(chatId || "")
    .trim()
    .toLowerCase();

  if (!value) {
    return "unknown";
  }

  if (value.endsWith("@g.us")) {
    return "group";
  }

  if (value.endsWith("@newsletter")) {
    return "newsletter";
  }

  if (value.endsWith("@broadcast")) {
    return "broadcast";
  }

  if (value.endsWith("@lid")) {
    return "lid";
  }

  if (
    value.endsWith("@s.whatsapp.net") ||
    value.endsWith("@c.us") ||
    /^\+?\d{9,15}$/.test(value)
  ) {
    return "user";
  }

  return "unknown";
}

/*
 * הבוט עונה רק בשיחות פרטיות.
 */
function isPrivateChat(chatId = "") {
  const kind = getChatKind(chatId);

  return kind === "user" || kind === "lid";
}

/*
 * מחזיר טלפון ישראלי בפורמט מקומי (05XXXXXXXX)
 * רק כאשר המזהה הוא באמת מספר טלפון.
 * עבור קבוצות ומזהי lid מחזיר null.
 */
function chatIdToPhone(chatId = "") {
  if (getChatKind(chatId) !== "user") {
    return null;
  }

  const digits = String(chatId)
    .split("@")[0]
    .replace(/\D/g, "");

  if (/^9725\d{8}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }

  if (/^05\d{8}$/.test(digits)) {
    return digits;
  }

  /*
   * מספר בינלאומי שאינו ישראלי:
   * שומרים עם + כדי שהמנהל יוכל לחזור אליו.
   */
  if (/^\d{9,15}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

/*
 * הסתרת מספרים ומזהים בלוגים.
 * 972501234567@s.whatsapp.net → 9725****567
 */
function maskId(value = "") {
  const text = String(value || "");
  const digits = text
    .split("@")[0]
    .replace(/\D/g, "");

  if (digits.length < 6) {
    return text ? "***" : "";
  }

  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

module.exports = {
  getChatKind,
  isPrivateChat,
  chatIdToPhone,
  maskId,
};
