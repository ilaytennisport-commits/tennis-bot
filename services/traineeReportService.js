const { pool } = require("./databaseService");

const {
  getMonthRange,
  getAttendanceStartDate,
  formatMonthLabel,
  formatGroupName,
} = require("./attendanceExportService");

/*
 * =========================================================
 * דוח נוכחות של מתאמן אחד
 * =========================================================
 *
 * מנהל כותב: "תן לי נוכחות של נועם לוי החודש"
 * ומקבל: כמה אימונים הגיע מתוך כמה, ורשימה לפי תאריך.
 */

const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function normalize(value = "") {
  return String(value)
    .replace(/[-־]/g, " ")
    .replace(/["'׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * עמודת DATE מגיעה מ-pg כ-Date בחצות לפי השעון המקומי (או כמחרוזת).
 */
function toDateString(value) {
  if (!(value instanceof Date)) {
    return String(value).slice(0, 10);
  }

  const pad = (number) => String(number).padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatDay(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `יום ${DAY_LETTERS[dow]} ${day}/${month}`;
}

function formatStartDate(dateString) {
  const [, month, day] = dateString.split("-").map(Number);

  return `${day}.${month}`;
}

/*
 * מוצא את השם המלא של המתאמן: התאמה מדויקת, או לפי מילים ("נועם" → "נועם לוי").
 */
async function resolveTraineeName(input, db = pool) {
  const result = await db.query(
    `
      SELECT DISTINCT name FROM trainees
      UNION
      SELECT DISTINCT trainee_name AS name FROM trainee_training_slots
    `
  );

  const names = result.rows.map((row) => row.name).filter(Boolean);
  const wanted = normalize(input);
  const exact = names.filter((name) => normalize(name) === wanted);

  if (exact.length > 0) {
    return { success: true, name: exact[0] };
  }

  const parts = wanted.split(" ");
  const matches = names.filter((name) => {
    const words = normalize(name).split(" ");
    return parts.every((part) => words.includes(part));
  });

  if (matches.length === 1) {
    return { success: true, name: matches[0] };
  }

  if (matches.length > 1) {
    return {
      success: false,
      message: [
        `⚠️ יש כמה מתאמנים בשם ${input}:`,
        ...matches.sort((a, b) => a.localeCompare(b, "he")).map((name) => `• ${name}`),
        "",
        `כתבו את השם המלא, למשל: נוכחות של ${matches[0]}`,
      ].join("\n"),
    };
  }

  return {
    success: false,
    message: `❌ לא מצאתי מתאמן בשם ${input}.`,
  };
}

async function buildTraineeAttendanceReport({ name, yearMonth }, db = pool) {
  const resolved = await resolveTraineeName(name, db);

  if (!resolved.success) {
    return resolved.message;
  }

  const range = getMonthRange(yearMonth);
  const countFrom = getAttendanceStartDate();
  const startDate = range.startDate > countFrom ? range.startDate : countFrom;
  const monthLabel = formatMonthLabel(yearMonth);

  if (startDate >= range.endDate) {
    return `ℹ️ הנוכחות נספרת מ-${formatStartDate(countFrom)}, ולכן אין נתונים ל${monthLabel}.`;
  }

  const result = await db.query(
    `
      SELECT
        s.session_date,
        g.name AS group_name,
        r.status
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r.session_id
      JOIN trainees t ON t.id = r.trainee_id
      JOIN training_groups g ON g.id = s.group_id
      WHERE t.name = $1
        AND s.session_date >= $2::DATE
        AND s.session_date < $3::DATE
      ORDER BY s.session_date, g.name
    `,
    [resolved.name, startDate, range.endDate]
  );

  for (const row of result.rows) {
    row.session_date = toDateString(row.session_date);
  }

  const header = `📊 נוכחות – ${resolved.name} – ${monthLabel}`;
  const note =
    startDate > range.startDate
      ? `(נספר מ-${formatStartDate(startDate)})`
      : null;

  if (result.rows.length === 0) {
    return [
      header,
      ...(note ? [note] : []),
      "",
      "לא נמצאו דיווחי נוכחות עבורו/ה בחודש הזה.",
    ].join("\n");
  }

  const present = result.rows.filter((row) => row.status === "present").length;
  const total = result.rows.length;
  const percent = Math.round((present / total) * 100);

  return [
    header,
    ...(note ? [note] : []),
    "",
    `✅ הגיע/ה: ${present} מתוך ${total} אימונים (${percent}%)`,
    `❌ לא הגיע/ה: ${total - present}`,
    "",
    "לפי תאריך:",
    ...result.rows.map(
      (row) =>
        `${row.status === "present" ? "✅" : "❌"} ${formatDay(row.session_date)} · ${formatGroupName(row.group_name)}`
    ),
  ].join("\n");
}

module.exports = {
  resolveTraineeName,
  buildTraineeAttendanceReport,
};
