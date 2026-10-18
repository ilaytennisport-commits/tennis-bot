/*
 * =========================================================
 * חודשים — לפי שעון ישראל
 * =========================================================
 */

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/*
 * כתיבים נוספים נפוצים.
 */
const MONTH_ALIASES = {
  מרס: 3,
  מארס: 3,
  אוג: 8,
  ספט: 9,
  אוק: 10,
  נוב: 11,
  דצ: 12,
};

function getIsraelYearMonth(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
    }
  )
    .format(now)
    .split("-")
    .map(Number);

  return { year, month };
}

function getIsraelDayAndHour(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta;

  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

function formatMonthLabel({ year, month }) {
  return `${HEBREW_MONTHS[month - 1]} ${year}`;
}

/*
 * מפענח בקשת חודש:
 * ""            → החודש הנוכחי
 * "חודש קודם"   → החודש הקודם
 * "אוקטובר"     → אוקטובר האחרון (השנה, או שנה שעברה אם עוד לא הגיע)
 * "אוקטובר 2025", "10/2026", "10.26", "2026-10"
 * מחזיר null אם לא הובן.
 */
function parseMonthSpec(text = "", now = new Date()) {
  const value = String(text)
    .replace(/[״"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const current = getIsraelYearMonth(now);

  if (!value || /^(?:של\s+)?(?:החודש|חודש נוכחי|החודש הזה)$/.test(value)) {
    return current;
  }

  if (/^(?:של\s+)?(?:חודש קודם|החודש הקודם|חודש שעבר|החודש שעבר)$/.test(value)) {
    return shiftMonth(current, -1);
  }

  let match = value.match(/^(\d{4})[-/.](\d{1,2})$/);

  if (match) {
    return validMonth(Number(match[1]), Number(match[2]));
  }

  match = value.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/);

  if (match) {
    const year =
      match[2].length === 2
        ? 2000 + Number(match[2])
        : Number(match[2]);

    return validMonth(year, Number(match[1]));
  }

  match = value.match(/^(?:של\s+|ל|ב)?([א-ת]+)(?:\s+(\d{4}))?$/);

  if (match) {
    const monthIndex = HEBREW_MONTHS.indexOf(match[1]);
    const month =
      monthIndex >= 0
        ? monthIndex + 1
        : MONTH_ALIASES[match[1]];

    if (!month) {
      return null;
    }

    if (match[2]) {
      return validMonth(Number(match[2]), month);
    }

    return {
      year:
        month > current.month
          ? current.year - 1
          : current.year,
      month,
    };
  }

  return null;
}

function validMonth(year, month) {
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return { year, month };
}

module.exports = {
  HEBREW_MONTHS,
  getIsraelYearMonth,
  getIsraelDayAndHour,
  shiftMonth,
  formatMonthLabel,
  parseMonthSpec,
};
