const ExcelJS = require("exceljs");

const { pool } = require("./databaseService");

const {
  HEBREW_MONTHS,
  getIsraelYearMonth,
  shiftMonth,
  formatMonthLabel,
} = require("../utils/months");

/*
 * =========================================================
 * ייצוא היסטוריית נוכחות לאקסל
 * =========================================================
 *
 * הקובץ כולל:
 * 1. "סיכום" — לכל קבוצה: מפגשים, מתאמנים ואחוז נוכחות.
 * 2. "דיווחי מדריכים" — כל מפגש: תאריך, קבוצה, מי דיווח ומתי.
 * 3. גיליון לכל קבוצה — מתאמנים בשורות, תאריכים בעמודות, ✔ / ✘.
 */

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

const PRESENT_MARK = "✔";
const ABSENT_MARK = "✘";

const COLORS = {
  header: "FFDDEBE3",
  present: "FFE3F4E8",
  absent: "FFFBE4E4",
  border: "FFC9D6CF",
};

/*
 * =========================================================
 * חודשים
 * =========================================================
 */

/*
 * מאיזה תאריך נספרת היסטוריית הנוכחות בדוחות.
 * דיווחים מלפני התאריך (בדיקות מתקופת הבנייה) נשארים במסד
 * הנתונים, אבל לא נכללים בקובצי האקסל.
 * אפשר לשנות במשתנה הסביבה ATTENDANCE_START_DATE (YYYY-MM-DD).
 */
const DEFAULT_ATTENDANCE_START_DATE = "2026-10-18";

function getAttendanceStartDate() {
  const value = process.env.ATTENDANCE_START_DATE;

  return /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value
    : DEFAULT_ATTENDANCE_START_DATE;
}

function getMonthRange({ year, month }) {
  const pad = (value) =>
    String(value).padStart(2, "0");

  const next = shiftMonth({ year, month }, 1);

  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${next.year}-${pad(next.month)}-01`,
  };
}

/*
 * =========================================================
 * שליפת הנתונים
 * =========================================================
 */

async function fetchAttendanceRows(
  { startDate, endDate },
  db = pool
) {
  const result = await db.query(
    `
      SELECT
        s.id AS session_id,
        TO_CHAR(s.session_date, 'YYYY-MM-DD') AS session_date,
        s.submitted_by,
        s.updated_at AS reported_at,
        g.id AS group_id,
        g.name AS group_name,
        g.branch,
        r.status,
        t.id AS trainee_id,
        t.name AS trainee_name
      FROM attendance_sessions s
      JOIN training_groups g
        ON g.id = s.group_id
      LEFT JOIN attendance_records r
        ON r.session_id = s.id
      LEFT JOIN trainees t
        ON t.id = r.trainee_id
      WHERE s.session_date >= $1::DATE
        AND s.session_date < $2::DATE
      ORDER BY
        g.branch,
        g.name,
        s.session_date,
        t.name
    `,
    [startDate, endDate]
  );

  return result.rows;
}

/*
 * =========================================================
 * עיבוד הנתונים (בלי אקסל — קל לבדיקה)
 * =========================================================
 */

/*
 * "גלי הדר | שלישי 16:30 | צעירה" → "צעירה – שלישי 16:30"
 * "גלי הדר | שלישי 18:00"         → "גלי הדר – שלישי 18:00"
 */
function formatGroupName(name = "") {
  const parts = String(name)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts[0] === "גלי הדר" && parts.length === 3) {
    return `${parts[2]} – ${parts[1]}`;
  }

  if (parts[0] === "גלי הדר" && parts.length === 2) {
    return `גלי הדר – ${parts[1]}`;
  }

  return String(name);
}

function dayNameOf(dateString) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  return DAY_NAMES[
    new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  ];
}

function formatShortDate(dateString) {
  const [, month, day] = dateString.split("-");

  return `${day}/${month}`;
}

function formatReportedAt(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function percent(present, total) {
  return total > 0
    ? Math.round((present / total) * 100)
    : null;
}

function summarizeAttendance(rows = []) {
  const groups = new Map();
  const sessions = new Map();

  for (const row of rows) {
    if (!groups.has(row.group_id)) {
      groups.set(row.group_id, {
        id: row.group_id,
        name: formatGroupName(row.group_name),
        branch: row.branch || "",
        dates: new Set(),
        trainees: new Map(),
      });
    }

    const group = groups.get(row.group_id);

    group.dates.add(row.session_date);

    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        date: row.session_date,
        day: dayNameOf(row.session_date),
        groupName: group.name,
        branch: group.branch,
        reportedBy: row.submitted_by || "",
        reportedAt: formatReportedAt(row.reported_at),
        present: 0,
        total: 0,
      });
    }

    if (!row.trainee_id) {
      continue;
    }

    const session = sessions.get(row.session_id);

    session.total += 1;

    if (row.status === "present") {
      session.present += 1;
    }

    if (!group.trainees.has(row.trainee_id)) {
      group.trainees.set(row.trainee_id, {
        name: row.trainee_name,
        byDate: new Map(),
      });
    }

    group.trainees
      .get(row.trainee_id)
      .byDate.set(row.session_date, row.status);
  }

  const groupList = [...groups.values()].map((group) => {
    const dates = [...group.dates].sort();

    const trainees = [...group.trainees.values()]
      .map((trainee) => {
        const statuses = [...trainee.byDate.values()];
        const present = statuses.filter(
          (status) => status === "present"
        ).length;
        const absent = statuses.filter(
          (status) => status === "absent"
        ).length;

        return {
          name: trainee.name,
          byDate: trainee.byDate,
          present,
          absent,
          percent: percent(present, present + absent),
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, "he")
      );

    const present = trainees.reduce(
      (sum, trainee) => sum + trainee.present,
      0
    );
    const marked = trainees.reduce(
      (sum, trainee) =>
        sum + trainee.present + trainee.absent,
      0
    );

    return {
      name: group.name,
      branch: group.branch,
      dates,
      trainees,
      sessionCount: dates.length,
      percent: percent(present, marked),
    };
  });

  const sessionList = [...sessions.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.groupName.localeCompare(b.groupName, "he")
  );

  return {
    groups: groupList,
    sessions: sessionList,
  };
}

/*
 * =========================================================
 * בניית קובץ האקסל
 * =========================================================
 */

/*
 * שם גיליון באקסל: עד 31 תווים, בלי : \ / ? * [ ]
 */
function makeSheetName(name, usedNames) {
  const base =
    String(name)
      .replace(/:/g, ".")
      .replace(/[\\/?*[\]]/g, "-")
      .trim()
      .slice(0, 28) || "קבוצה";

  let candidate = base;
  let counter = 2;

  while (usedNames.has(candidate)) {
    candidate = `${base.slice(0, 26)} ${counter}`;
    counter += 1;
  }

  usedNames.add(candidate);

  return candidate;
}

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };

  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.header },
    };
    cell.border = {
      bottom: {
        style: "thin",
        color: { argb: COLORS.border },
      },
    };
  });
}

function createSheet(workbook, name) {
  return workbook.addWorksheet(name, {
    views: [
      {
        rightToLeft: true,
        state: "frozen",
        xSplit: 1,
        ySplit: 1,
      },
    ],
  });
}

async function buildAttendanceWorkbook({
  summary,
  monthLabel,
}) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Tennis Bot";
  workbook.created = new Date();

  const usedNames = new Set();

  /* ---------- סיכום ---------- */

  const summarySheet = createSheet(
    workbook,
    makeSheetName("סיכום", usedNames)
  );

  summarySheet.columns = [
    { header: "קבוצה", key: "name", width: 42 },
    { header: "סניף", key: "branch", width: 24 },
    { header: "מפגשים", key: "sessions", width: 10 },
    { header: "מתאמנים", key: "trainees", width: 10 },
    { header: "% נוכחות", key: "percent", width: 11 },
  ];

  for (const group of summary.groups) {
    summarySheet.addRow({
      name: group.name,
      branch: group.branch,
      sessions: group.sessionCount,
      trainees: group.trainees.length,
      percent:
        group.percent === null ? "" : group.percent,
    });
  }

  styleHeaderRow(summarySheet.getRow(1));

  summarySheet.addRow([]);
  summarySheet.addRow([
    `דוח נוכחות – ${monthLabel}`,
  ]).font = { italic: true };

  /* ---------- דיווחי מדריכים ---------- */

  const reportsSheet = createSheet(
    workbook,
    makeSheetName("דיווחי מדריכים", usedNames)
  );

  reportsSheet.columns = [
    { header: "תאריך", key: "date", width: 12 },
    { header: "יום", key: "day", width: 9 },
    { header: "קבוצה", key: "group", width: 40 },
    { header: "סניף", key: "branch", width: 22 },
    { header: "דווח על ידי", key: "reportedBy", width: 18 },
    { header: "זמן הדיווח", key: "reportedAt", width: 16 },
    { header: "הגיעו", key: "present", width: 8 },
    { header: "מתוך", key: "total", width: 8 },
  ];

  for (const session of summary.sessions) {
    reportsSheet.addRow({
      date: formatShortDate(session.date),
      day: session.day,
      group: session.groupName,
      branch: session.branch,
      reportedBy: session.reportedBy,
      reportedAt: session.reportedAt,
      present: session.present,
      total: session.total,
    });
  }

  styleHeaderRow(reportsSheet.getRow(1));

  /* ---------- גיליון לכל קבוצה ---------- */

  for (const group of summary.groups) {
    const sheet = createSheet(
      workbook,
      makeSheetName(group.name, usedNames)
    );

    sheet.columns = [
      { header: "שם מתאמן", key: "name", width: 24 },
      ...group.dates.map((date) => ({
        header: `${formatShortDate(date)}\n${dayNameOf(date)}`,
        key: date,
        width: 9,
      })),
      { header: "הגיע", key: "present", width: 8 },
      { header: "נעדר", key: "absent", width: 8 },
      { header: "% נוכחות", key: "percent", width: 10 },
    ];

    for (const trainee of group.trainees) {
      const values = {
        name: trainee.name,
        present: trainee.present,
        absent: trainee.absent,
        percent:
          trainee.percent === null
            ? ""
            : trainee.percent,
      };

      for (const date of group.dates) {
        const status = trainee.byDate.get(date);

        values[date] =
          status === "present"
            ? PRESENT_MARK
            : status === "absent"
              ? ABSENT_MARK
              : "";
      }

      const row = sheet.addRow(values);

      group.dates.forEach((date, index) => {
        const cell = row.getCell(index + 2);
        const status = trainee.byDate.get(date);

        cell.alignment = { horizontal: "center" };

        if (status) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb:
                status === "present"
                  ? COLORS.present
                  : COLORS.absent,
            },
          };
        }
      });
    }

    const header = sheet.getRow(1);
    header.height = 32;
    styleHeaderRow(header);
  }

  return workbook;
}

/*
 * =========================================================
 * נקודת כניסה: בניית הקובץ לחודש מסוים
 * =========================================================
 */

/*
 * נתוני הנוכחות של חודש — משמש גם לקובץ האקסל וגם לדף החי.
 */
async function getMonthlyAttendanceSummary(
  yearMonth,
  db = pool
) {
  const monthRange = getMonthRange(yearMonth);
  const startDate = getAttendanceStartDate();

  const range = {
    startDate:
      monthRange.startDate > startDate
        ? monthRange.startDate
        : startDate,
    endDate: monthRange.endDate,
  };

  const rows =
    range.startDate < range.endDate
      ? await fetchAttendanceRows(range, db)
      : [];

  return {
    summary: summarizeAttendance(rows),
    monthLabel: formatMonthLabel(yearMonth),
  };
}

async function createMonthlyAttendanceFile(
  yearMonth,
  db = pool
) {
  const { summary, monthLabel } =
    await getMonthlyAttendanceSummary(
      yearMonth,
      db
    );

  return buildMonthlyFile({
    yearMonth,
    summary,
    monthLabel,
  });
}

async function buildMonthlyFile({
  yearMonth,
  summary,
  monthLabel,
}) {
  if (summary.sessions.length === 0) {
    return {
      empty: true,
      monthLabel,
    };
  }

  const workbook = await buildAttendanceWorkbook({
    summary,
    monthLabel,
  });

  const buffer = Buffer.from(
    await workbook.xlsx.writeBuffer()
  );

  const pad = String(yearMonth.month).padStart(2, "0");

  return {
    empty: false,
    monthLabel,
    buffer,
    filename: `attendance-${yearMonth.year}-${pad}.xlsx`,
    mimeType: XLSX_MIME_TYPE,
    sessionCount: summary.sessions.length,
    groupCount: summary.groups.length,
  };
}

module.exports = {
  XLSX_MIME_TYPE,
  HEBREW_MONTHS,
  getIsraelYearMonth,
  shiftMonth,
  getMonthRange,
  getAttendanceStartDate,
  formatMonthLabel,
  formatGroupName,
  summarizeAttendance,
  buildAttendanceWorkbook,
  makeSheetName,
  fetchAttendanceRows,
  getMonthlyAttendanceSummary,
  createMonthlyAttendanceFile,
};
