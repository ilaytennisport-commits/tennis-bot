/*
 * =========================================================
 * כלי טקסט משותפים
 * =========================================================
 *
 * כל זיהוי מילים בבוט צריך לעבור כאן,
 * כדי שלא יהיו כמה גרסאות שונות של אותה בדיקה.
 */

/*
 * אותיות שימוש נפוצות שיכולות להופיע בתחילת מילה:
 * ו, ה, ב, ל, מ, ש, כ.
 */
const HEBREW_PREFIXES = "והבלמשכ";

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[״"'’`׳]/g, "")
    .replace(/[?!.,:;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/*
 * מחפש מילה שלמה, עם עד שתי אותיות שימוש לפניה.
 *
 * containsWord("תגיד יש חניה", "גיד") === false
 * containsWord("התיק של הילד", "תיק", { prefixes: "הבל" }) === true
 */
function containsWord(
  text,
  word,
  { prefixes = HEBREW_PREFIXES } = {}
) {
  const prefixPattern = prefixes
    ? `[${prefixes}]{0,2}`
    : "";

  const pattern = new RegExp(
    `(?:^|\\s)${prefixPattern}${escapeRegExp(
      word
    )}(?=\\s|$)`,
    "u"
  );

  return pattern.test(normalizeText(text));
}

/*
 * מונח עם רווח נבדק כביטוי (includes),
 * מונח של מילה אחת נבדק כמילה שלמה.
 */
function matchesAnyTerm(
  text,
  terms = [],
  options = {}
) {
  const normalized = normalizeText(text);

  return terms.some((term) =>
    term.includes(" ")
      ? normalized.includes(term)
      : containsWord(
          normalized,
          term,
          options
        )
  );
}

const QUESTION_START_PATTERN =
  /^(מה|מתי|איפה|איפוא|איך|כמה|איזה|איזו|אילו|האם|למה|באיזה|באיזו|באילו|יש |אפשר |ניתן |עד מתי|מאיזה|לאיזה)/;

function looksLikeQuestion(message = "") {
  const text = String(message)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!text) {
    return false;
  }

  if (text.includes("?")) {
    return true;
  }

  return QUESTION_START_PATTERN.test(text);
}

const GREETING_PATTERN =
  /^(היי|הי|הלו|שלום|שלום לכם|שלום רב|אהלן|אהלן אהלן|מה נשמע|מה קורה|בוקר טוב|צהריים טובים|ערב טוב|לילה טוב|hi|hello|hey)[\s!.?,🙂😊👋🙏]*$/iu;

function isGreetingOnly(message = "") {
  return GREETING_PATTERN.test(
    String(message).trim()
  );
}

function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

module.exports = {
  HEBREW_PREFIXES,
  normalizeText,
  escapeRegExp,
  containsWord,
  matchesAnyTerm,
  looksLikeQuestion,
  isGreetingOnly,
  hasValue,
};
