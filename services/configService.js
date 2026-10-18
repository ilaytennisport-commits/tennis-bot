/*
 * =========================================================
 * בדיקת משתני סביבה בעליית השרת
 * =========================================================
 *
 * errors   — בלעדיהם הבוט לא יכול לעבוד, והשרת לא עולה.
 * warnings — הבוט עובד, אבל חלק מהיכולות חסרות או לא מאובטחות.
 */

const REQUIRED = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "WHAPI_TOKEN",
];

function validateConfig(env = process.env) {
  const errors = [];
  const warnings = [];

  for (const name of REQUIRED) {
    if (!env[name]) {
      errors.push(`משתנה הסביבה ${name} חסר.`);
    }
  }

  if (!env.WEBHOOK_SECRET) {
    warnings.push(
      "WEBHOOK_SECRET לא הוגדר — כל אחד שמכיר את כתובת השרת יכול לשלוח הודעות מזויפות. מומלץ להגדיר ולהוסיף ?token=... לכתובת ה-Webhook ב-Whapi."
    );
  }

  if (!env.CLUB_MANAGER_PHONE && !env.MANAGER_PHONES) {
    warnings.push(
      "לא הוגדרו CLUB_MANAGER_PHONE או MANAGER_PHONES — לידים יישמרו אך לא יישלחו לאף מנהל."
    );
  }

  return {
    errors,
    warnings,
  };
}

module.exports = {
  validateConfig,
};
