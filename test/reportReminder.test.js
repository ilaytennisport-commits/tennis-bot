/*
 * תזכורת על נוכחות שלא דווחה — 21:00 למאמנים, 22:00 למנהלים
 * (pg-mem, שעון קבוע: יום שלישי 3/11/2026).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { newDb } = require("pg-mem");

const ROOT = path.resolve(__dirname, "..");

Object.assign(process.env, {
  DATABASE_URL: "postgres://mem",
  OPENAI_API_KEY: "test",
  WHAPI_TOKEN: "test",
  MANAGER_PHONES: "0500000001,0500000003",
  CLUB_MANAGER_PHONE: "0500000001",
  COACH_PHONES: "0500000002,0500000004",
  STAFF_NAMES: "0500000001:אור,0500000003:אשר,0500000002:אבי,0500000004:דנה",
  RAILWAY_PUBLIC_DOMAIN: "bot.example.com",
});

delete process.env.REPORT_REMINDERS;
delete process.env.COACH_REMINDER_TIME;
delete process.env.MANAGER_REMINDER_TIME;

const memoryDb = newDb();
const { Pool } = memoryDb.adapters.createPg();
const pool = new Pool();

const dbPath = require.resolve(path.join(ROOT, "services/databaseService.js"));

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool, initializeDatabase: async () => {} },
};

const sent = [];
const axiosPath = require.resolve("axios", { paths: [ROOT] });

require.cache[axiosPath] = {
  id: axiosPath,
  filename: axiosPath,
  loaded: true,
  exports: {
    post: async (url, payload) => {
      sent.push(payload);
      return { status: 200, data: { message: { id: `m${sent.length}` } } };
    },
  },
};

const reminders = require("../services/reportReminderService");
const attendance = require("../services/attendanceService");

const GALI = "גלי הדר – ראשון לציון";
const DATE = "2026-11-03";

/* בנובמבר ישראל היא UTC+2 */
const at = (hour, minute = 30) =>
  new Date(Date.UTC(2026, 10, 3, hour - 2, minute));

const to = (phone) => sent.filter((m) => String(m.to).includes(phone.slice(1)));

test.before(async () => {
  await pool.query(`
    CREATE TABLE training_groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, branch TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trainees (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, name TEXT NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(group_id, name));
    CREATE TABLE trainee_training_slots (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT, day_of_week INTEGER NOT NULL, start_time TIME NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE(trainee_name, branch, day_of_week, start_time, group_label));
    CREATE TABLE attendance_sessions (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, session_date DATE NOT NULL, submitted_by TEXT, UNIQUE(group_id, session_date));
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_token TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE scheduled_jobs (job_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  await attendance.createStaffCoachesTable(pool);
  await attendance.createDayExclusionsTable(pool);

  /* שלישי: עתודה 18:00 (קבוצה קבועה) + נבחרת צעירה 16:30 (שיבוצים) */
  const reserve = (
    await pool.query(
      `INSERT INTO training_groups (name, branch) VALUES ('א+ד 17:00 + ג 18:00 – עתודה', $1) RETURNING id`,
      [GALI]
    )
  ).rows[0].id;

  await pool.query(`INSERT INTO trainees (group_id, name) VALUES ($1, 'שי-לי שושן')`, [reserve]);

  /* קבוצה ריקה בשלישי — לא אמורה להופיע */
  await pool.query(`INSERT INTO training_groups (name, branch) VALUES ('ג 19:00 – ריקה', $1)`, [GALI]);

  await pool.query(
    `INSERT INTO trainee_training_slots (trainee_name, branch, group_label, day_of_week, start_time) VALUES ('מילי מועלם', $1, 'צעירה', 3, '16:30')`,
    [GALI]
  );

  /* הנבחרת כבר דווחה היום */
  const team = (
    await pool.query(
      `INSERT INTO training_groups (name, branch) VALUES ('גלי הדר | שלישי 16:30 | צעירה', $1) RETURNING id`,
      [GALI]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO attendance_sessions (group_id, session_date, submitted_by) VALUES ($1, $2, 'אבי')`,
    [team, DATE]
  );
});

test("לפני 21:30 לא נשלח כלום", async () => {
  sent.length = 0;

  const result = await reminders.runReportRemindersIfDue(at(21, 20), pool);

  assert.equal(result.ran, false);
  assert.equal(sent.length, 0);
});

test("מצב היום: מה דווח ומה לא, בלי קבוצות ריקות", async () => {
  const status = await reminders.getTodayStatus(at(21), pool);

  assert.equal(status.dayName, "שלישי");
  assert.deepEqual(
    status.sessions.map((s) => `${s.label} ${s.time} ${s.done ? "✅" : "❌"}`).sort(),
    ["נבחרת צעירה 16:30 ✅", "עתודה 18:00 ❌"]
  );
});

test("21:30 — כל מאמן מקבל תזכורת עם הקישור האישי שלו, פעם אחת ביום", async () => {
  sent.length = 0;

  await reminders.runReportRemindersIfDue(at(21, 30), pool);

  const avi = to("0500000002");
  const dana = to("0500000004");

  assert.equal(avi.length, 1);
  assert.equal(dana.length, 1);
  assert.match(avi[0].body, /תזכורת דיווח נוכחות – יום שלישי 3\/11/);
  assert.match(avi[0].body, /עוד לא דווחו היום:\n• עתודה – 18:00\n/);
  assert.doesNotMatch(avi[0].body, /נבחרת צעירה/);
  assert.match(avi[0].body, /https:\/\/bot\.example\.com\/r\/[2-9a-km-np-zA-HJ-NP-Z]{12}/);
  assert.notEqual(
    avi[0].body.match(/\/r\/(\w+)/)[1],
    dana[0].body.match(/\/r\/(\w+)/)[1]
  );
  assert.equal(to("0500000001").length, 0);

  sent.length = 0;
  await reminders.runReportRemindersIfDue(at(21, 45), pool);
  assert.equal(sent.length, 0);
});

test("22:00 — המנהלים מקבלים מה עדיין לא דווח ומה כן", async () => {
  sent.length = 0;

  await reminders.runReportRemindersIfDue(at(22), pool);

  const or = to("0500000001");
  const asher = to("0500000003");

  assert.equal(or.length, 1);
  assert.equal(asher.length, 1);
  assert.equal(
    or[0].body,
    [
      "📋 נוכחות שלא דווחה היום – שלישי 3/11",
      "",
      "גלי הדר:",
      "❌ עתודה – 18:00",
      "",
      "✅ דווחו: נבחרת צעירה",
      "",
      "המאמנים קיבלו תזכורת ב-21:30.",
    ].join("\n")
  );

  /* המאמנים לא מקבלים שוב */
  assert.equal(to("0500000002").length, 0);
});

test("כשהכל דווח — לא נשלחת תזכורת", async () => {
  await pool.query(`DELETE FROM scheduled_jobs`);
  await pool.query(
    `INSERT INTO attendance_sessions (group_id, session_date, submitted_by) VALUES (1, $1, 'דנה')`,
    [DATE]
  );

  sent.length = 0;
  await reminders.runReportRemindersIfDue(at(22, 10), pool);

  assert.equal(sent.length, 0);
});

test("אפשר לכבות", async () => {
  await pool.query(`DELETE FROM scheduled_jobs`);
  process.env.REPORT_REMINDERS = "false";

  const result = await reminders.runReportRemindersIfDue(at(22), pool);

  assert.equal(result.reason, "disabled");
  delete process.env.REPORT_REMINDERS;
});
