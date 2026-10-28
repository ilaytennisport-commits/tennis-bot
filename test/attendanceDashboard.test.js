/*
 * בדיקות לדשבורד הנוכחות (לשונית בדף הנוכחות החי).
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

const {
  buildDashboard,
  weekStart,
} = require("../services/attendanceDashboardService");

const {
  handleAttendancePage,
} = require("../services/attendanceViewService");

const {
  parseManagerCommand,
} = require("../utils/staffCommandParser");

const {
  processIncomingMessage,
} = require("../controllers/webhookController");

const MANAGER_CHAT = "972500000001@s.whatsapp.net";

const GH = "גלי הדר – ראשון לציון";
const BH = "בית חשמונאי";

let sessionIds = 0;

/*
 * מפגש אחד: { שם ילד: "present" / "absent" }.
 */
function session(date, group, marks, extra = {}) {
  sessionIds += 1;

  return Object.entries(marks).map(([name, status]) => ({
    session_id: sessionIds,
    session_date: date,
    submitted_by: extra.coach || "אבי",
    group_id: group.id,
    group_name: group.name,
    branch: group.branch,
    group_active: group.active !== false,
    status,
    trainee_id: `${group.id}-${name}`,
    trainee_name: name,
    trainee_active: !(extra.removed || []).includes(name),
  }));
}

const YOUNG = { id: 1, name: "גלי הדר | שלישי 16:30 | צעירה", branch: GH };
const TEENS = { id: 2, name: "נוער ב+ה 18:00", branch: BH };
const CLOSED = { id: 3, name: "קבוצה שנסגרה", branch: GH, active: false };

function sampleData() {
  const rows = [
    ...session("2026-10-06", YOUNG, { נועם: "present", מיה: "present", רון: "present" }),
    ...session("2026-10-13", YOUNG, { נועם: "present", מיה: "absent", רון: "present" }),
    ...session("2026-10-20", YOUNG, { נועם: "present", מיה: "absent", רון: "absent" }),
    ...session("2026-10-27", YOUNG, { נועם: "absent", מיה: "absent", רון: "absent", יוסי: "absent" }, { removed: ["יוסי"] }),
    ...session("2026-10-14", TEENS, { "<b>איתי</b>": "absent", תמר: "present" }, { coach: "שירה" }),
    ...session("2026-10-16", TEENS, { "<b>איתי</b>": "absent", תמר: "present" }, { coach: "שירה" }),
    ...session("2026-10-26", CLOSED, { דני: "absent" }),
    ...session("2026-10-26", CLOSED, { דני: "absent" }),
  ];

  const groups = [
    { ...YOUNG, last_date: "2026-10-27" },
    { ...TEENS, last_date: "2026-10-16" },
    { id: 4, name: "מבוגרים ערב", branch: GH, last_date: null },
  ];

  return { rows, groups };
}

test("שבוע מתחיל ביום ראשון", () => {
  assert.equal(weekStart("2026-10-28"), "2026-10-25");
  assert.equal(weekStart("2026-10-25"), "2026-10-25");
  assert.equal(weekStart("2026-10-24"), "2026-10-18");
});

test("דשבורד: אחוזים, קבוצות בלי דיווח, ילדים שהחסירו ברצף ומאמנים", () => {
  const { rows, groups } = sampleData();

  const d = buildDashboard({
    rows,
    groups,
    today: "2026-10-28",
    countingFrom: "2026-09-01",
  });

  /* 4 שבועות אחרונים (מ-01/10): 8 הגעות מתוך 16 סימונים, בלי יוסי ובלי הקבוצה שנסגרה */
  assert.equal(d.recent.sessions, 6);
  assert.equal(d.recent.marked, 16);
  assert.equal(d.recent.present, 8);
  assert.equal(d.recent.percent, 50);
  assert.equal(d.activeKids, 5);

  /* נוער לא דווח 12 יום; מבוגרים מעולם לא דווחו */
  assert.equal(d.staleCount, 2);
  assert.deepEqual(
    d.groups.map((g) => [g.name, g.stale]),
    [
      ["נוער ב+ה 18:00", true],
      ["מבוגרים ערב", true],
      ["צעירה – שלישי 16:30", false],
    ]
  );

  /* ילדים: מיה 3 ברצף, איתי 2, רון 2. נועם רק 1 — לא מופיע. יוסי הוסר. */
  assert.deepEqual(
    d.atRisk.map((kid) => [kid.name, kid.streak]),
    [
      ["מיה", 3],
      ["<b>איתי</b>", 2],
      ["רון", 2],
    ]
  );
  assert.equal(d.atRisk[0].lastPresent, "2026-10-06");
  assert.deepEqual(d.atRisk[0].dots, [true, false, false, false]);
  assert.equal(d.atRisk[1].lastPresent, null);

  assert.deepEqual(
    d.coaches.map((c) => [c.name, c.sessions, c.percent]),
    [
      ["אבי", 4, 50],
      ["שירה", 2, 50],
    ]
  );

  /* 8 שבועות, האחרון מתחיל ב-25/10 */
  assert.equal(d.weeks.length, 8);
  assert.equal(d.weeks.at(-1).start, "2026-10-25");
  assert.equal(d.weeks.at(-1).percent, 0);
  assert.equal(d.weeks[0].percent, null);
});

test("דשבורד: סינון לפי סניף", () => {
  const { rows, groups } = sampleData();

  const d = buildDashboard({
    rows,
    groups,
    today: "2026-10-28",
    branch: BH,
    countingFrom: "2026-09-01",
  });

  assert.equal(d.branch, BH);
  assert.deepEqual(d.branches, [BH, GH]);
  assert.deepEqual(d.groups.map((g) => g.name), ["נוער ב+ה 18:00"]);
  assert.deepEqual(d.atRisk.map((kid) => kid.name), ["<b>איתי</b>"]);
  assert.equal(d.recent.percent, 50);

  /* סניף לא מוכר — כל הסניפים */
  assert.equal(
    buildDashboard({ rows, groups, today: "2026-10-28", branch: "אין כזה" }).branch,
    null
  );
});

test("דשבורד: שבועות לפני תחילת הספירה לא מוצגים, ואין השוואה בלי נתונים קודמים", () => {
  const { rows, groups } = sampleData();

  const d = buildDashboard({
    rows,
    groups,
    today: "2026-10-28",
    countingFrom: "2026-10-18",
  });

  assert.deepEqual(d.weeks.map((w) => w.start), ["2026-10-18", "2026-10-25"]);
  assert.equal(d.hasPrevious, false);
});

async function managerLink(text) {
  state.sent.length = 0;

  await processIncomingMessage(textMessage(MANAGER_CHAT, text));

  return sentTo(state, MANAGER_CHAT).pop().body;
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(values) {
      Object.assign(this.headers, values);
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function israelDay(offset) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d + offset, 12)).toISOString().slice(0, 10);
}

test("פקודה: 'דשבורד' שולחת למנהל קישור ישר ללשונית", async () => {
  assert.equal(parseManagerCommand("דשבורד").type, "ATTENDANCE_DASHBOARD");
  assert.equal(parseManagerCommand("שלח לי את הדשבורד").type, "ATTENDANCE_DASHBOARD");
  assert.equal(parseManagerCommand("קישור לדשבורד נוכחות").type, "ATTENDANCE_DASHBOARD");
  assert.equal(parseManagerCommand("קישור נוכחות").type, "ATTENDANCE_LINK");

  const reply = await managerLink("דשבורד");

  assert.match(
    reply,
    /https:\/\/bot\.example\.com\/a\/[2-9a-km-np-zA-HJ-NP-Z]{12}\?view=dashboard/
  );
  assert.match(reply, /החסירו 2 אימונים ברצף/);
});

test("דף: לשונית הדשבורד מציגה נתונים, בטוחה ופרטית", async () => {
  const reply = await managerLink("קישור נוכחות");
  const token = reply.match(/\/a\/([2-9a-km-np-zA-HJ-NP-Z]{12})/)[1];

  state.attendanceRows = [
    ...session(israelDay(-9), TEENS, { "<b>איתי</b>": "absent", תמר: "present" }),
    ...session(israelDay(-2), TEENS, { "<b>איתי</b>": "absent", תמר: "present" }),
  ];
  state.dashboardGroups = [{ ...TEENS, last_date: israelDay(-2) }];

  const res = fakeRes();

  await handleAttendancePage(
    { params: { token }, query: { view: "dashboard" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.match(res.body, /class="tab on" href="[^"]*\?view=dashboard">דשבורד/);
  assert.match(res.body, /ילדים שכדאי להתקשר אליהם \(1\)/);
  assert.match(res.body, /&lt;b&gt;איתי/);
  assert.doesNotMatch(res.body, /<b><b>איתי/);
  assert.match(res.body, /<svg class="trend"/);

  /* קוד שגוי — 404 גם לדשבורד */
  const bad = fakeRes();
  await handleAttendancePage({ params: { token: "wrong" }, query: { view: "dashboard" } }, bad);
  assert.equal(bad.statusCode, 404);

  /* בלי דיווחים — הודעה ידידותית */
  state.attendanceRows = [];
  state.dashboardGroups = [];

  const empty = fakeRes();
  await handleAttendancePage({ params: { token }, query: { view: "dashboard" } }, empty);
  assert.match(empty.body, /עדיין אין דיווחי נוכחות ב-8 השבועות האחרונים/);
});
