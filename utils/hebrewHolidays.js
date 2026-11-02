/*
 * =========================================================
 * ימים בלי אימונים לפי הלוח העברי
 * =========================================================
 *
 * מחושב מהלוח העברי (Intl), כך שאין צורך לעדכן כל שנה.
 * לפי האקדמיה, אין אימונים ב:
 *   ערבי חג וחגים, כולל חול המועד (סוכות ופסח),
 *   יום הזיכרון ויום העצמאות, חנוכה, פורים ותשעה באב.
 */

const hebrewFormat = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function toUtcDate(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shift(dateString, days) {
  const date = toUtcDate(dateString);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function hebrewParts(dateString) {
  const parts = Object.fromEntries(
    hebrewFormat
      .formatToParts(toUtcDate(dateString))
      .map((part) => [part.type, part.value])
  );

  return {
    month: parts.month,
    day: Number(parts.day),
  };
}

/* 0 = ראשון ... 6 = שבת */
function weekday(dateString) {
  return toUtcDate(dateString).getUTCDay();
}

/*
 * יום העצמאות: ה' באייר, עם ההזזות הקבועות בחוק
 * (שישי/שבת ← חמישי, שני ← שלישי). יום הזיכרון — יום לפני.
 */
function independenceDay(dateString) {
  const { month, day } = hebrewParts(dateString);

  if (month !== "Iyar" || day < 2 || day > 6) {
    return false;
  }

  /* מוצאים את ה' באייר של אותה שנה */
  const fifth = shift(dateString, 5 - day);
  let observed = fifth;

  if (weekday(fifth) === 5) observed = shift(fifth, -1);
  else if (weekday(fifth) === 6) observed = shift(fifth, -2);
  else if (weekday(fifth) === 1) observed = shift(fifth, 1);

  return observed;
}

function hanukkahDay(dateString) {
  for (let back = 0; back < 8; back++) {
    const { month, day } = hebrewParts(shift(dateString, -back));

    if (month === "Kislev" && day === 25) {
      return back + 1;
    }
  }

  return 0;
}

/*
 * שם היום אם אין בו אימונים, אחרת null.
 * dateString: "YYYY-MM-DD" (תאריך בישראל).
 */
function getNoTrainingHoliday(dateString) {
  const { month, day } = hebrewParts(dateString);

  if (month === "Elul" && day === 29) return "ערב ראש השנה";

  if (month === "Tishri") {
    if (day === 1 || day === 2) return "ראש השנה";
    if (day === 9) return "ערב יום כיפור";
    if (day === 10) return "יום כיפור";
    if (day === 14) return "ערב סוכות";
    if (day === 15) return "סוכות";
    if (day >= 16 && day <= 20) return "חול המועד סוכות";
    if (day === 21) return "ערב שמחת תורה";
    if (day === 22) return "שמחת תורה";
  }

  if (hanukkahDay(dateString)) return "חנוכה";

  if ((month === "Adar" || month === "Adar II") && day === 14) return "פורים";

  if (month === "Nisan") {
    if (day === 14) return "ערב פסח";
    if (day === 15) return "פסח";
    if (day >= 16 && day <= 19) return "חול המועד פסח";
    if (day === 20) return "ערב שביעי של פסח";
    if (day === 21) return "שביעי של פסח";
  }

  const atzmaut = independenceDay(dateString);

  if (atzmaut === dateString) return "יום העצמאות";
  if (atzmaut && shift(atzmaut, -1) === dateString) return "יום הזיכרון";

  if (month === "Sivan") {
    if (day === 5) return "ערב שבועות";
    if (day === 6) return "שבועות";
  }

  /* תשעה באב — נדחה ליום ראשון כשחל בשבת */
  if (month === "Av") {
    if (day === 9 && weekday(dateString) !== 6) return "תשעה באב";
    if (day === 10 && weekday(dateString) === 0) return "תשעה באב";
  }

  return null;
}

module.exports = {
  getNoTrainingHoliday,
};
