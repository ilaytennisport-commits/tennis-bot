const crypto = require("crypto");

/*
 * =========================================================
 * קודים לקישורים אישיים
 * =========================================================
 *
 * קוד קצר: 12 תווים, בלי תווים שמתבלבלים בעין (0/O, 1/l/I).
 * יש בו מספיק אפשרויות כך שאי אפשר לנחש אותו.
 *
 * קודים ישנים (48 תווים) ממשיכים לעבוד, כדי שקישורים
 * שכבר נשלחו לא יישברו.
 */

const ALPHABET =
  "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

const SHORT_LENGTH = 12;

function generateShortToken() {
  let token = "";

  while (token.length < SHORT_LENGTH) {
    for (const byte of crypto.randomBytes(SHORT_LENGTH * 2)) {
      /* 224 = 4 × 56 — בלי הטיה לטובת תווים מסוימים */
      if (byte < 224 && token.length < SHORT_LENGTH) {
        token += ALPHABET[byte % ALPHABET.length];
      }
    }
  }

  return token;
}

function isShortToken(value) {
  return /^[2-9a-km-np-zA-HJ-NP-Z]{12}$/.test(String(value || ""));
}

function isLinkToken(value) {
  return (
    isShortToken(value) ||
    /^[a-f0-9]{48}$/.test(String(value || ""))
  );
}

function sameToken(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  return (
    left.length > 0 &&
    left.length === right.length &&
    crypto.timingSafeEqual(left, right)
  );
}

module.exports = {
  generateShortToken,
  isShortToken,
  isLinkToken,
  sameToken,
};
