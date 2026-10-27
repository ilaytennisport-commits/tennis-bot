/*
 * בדיקות לדף הנוכחות החי (קישור סודי).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  setupHarness,
  textMessage,
  sentTo,
} = require("./helpers/harness");

const state = setupHarness({
  ATTENDANCE_START_DATE: "2020-01-01",
  RAILWAY_PUBLIC_DOMAIN: "bot.example.com",
});

const ExcelJS = require("exceljs");

const {
  handleAttendancePage,
  handleAttendanceExcel,
  renderAttendancePage,
  escapeHtml,
  parseMonthQuery,
} = require("../services/attendanceViewService");

const {
  summarizeAttendance,
} = require("../services/attendanceExportService");

const {
  parseManagerCommand,
} = require("../utils/staffCommandParser");

const {
  processIncomingMessage,
} = require("../controllers/webhookController");

const MANAGER_CHAT = "972500000001@s.whatsapp.net";
const COACH_CHAT = "972500000002@s.whatsapp.net";

function sampleRows() {
  return [
    {
      session_id: 1,
      session_date: "2026-10-19",
      submitted_by: "אבי",
      reported_at: new Date("2026-10-19T13:35:00Z"),
      group_id: 10,
      group_name: "א+ד 18:00 – ו+",
      branch: "גלי הדר – ראשון לציון",
      status: "present",
      trainee_id: 100,
      trainee_name: "מורל",
    },
    {
      session_id: 1,
      session_date: "2026-10-19",
      submitted_by: "אבי",
      reported_at: new Date("2026-10-19T13:35:00Z"),
      group_id: 10,
      group_name: "א+ד 18:00 – ו+",
      branch: "גלי הדר – ראשון לציון",
      status: "absent",
      trainee_id: 101,
      trainee_name: "<script>alert(1)</script>",
    },
  ];
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    contentType: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(values) {
      Object.assign(this.headers, values);
      return this;
    },
    type(value) {
      this.contentType = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

async function getLinkFromBot() {
  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(MANAGER_CHAT, "קישור נוכחות")
  );

  const reply = sentTo(state, MANAGER_CHAT).pop().body;
  const match = reply.match(
    /https:\/\/bot\.example\.com\/a\/([2-9a-km-np-zA-HJ-NP-Z]{12})/
  );

  return { reply, token: match?.[1] };
}

test("פקודות: קישור נוכחות / החלף קישור נוכחות", () => {
  assert.equal(parseManagerCommand("קישור נוכחות").type, "ATTENDANCE_LINK");
  assert.equal(parseManagerCommand("שלח לי את הקישור לנוכחות").type, "ATTENDANCE_LINK");
  assert.equal(parseManagerCommand("דף נוכחות").type, "ATTENDANCE_LINK");
  assert.equal(parseManagerCommand("החלף קישור נוכחות").type, "ROTATE_ATTENDANCE_LINK");
  assert.equal(parseManagerCommand("קישור חדש").type, "ROTATE_ATTENDANCE_LINK");
});

test("מנהל: מקבל קישור עם קוד סודי, ואותו קישור בכל פעם", async () => {
  const first = await getLinkFromBot();
  const second = await getLinkFromBot();

  assert.ok(first.token, first.reply);
  assert.equal(first.token, second.token);
  assert.match(first.reply, /מתעדכן לבד כל דקה/);
});

test("מאמן: 'קישור נוכחות' נותן קישור דיווח אישי, לא את הדף החי", async () => {
  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(COACH_CHAT, "קישור נוכחות")
  );

  const reply = sentTo(state, COACH_CHAT)[0].body;

  assert.match(reply, /הקישור האישי שלך לדיווח נוכחות/);
  assert.match(reply, /\/r\/[2-9a-km-np-zA-HJ-NP-Z]{12}/);
  assert.doesNotMatch(reply, /\/attendance\//);
});

test("דף: קוד נכון — מציג נוכחות, מתרענן כל דקה ולא נכנס למנועי חיפוש", async () => {
  const { token } = await getLinkFromBot();

  state.attendanceRows = sampleRows();

  const res = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { month: "2026-10" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /אוקטובר 2026/);
  assert.match(res.body, /מורל/);
  assert.match(res.body, /http-equiv="refresh" content="60"/);
  assert.match(res.body, /noindex/);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.match(res.body, /\/excel\?month=2026-10/);
});

test("דף: שמות מוצגים בבטחה (בלי הרצת קוד)", async () => {
  const { token } = await getLinkFromBot();

  state.attendanceRows = sampleRows();

  const res = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { month: "2026-10" } },
    res
  );

  assert.doesNotMatch(res.body, /<script>alert/);
  assert.match(res.body, /&lt;script&gt;/);
  assert.equal(escapeHtml(`<a href="x">`), "&lt;a href=&quot;x&quot;&gt;");
});

test("דף לפי יום: מי הגיע ומי לא, מעבר בין ימים, ולשונית 'כל החודש'", async () => {
  const { token } = await getLinkFromBot();

  state.attendanceRows = sampleRows();

  const res = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { date: "2026-10-19" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /יום שני 19\/10\/2026/);
  assert.match(res.body, /הגיעו 1 מתוך 2/);
  assert.match(res.body, /<ul class="names p"><li>מורל<\/li><\/ul>/);
  assert.match(res.body, /<ul class="names a"><li>&lt;script&gt;/);
  assert.doesNotMatch(res.body, /<script>alert/);
  assert.match(res.body, /dir="rtl"/);
  assert.match(res.body, /\?date=2026-10-18">→ יום קודם/);
  assert.match(res.body, /\?date=2026-10-20">יום הבא ←/);
  assert.match(res.body, /class="chip on" href="[^"]*\?date=2026-10-19"/);
  assert.match(res.body, /\?view=month&month=2026-10">כל החודש/);

  /* יום בלי דיווח */
  const empty = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { date: "2026-10-20" } },
    empty
  );

  assert.match(empty.body, /אין דיווחי נוכחות ביום שלישי 20\/10\/2026/);
  assert.match(empty.body, /\?date=2026-10-19"/);

  /* תאריך לא חוקי → היום, בלי שגיאה */
  const bad = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { date: "2026-02-31" } },
    bad
  );

  assert.equal(bad.statusCode, 200);
  assert.match(bad.body, /class="tab on"[^>]*>לפי יום/);

  /* בלי פרמטרים — לפי יום; view=month — הטבלה המלאה */
  const month = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { view: "month", month: "2026-10" } },
    month
  );

  assert.match(month.body, /סיכום לפי קבוצה/);
  assert.match(month.body, /class="tab on"[^>]*>כל החודש/);
});

test("דף: קוד שגוי או חסר — 404", async () => {
  for (const token of ["wrong", "a".repeat(48), ""]) {
    const res = fakeRes();

    await handleAttendancePage({ params: { token }, query: {} }, res);

    assert.equal(res.statusCode, 404);
  }
});

test("דף: הורדת אקסל מהקישור", async () => {
  const { token } = await getLinkFromBot();

  state.attendanceRows = sampleRows();

  const res = fakeRes();

  await handleAttendanceExcel(
    { params: { token }, query: { month: "2026-10" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Disposition"], /attendance-2026-10\.xlsx/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);

  assert.equal(workbook.worksheets[0].name, "סיכום");
});

test("דף: חודש בלי דיווחים — הודעה ידידותית", () => {
  const html = renderAttendancePage({
    summary: summarizeAttendance([]),
    monthLabel: "נובמבר 2026",
    yearMonth: { year: 2026, month: 11 },
    token: "t",
  });

  assert.match(html, /עדיין אין דיווחי נוכחות בנובמבר 2026/);
});

test("החלפת קישור: הקישור הישן מפסיק לעבוד", async () => {
  const before = await getLinkFromBot();

  state.sent.length = 0;

  await processIncomingMessage(
    textMessage(MANAGER_CHAT, "החלף קישור נוכחות")
  );

  const reply = sentTo(state, MANAGER_CHAT).pop().body;
  const newToken = reply.match(/\/a\/([2-9a-km-np-zA-HJ-NP-Z]{12})/)[1];

  assert.notEqual(newToken, before.token);
  assert.match(reply, /הקישור הקודם כבר לא עובד/);

  const oldRes = fakeRes();
  await handleAttendancePage({ params: { token: before.token }, query: {} }, oldRes);
  assert.equal(oldRes.statusCode, 404);

  const newRes = fakeRes();
  await handleAttendancePage({ params: { token: newToken }, query: {} }, newRes);
  assert.equal(newRes.statusCode, 200);
});

test("בחירת חודש מהכתובת", () => {
  const now = new Date("2026-10-18T10:00:00Z");

  assert.deepEqual(parseMonthQuery("2026-09", now), { year: 2026, month: 9 });
  assert.deepEqual(parseMonthQuery(undefined, now), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthQuery("garbage", now), { year: 2026, month: 10 });
});
