/*
 * בדיקות לייצוא היסטוריית נוכחות לאקסל.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  setupHarness,
  textMessage,
  sentTo,
} = require("./helpers/harness");

/*
 * נתוני הדוגמה הם מתחילת אוקטובר — לפני תאריך ההתחלה ברירת המחדל.
 */
const state = setupHarness({
  ATTENDANCE_START_DATE: "2020-01-01",
});

const ExcelJS = require("exceljs");

const {
  parseMonthSpec,
} = require("../utils/months");

const {
  parseManagerCommand,
} = require("../utils/staffCommandParser");

const {
  summarizeAttendance,
  buildAttendanceWorkbook,
  formatGroupName,
  makeSheetName,
  getMonthRange,
} = require("../services/attendanceExportService");

const {
  runMonthlyReportIfDue,
} = require("../services/attendanceReportService");

const {
  processIncomingMessage,
} = require("../controllers/webhookController");

const MANAGER_CHAT = "972500000001@s.whatsapp.net";
const COACH_CHAT = "972500000002@s.whatsapp.net";

/*
 * נתוני דוגמה: שני מפגשים של צעירה (שלישי), מפגש אחד בבית חשמונאי.
 */
function sampleRows() {
  const row = (session, date, group, groupName, branch, trainee, name, status) => ({
    session_id: session,
    session_date: date,
    submitted_by: session === 3 ? "נועה" : "אבי",
    reported_at: new Date(`${date}T15:10:00Z`),
    group_id: group,
    group_name: groupName,
    branch,
    status,
    trainee_id: trainee,
    trainee_name: name,
  });

  const young = "גלי הדר | שלישי 16:30 | צעירה";
  const hash = "א+ד 15:30-16:30 – ג-ו מתחילים ומתקדמים";

  return [
    row(1, "2026-10-06", 10, young, "גלי הדר – ראשון לציון", 100, "מישל", "present"),
    row(1, "2026-10-06", 10, young, "גלי הדר – ראשון לציון", 101, "רז", "absent"),
    row(2, "2026-10-13", 10, young, "גלי הדר – ראשון לציון", 100, "מישל", "present"),
    row(2, "2026-10-13", 10, young, "גלי הדר – ראשון לציון", 101, "רז", "present"),
    row(3, "2026-10-11", 20, hash, "בית חשמונאי", 200, "יעל", "absent"),
  ];
}

test("חודשים: כל צורות הכתיבה", () => {
  // 18.10.2026
  const now = new Date("2026-10-18T10:00:00Z");

  assert.deepEqual(parseMonthSpec("", now), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthSpec("חודש קודם", now), { year: 2026, month: 9 });
  assert.deepEqual(parseMonthSpec("אוקטובר", now), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthSpec("דצמבר", now), { year: 2025, month: 12 });
  assert.deepEqual(parseMonthSpec("לספטמבר", now), { year: 2026, month: 9 });
  assert.deepEqual(parseMonthSpec("10/2026", now), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthSpec("3.26", now), { year: 2026, month: 3 });
  assert.deepEqual(parseMonthSpec("2025-12", now), { year: 2025, month: 12 });
  assert.equal(parseMonthSpec("משהו אחר", now), null);
  assert.equal(parseMonthSpec("13/2026", now), null);
});

test("חודשים: ינואר → חודש קודם הוא דצמבר של שנה קודמת", () => {
  const now = new Date("2027-01-05T10:00:00Z");

  assert.deepEqual(parseMonthSpec("חודש קודם", now), {
    year: 2026,
    month: 12,
  });

  assert.deepEqual(getMonthRange({ year: 2026, month: 12 }), {
    startDate: "2026-12-01",
    endDate: "2027-01-01",
  });
});

test("פקודת ייצוא: ניסוחים שונים", () => {
  assert.equal(
    parseManagerCommand("ייצוא נוכחות").type,
    "EXPORT_ATTENDANCE"
  );
  assert.equal(
    parseManagerCommand("דוח נוכחות חודש קודם").type,
    "EXPORT_ATTENDANCE"
  );
  assert.equal(
    parseManagerCommand('תשלח לי את דו"ח נוכחות אוקטובר').type,
    "EXPORT_ATTENDANCE"
  );
  assert.equal(
    parseManagerCommand("ייצוא נוכחות אוקטובר 2026").yearMonth.month,
    10
  );
  assert.equal(
    parseManagerCommand("ייצוא נוכחות בלה בלה").type,
    "INVALID_EXPORT_COMMAND"
  );
  // דיווח נוכחות רגיל אינו פקודת ייצוא
  assert.equal(parseManagerCommand("נוכחות צעירה שלישי"), null);
});

test("שמות קבוצות פנימיות מוצגים בצורה קריאה", () => {
  assert.equal(
    formatGroupName("גלי הדר | שלישי 16:30 | צעירה"),
    "צעירה – שלישי 16:30"
  );
  assert.equal(
    formatGroupName("גלי הדר | רביעי 17:00"),
    "גלי הדר – רביעי 17:00"
  );
  assert.equal(formatGroupName("א+ד 16:45"), "א+ד 16:45");
});

test("שמות גיליונות: עד 31 תווים, בלי תווים אסורים ובלי כפילויות", () => {
  const used = new Set();
  const long = "א".repeat(40);

  const first = makeSheetName(long, used);
  const second = makeSheetName(long, used);

  assert.ok(first.length <= 31);
  assert.ok(second.length <= 31);
  assert.notEqual(first, second);
  assert.equal(makeSheetName("א/ב:ג", used), "א-ב.ג");
});

test("סיכום: אחוזי נוכחות, מפגשים ומדווחים", () => {
  const summary = summarizeAttendance(sampleRows());

  const young = summary.groups.find(
    (group) => group.name === "צעירה – שלישי 16:30"
  );

  assert.equal(young.sessionCount, 2);
  assert.deepEqual(young.dates, ["2026-10-06", "2026-10-13"]);
  assert.equal(young.percent, 75);

  const raz = young.trainees.find((t) => t.name === "רז");

  assert.equal(raz.present, 1);
  assert.equal(raz.absent, 1);
  assert.equal(raz.percent, 50);

  assert.equal(summary.sessions.length, 3);
  assert.equal(summary.sessions[0].date, "2026-10-06");
  assert.equal(summary.sessions[0].reportedBy, "אבי");
  assert.equal(summary.sessions[0].present, 1);
  assert.equal(summary.sessions[0].total, 2);
});

test("קובץ אקסל: נבנה, נפתח מחדש ומכיל את הנתונים", async () => {
  const workbook = await buildAttendanceWorkbook({
    summary: summarizeAttendance(sampleRows()),
    monthLabel: "אוקטובר 2026",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);

  const names = reopened.worksheets.map((sheet) => sheet.name);

  assert.deepEqual(names.slice(0, 2), ["סיכום", "דיווחי מדריכים"]);
  assert.ok(names.includes("צעירה – שלישי 16.30"));
  assert.equal(names.length, 4);

  const young = reopened.getWorksheet("צעירה – שלישי 16.30");

  assert.equal(young.views[0].rightToLeft, true);
  assert.equal(young.getCell("A1").value, "שם מתאמן");

  const razRow = young
    .getColumn(1)
    .values.indexOf("רז");

  assert.equal(young.getRow(razRow).getCell(2).value, "✘");
  assert.equal(young.getRow(razRow).getCell(3).value, "✔");
  assert.equal(young.getRow(razRow).getCell(6).value, 50);

  const reports = reopened.getWorksheet("דיווחי מדריכים");

  assert.equal(reports.getCell("A2").value, "06/10");
  assert.equal(reports.getCell("E2").value, "אבי");
});

test("מנהל: 'ייצוא נוכחות אוקטובר' — מקבל קובץ אקסל ב-WhatsApp", async () => {
  state.attendanceRows = sampleRows();
  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(MANAGER_CHAT, "ייצוא נוכחות אוקטובר 2026")
  );

  const documents = sentTo(state, MANAGER_CHAT).filter(
    (message) => message.path === "/messages/document"
  );

  assert.equal(documents.length, 1);
  assert.equal(documents[0].filename, "attendance-2026-10.xlsx");
  assert.match(documents[0].body, /3 מפגשים ב-2 קבוצות/);
  assert.match(
    documents[0].media,
    /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;name=attendance-2026-10\.xlsx;base64,/
  );
});

test("מנהל: חודש בלי דיווחים — הודעה ולא קובץ", async () => {
  state.attendanceRows = sampleRows();
  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(MANAGER_CHAT, "ייצוא נוכחות 05/2026")
  );

  const messages = sentTo(state, MANAGER_CHAT);

  assert.ok(
    messages.every(
      (message) => message.path !== "/messages/document"
    )
  );
  assert.match(
    messages[messages.length - 1].body,
    /לא נמצאו דיווחי נוכחות במאי 2026/
  );
});

test("תאריך התחלה: דיווחים ישנים לא נכללים בקובץ", async () => {
  const {
    createMonthlyAttendanceFile,
    getAttendanceStartDate,
  } = require("../services/attendanceExportService");

  state.attendanceRows = sampleRows();

  process.env.ATTENDANCE_START_DATE = "2026-10-12";

  try {
    // 06/10 לא נכלל, 11/10 לא נכלל, 13/10 נכלל
    const october = await createMonthlyAttendanceFile({
      year: 2026,
      month: 10,
    });

    assert.equal(october.sessionCount, 1);

    // ספטמבר כולו לפני תאריך ההתחלה
    const september = await createMonthlyAttendanceFile({
      year: 2026,
      month: 9,
    });

    assert.equal(september.empty, true);
  } finally {
    process.env.ATTENDANCE_START_DATE = "2020-01-01";
  }

  delete process.env.ATTENDANCE_START_DATE;
  assert.equal(getAttendanceStartDate(), "2026-10-18");
  process.env.ATTENDANCE_START_DATE = "2020-01-01";
});

test("מאמן: אין הרשאה לייצוא", async () => {
  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(COACH_CHAT, "ייצוא נוכחות")
  );

  assert.match(
    sentTo(state, COACH_CHAT)[0].body,
    /אין לך הרשאה/
  );
});

test("דוח חודשי אוטומטי: נשלח ב-1 לחודש פעם אחת בלבד", async () => {
  state.attendanceRows = sampleRows();
  state.sent.length = 0;
  state.jobs.clear();

  // 31.10 בערב — עוד לא
  assert.equal(
    (await runMonthlyReportIfDue(new Date("2026-10-31T18:00:00Z"))).reason,
    "not-due"
  );

  // 1.11 בשעה 06:00 בישראל — מוקדם מדי
  assert.equal(
    (await runMonthlyReportIfDue(new Date("2026-11-01T04:00:00Z"))).reason,
    "not-due"
  );

  // 1.11 בשעה 09:00 בישראל — נשלח דוח אוקטובר
  const first = await runMonthlyReportIfDue(
    new Date("2026-11-01T07:00:00Z")
  );

  assert.equal(first.ran, true);
  assert.equal(first.sent, 1);
  assert.equal(
    sentTo(state, MANAGER_CHAT).find(
      (message) => message.path === "/messages/document"
    ).filename,
    "attendance-2026-10.xlsx"
  );

  // שעה אחר כך — לא נשלח שוב
  assert.equal(
    (await runMonthlyReportIfDue(new Date("2026-11-01T08:00:00Z"))).reason,
    "already-sent"
  );
});

test("דוח חודשי: אם השליחה נכשלה — ינסה שוב בשעה הבאה", async () => {
  state.attendanceRows = sampleRows();
  state.jobs.clear();
  state.failRecipients.add("972500000001");

  try {
    const first = await runMonthlyReportIfDue(
      new Date("2026-11-01T07:00:00Z")
    );

    assert.equal(first.sent, 0);
    assert.equal(state.jobs.size, 0);
  } finally {
    state.failRecipients.clear();
  }

  const retry = await runMonthlyReportIfDue(
    new Date("2026-11-01T08:00:00Z")
  );

  assert.equal(retry.sent, 1);
});
