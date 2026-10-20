/*
 * דף הדיווח של המדריכים — זרימה מלאה עם SQL אמיתי
 * (pg-mem: Postgres בזיכרון, נתונים בדויים).
 *
 * פותחים קישור → רואים את האימונים של היום → פותחים קבוצה →
 * מסמנים הגיע / לא הגיע → שומרים → פותחים שוב ומתקנים.
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
  MANAGER_PHONES: "0500000001",
  CLUB_MANAGER_PHONE: "0500000001",
  COACH_PHONES: "0500000002",
  STAFF_NAMES: "0500000002:אבי",
  RAILWAY_PUBLIC_DOMAIN: "bot.example.com",
});

/* ---------- מסד נתונים בזיכרון ---------- */

const memoryDb = newDb();
const { Pool } = memoryDb.adapters.createPg();
const pool = new Pool();

function installModule(relativePath, exports) {
  const fullPath = require.resolve(path.join(ROOT, relativePath));

  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

installModule("services/databaseService.js", {
  pool,
  initializeDatabase: async () => {},
});

/* ---------- WhatsApp מדומה ---------- */

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

const coach = require("../services/coachReportService");
const attendance = require("../services/attendanceService");

const GALI_HADAR = "גלי הדר – ראשון לציון";
const COACH_PHONE = "0500000002";
const DAY_LETTERS = "אבגדהוש";

const today = attendance.getIsraelDateString(0);
const todayDow = attendance.getIsraelDayOfWeek();

let groupId;
let token;
const traineeIds = {};

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
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
      this.body = String(body);
      return this;
    },
  };
}

test.before(async () => {
  await pool.query(`
    CREATE TABLE training_groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, branch TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trainees (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, name TEXT NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(group_id, name));
    CREATE TABLE attendance_sessions (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, session_date DATE NOT NULL, submitted_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(group_id, session_date));
    CREATE TABLE attendance_records (id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL, trainee_id BIGINT NOT NULL, status TEXT NOT NULL, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(session_id, trainee_id));
    CREATE TABLE trainee_training_slots (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT, day_of_week INTEGER NOT NULL, start_time TIME NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(trainee_name, branch, day_of_week, start_time, group_label));
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
  `);

  /*
   * קבוצה שמתאמנת היום ב-18:00 + קבוצה ריקה.
   */
  const todayLetter = DAY_LETTERS[todayDow - 1];

  await pool.query(
    `INSERT INTO training_groups (name, branch) VALUES ($1, $2), ($3, $2)`,
    [
      `${todayLetter} 18:00 – בדיקה`,
      GALI_HADAR,
      `${todayLetter} 19:00 – ריקה`,
    ]
  );

  groupId = (
    await pool.query(
      `SELECT id FROM training_groups WHERE name LIKE '% 18:00 – בדיקה'`
    )
  ).rows[0].id;

  for (const name of ["דני", "נועה", "יואב"]) {
    const result = await pool.query(
      `INSERT INTO trainees (group_id, name) VALUES ($1, $2) RETURNING id`,
      [groupId, name]
    );

    traineeIds[name] = String(result.rows[0].id);
  }

  /*
   * שיבוצי גלי הדר היום ב-17:00.
   */
  for (const name of ["רון", "שירה"]) {
    await pool.query(
      `INSERT INTO trainee_training_slots (trainee_name, branch, group_label, day_of_week, start_time) VALUES ($1, $2, 'קטנים', $3, '17:00')`,
      [name, GALI_HADAR, todayDow]
    );
  }

  token = await coach.getOrCreateStaffToken(COACH_PHONE);
});

test("קישור אישי: קבוע, מזהה את המאמן, ונדחה למי שאינו צוות", async () => {
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal(await coach.getOrCreateStaffToken(COACH_PHONE), token);
  assert.equal((await coach.resolveStaffByToken(token)).name, "אבי");

  const strangerToken =
    await coach.getOrCreateStaffToken("0599999999");

  assert.equal(await coach.resolveStaffByToken(strangerToken), null);
  assert.equal(await coach.resolveStaffByToken("a".repeat(48)), null);
  assert.equal(await coach.resolveStaffByToken("short"), null);
});

test("דף הבית: האימונים של היום, בלי קבוצות ריקות, ושיבוצים בבחירה ידנית", async () => {
  const res = fakeRes();

  await coach.handleHome({ params: { token }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /18:00 – בדיקה/);
  assert.match(res.body, /שלום אבי/);
  assert.doesNotMatch(res.body, /class="title">[^<]*19:00 – ריקה/);
  assert.match(res.body, /17:00 \(לפי שיבוצים\)/);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("רשימת קבוצה: כל הילדים, בלי סימונים בפעם הראשונה", async () => {
  const res = fakeRes();

  await coach.handleSession(
    { params: { token }, query: { ref: `g:${groupId}`, date: today } },
    res
  );

  for (const name of ["דני", "נועה", "יואב"]) {
    assert.match(res.body, new RegExp(name));
  }

  assert.doesNotMatch(res.body, / checked/);
});

test("שמירה: נשמר במסד הנתונים, המנהל מקבל עדכון עם שם המדווח", async () => {
  const res = fakeRes();

  await coach.handleSave(
    {
      params: { token },
      body: {
        ref: `g:${groupId}`,
        date: today,
        [`t_${traineeIds.דני}`]: "present",
        [`t_${traineeIds.נועה}`]: "absent",
        [`t_${traineeIds.יואב}`]: "present",
      },
    },
    res
  );

  assert.match(res.body, /הנוכחות נשמרה/);
  assert.match(res.body, /הגיעו: 2 מתוך 3/);

  const records = (
    await pool.query(
      `SELECT t.name, r.status FROM attendance_records r JOIN trainees t ON t.id = r.trainee_id`
    )
  ).rows;

  assert.equal(records.length, 3);
  assert.equal(records.find((row) => row.name === "נועה").status, "absent");

  assert.equal(
    (await pool.query(`SELECT submitted_by FROM attendance_sessions`)).rows[0]
      .submitted_by,
    "אבי"
  );

  assert.ok(
    sent.some(
      (message) =>
        String(message.body).includes("דיווח נוכחות") &&
        String(message.body).includes("אבי")
    )
  );
});

test("פתיחה מחדש: הסימונים מוצגים, ותיקון מחליף את הדיווח", async () => {
  let res = fakeRes();

  await coach.handleSession(
    { params: { token }, query: { ref: `g:${groupId}`, date: today } },
    res
  );

  assert.match(res.body, /כבר דווח על האימון הזה/);
  assert.equal((res.body.match(/ checked/g) || []).length, 3);

  res = fakeRes();

  await coach.handleSave(
    {
      params: { token },
      body: {
        ref: `g:${groupId}`,
        date: today,
        [`t_${traineeIds.דני}`]: "present",
        [`t_${traineeIds.נועה}`]: "present",
        [`t_${traineeIds.יואב}`]: "present",
      },
    },
    res
  );

  const statuses = (
    await pool.query(`SELECT status FROM attendance_records`)
  ).rows.map((row) => row.status);

  assert.deepEqual(statuses, ["present", "present", "present"]);
  assert.equal(
    (await pool.query(`SELECT COUNT(*)::int AS n FROM attendance_sessions`))
      .rows[0].n,
    1
  );
});

test("שיבוצים לפי יום ושעה: הילדים מוצגים", async () => {
  const res = fakeRes();

  await coach.handleSession(
    { params: { token }, query: { ref: "s:17:00", date: today } },
    res
  );

  assert.match(res.body, /רון/);
  assert.match(res.body, /שירה/);
});

test("אבטחה ושגיאות: קוד שגוי, קבוצה לא קיימת, תאריך לא מורשה", async () => {
  let res = fakeRes();

  await coach.handleHome(
    { params: { token: "b".repeat(48) }, query: {} },
    res
  );

  assert.equal(res.statusCode, 404);

  res = fakeRes();

  await coach.handleSession(
    { params: { token }, query: { ref: "g:999999", date: today } },
    res
  );

  assert.match(res.body, /הקבוצה לא נמצאה/);
  assert.equal(coach.pickDate("2020-01-01"), today);
});

test("תאריכים: אפשר לדווח עד שבוע אחורה, לא יותר", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const dates = coach.getAllowedDates(now);

  assert.equal(dates.length, 7);
  assert.deepEqual(dates.slice(0, 2).map((d) => d.label), ["היום", "אתמול"]);
  assert.equal(dates[2].value, "2026-10-18");
  assert.equal(dates[2].label, "ראשון 18/10");
  assert.equal(coach.pickDate("2026-10-14", now), "2026-10-14");
  assert.equal(coach.pickDate("2026-10-13", now), "2026-10-20");
});

test("החלפת קישור: הישן מפסיק לעבוד, החדש עובד", async () => {
  const newToken = await coach.rotateStaffToken(COACH_PHONE);

  assert.notEqual(newToken, token);
  assert.equal(await coach.resolveStaffByToken(token), null);
  assert.equal((await coach.resolveStaffByToken(newToken)).name, "אבי");
});
