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
  MANAGER_PHONES: "0500000001,0500000003",
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
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_token TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
  `);

  await pool.query(`CREATE TABLE trainee_group_profiles (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(trainee_name, branch, group_label))`);
  await require("../services/pendingTraineeService").createPendingTraineesTable(pool);
  await require("../services/attendanceService").createStaffCoachesTable(pool);
  await require("../services/attendanceService").loadCoachOverrides(pool);

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
  assert.match(token, /^[2-9a-km-np-zA-HJ-NP-Z]{12}$/);
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

/* =========================================================
 * ילד שלא ברשימה → אישור מנהל
 * ========================================================= */

const pendingTrainees = require("../services/pendingTraineeService");

function managerMessages(id) {
  return sent.filter((message) => String(message.body).includes(`הוסף ${id}`));
}

test("ילד שלא ברשימה: בדף יש תיבה, והשם נשלח לשני המנהלים עם מספר", async () => {
  const currentToken = await coach.getOrCreateStaffToken(COACH_PHONE);
  let res = fakeRes();

  await coach.handleSession(
    { params: { token: currentToken }, query: { ref: `g:${groupId}`, date: today } },
    res
  );

  assert.match(res.body, /ילד שלא ברשימה \/ שיעור ניסיון/);
  assert.match(res.body, /name="extra_name_0"/);

  sent.length = 0;
  res = fakeRes();

  await coach.handleSave(
    {
      params: { token: currentToken },
      body: {
        ref: `g:${groupId}`,
        date: today,
        [`t_${traineeIds.דני}`]: "present",
        [`t_${traineeIds.נועה}`]: "present",
        [`t_${traineeIds.יואב}`]: "absent",
        extra_name_0: "  מיכל  ",
        extra_note_0: "ניסיון, רמה טובה",
        extra_name_1: "",
        extra_name_2: "עידו",
      },
    },
    res
  );

  assert.match(res.body, /הנוכחות נשמרה/);
  assert.match(res.body, /נשלחו למנהל לאישור: מיכל, עידו/);

  const rows = (await pool.query(`SELECT * FROM pending_trainees ORDER BY id`)).rows;

  assert.deepEqual(rows.map((row) => row.trainee_name), ["מיכל", "עידו"]);
  assert.equal(rows[0].notes, "ניסיון, רמה טובה");
  assert.equal(rows[0].submitted_by, "אבי");

  const messages = managerMessages(rows[0].id);

  assert.equal(messages.length, 2, "גם אור וגם אשר מקבלים");
  assert.match(messages[0].body, /🧒 מיכל/);
  assert.match(messages[0].body, /ניסיון, רמה טובה/);
  assert.match(messages[0].body, /לא \d+/);

  /*
   * שמירה חוזרת של אותו דיווח לא שולחת שוב את אותו ילד.
   */
  sent.length = 0;

  await coach.handleSave(
    {
      params: { token: currentToken },
      body: { ref: `g:${groupId}`, date: today, [`t_${traineeIds.דני}`]: "present", extra_name_0: "מיכל" },
    },
    fakeRes()
  );

  assert.equal(managerMessages(rows[0].id).length, 0);
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM pending_trainees`)).rows[0].n, 2);
});

test("תשובת מנהל: פענוח הוסף / לא / ממתינים", () => {
  assert.deepEqual(pendingTrainees.parsePendingReply("הוסף 12"), { action: "add", id: 12 });
  assert.deepEqual(pendingTrainees.parsePendingReply("תוסיף #7"), { action: "add", id: 7 });
  assert.deepEqual(pendingTrainees.parsePendingReply("לא 3"), { action: "reject", id: 3 });
  assert.deepEqual(pendingTrainees.parsePendingReply("ממתינים"), { action: "list" });
  assert.equal(pendingTrainees.parsePendingReply("לא הבנתי מה קרה"), null);
  assert.equal(pendingTrainees.parsePendingReply("תוסיף את דני לצעירה"), null);
});

test("הוסף: הילד נכנס לרשימה, מסומן 'הגיע' בדיווח של אותו יום, והמנהל השני מקבל עדכון", async () => {
  const request = (await pool.query(`SELECT * FROM pending_trainees WHERE trainee_name = 'מיכל'`)).rows[0];

  sent.length = 0;

  const result = await pendingTrainees.handlePendingReply({
    reply: { action: "add", id: Number(request.id) },
    managerPhone: "0500000001",
  });

  assert.match(result.message, /מיכל נוסף\/ה ל/);
  assert.match(result.message, /סומן\/ה "הגיע"/);

  const trainee = (
    await pool.query(`SELECT id FROM trainees WHERE group_id = $1 AND name = 'מיכל' AND active`, [groupId])
  ).rows[0];

  assert.ok(trainee, "מיכל ברשימת הקבוצה");

  const record = (
    await pool.query(
      `SELECT r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
       WHERE r.trainee_id = $1 AND s.session_date = $2::DATE`,
      [trainee.id, today]
    )
  ).rows[0];

  assert.equal(record.status, "present");

  assert.ok(sent.some((message) => message.to.includes("0500000003") || String(message.to).includes("500000003")));
  assert.ok(sent.every((message) => !String(message.to).includes("500000001")), "המנהל שאישר לא מקבל עדכון על עצמו");

  const again = await pendingTrainees.handlePendingReply({
    reply: { action: "add", id: Number(request.id) },
    managerPhone: "0500000003",
  });

  assert.match(again.message, /כבר טופלה/);
});

test("לא: הבקשה נסגרת והילד לא נכנס לרשימה; בלי מספר — רק כשיש בקשה אחת", async () => {
  const result = await pendingTrainees.handlePendingReply({
    reply: { action: "reject", id: null },
    managerPhone: "0500000003",
  });

  assert.match(result.message, /עידו לא נוסף\/ה/);
  assert.equal(
    (await pool.query(`SELECT COUNT(*)::int AS n FROM trainees WHERE name = 'עידו'`)).rows[0].n,
    0
  );

  const list = await pendingTrainees.handlePendingReply({ reply: { action: "list" }, managerPhone: "0500000001" });

  assert.match(list.message, /אין ילדים שממתינים/);

  assert.equal(
    await pendingTrainees.handlePendingReply({ reply: { action: "reject", id: null }, managerPhone: "0500000001" }),
    null,
    "'לא' בלי בקשות פתוחות לא נבלע"
  );
});

test("הוסף באימון לפי יום ושעה (גלי הדר): הילד נכנס לשיבוץ של אותו יום ושעה", async () => {
  const currentToken = await coach.getOrCreateStaffToken(COACH_PHONE);

  await coach.handleSave(
    {
      params: { token: currentToken },
      body: { ref: "s:17:00", date: today, extra_name_0: "גלעד", extra_note_0: "ניסיון" },
    },
    fakeRes()
  );

  const request = (await pool.query(`SELECT * FROM pending_trainees WHERE trainee_name = 'גלעד'`)).rows[0];
  const result = await pendingTrainees.handlePendingReply({
    reply: { action: "add", id: Number(request.id) },
    managerPhone: "0500000001",
  });

  assert.match(result.message, /גלעד נוסף\/ה ל/);

  const slot = (
    await pool.query(
      `SELECT group_label, day_of_week FROM trainee_training_slots WHERE trainee_name = 'גלעד' AND start_time = '17:00' AND active`
    )
  ).rows[0];

  assert.ok(slot);
  assert.equal(Number(slot.day_of_week), todayDow);
  assert.equal(slot.group_label, "קטנים");
});

/* =========================================================
 * פתיחה וסגירה של קבוצה מ-WhatsApp
 * ========================================================= */

test("פקודות: פתח קבוצה / סגור קבוצה מזוהות, ולא מתנגשות עם הוספת ילד", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");

  assert.deepEqual(parseManagerCommand("פתח קבוצה א+ד 18:00 – ותיקים"), {
    type: "CREATE_GROUP",
    groupName: "א+ד 18:00 – ותיקים",
  });
  assert.deepEqual(parseManagerCommand("תוסיף קבוצה חדשה: ב+ה 17:00 - מתחילים"), {
    type: "CREATE_GROUP",
    groupName: "ב+ה 17:00 - מתחילים",
  });
  assert.deepEqual(parseManagerCommand("סגור את הקבוצה א+ד 18:00 – ותיקים"), {
    type: "CLOSE_GROUP",
    groupName: "א+ד 18:00 – ותיקים",
  });
  assert.notEqual(parseManagerCommand("תוסיף את דני לוי לקבוצה א+ד 16:00")?.type, "CREATE_GROUP");
});

test("פתח קבוצה: נוצרת עם סניף, מופיעה בדף הדיווח כשיש בה ילדים, ונסגרת", async () => {
  const noSchedule = await attendance.createGroup({ groupName: "ותיקים" });

  assert.equal(noSchedule.success, false);
  assert.match(noSchedule.message, /הימים והשעה/);

  const created = await attendance.createGroup({ groupName: `${DAY_LETTERS[todayDow - 1]} 18:00 - ותיקים` });

  assert.equal(created.success, true);
  assert.equal(created.group.name, `${DAY_LETTERS[todayDow - 1]} 18:00 – ותיקים`);
  assert.equal(created.group.branch, GALI_HADAR);

  const again = await attendance.createGroup({ groupName: `${DAY_LETTERS[todayDow - 1]} 18:00 – ותיקים` });

  assert.equal(again.code, "GROUP_EXISTS");

  const hashmonai = await attendance.createGroup({ groupName: "בית חשמונאי ב+ה 16:45 – מתחילים" });

  assert.equal(hashmonai.group.name, "ב+ה 16:45 – מתחילים");
  assert.equal(hashmonai.group.branch, "בית חשמונאי");

  const added = await attendance.addTrainee({ groupName: created.group.name, traineeName: "אדל" });

  assert.equal(added.success, true);

  const sessions = await coach.getSessionsForDate(today);

  assert.ok(sessions.some((session) => session.title === created.group.name));

  const closed = await attendance.closeGroup({ groupName: created.group.name });

  assert.equal(closed.success, true);
  assert.ok(!(await coach.getSessionsForDate(today)).some((session) => session.title === created.group.name));

  const reopened = await attendance.createGroup({ groupName: created.group.name });

  assert.equal(reopened.code, "GROUP_REOPENED");
});

/* =========================================================
 * הוספה והסרה של מאמנים מ-WhatsApp
 * ========================================================= */

test("פקודות מאמנים: הוסף / הסר / רשימה", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");

  assert.deepEqual(parseManagerCommand("הוסף מאמן 054-228-4211 אלונה"), {
    type: "ADD_COACH",
    phone: "054-228-4211",
    name: "אלונה",
  });
  assert.deepEqual(parseManagerCommand("תוסיף מאמן מרסל 0507123323"), {
    type: "ADD_COACH",
    phone: "0507123323",
    name: "מרסל",
  });
  assert.deepEqual(parseManagerCommand("הסר מאמן אבי"), { type: "REMOVE_COACH", phoneOrName: "אבי" });
  assert.deepEqual(parseManagerCommand("מאמנים"), { type: "LIST_COACHES" });
});

test("הוסף מאמן: מקבל קישור דיווח מיד, נשמר אחרי עלייה מחדש, והסרה חוסמת את הקישור", async () => {
  const NEW_COACH = "0507123323";

  assert.equal(attendance.isCoachPhone(NEW_COACH), false);

  const bad = await attendance.addCoach({ phone: "123", name: "x", managerPhone: "0500000001" });

  assert.equal(bad.success, false);

  const added = await attendance.addCoach({ phone: "050-712-3323", name: "מרסל", managerPhone: "0500000001" });

  assert.equal(added.success, true);
  assert.match(added.message, /מרסל \(0507123323\) נוסף/);
  assert.equal(attendance.isCoachPhone(NEW_COACH), true);
  assert.equal(attendance.getStaffName(NEW_COACH), "מרסל");

  const newToken = await coach.getOrCreateStaffToken(NEW_COACH);

  assert.equal((await coach.resolveStaffByToken(newToken)).name, "מרסל");
  assert.match(attendance.buildCoachListMessage(), /מרסל – 0507123323/);

  /*
   * עלייה מחדש של השרת: הרשימה נטענת מהמסד.
   */
  await attendance.loadCoachOverrides(pool);
  assert.equal(attendance.isCoachPhone(NEW_COACH), true);

  const removed = await attendance.removeCoach({ phoneOrName: "מרסל", managerPhone: "0500000001" });

  assert.equal(removed.success, true);
  assert.equal(attendance.isCoachPhone(NEW_COACH), false);
  assert.equal(await coach.resolveStaffByToken(newToken), null, "הקישור שלו כבר לא עובד");

  /*
   * מאמן מ-COACH_PHONES אפשר להסיר, ולהחזיר.
   */
  await attendance.removeCoach({ phoneOrName: COACH_PHONE, managerPhone: "0500000001" });
  assert.equal(attendance.isCoachPhone(COACH_PHONE), false);
  await attendance.addCoach({ phone: COACH_PHONE, name: "", managerPhone: "0500000001" });
  assert.equal(attendance.isCoachPhone(COACH_PHONE), true);
  assert.equal(attendance.getStaffName(COACH_PHONE), "אבי");

  const manager = await attendance.addCoach({ phone: "0500000001", name: "אור", managerPhone: "0500000001" });

  assert.match(manager.message, /כבר מוגדר כמנהל/);
});

/* =========================================================
 * שינוי שם של קבוצה ושל מתאמן
 * ========================================================= */

test("פקודות שינוי שם: שורה אחת או שלוש שורות", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");

  assert.deepEqual(parseManagerCommand("שנה שם אדל לאדל שלומון"), {
    type: "RENAME_TRAINEE",
    oldName: "אדל",
    newName: "אדל שלומון",
  });
  assert.deepEqual(parseManagerCommand("שנה שם\nנועם\nנועם לוי"), {
    type: "RENAME_TRAINEE",
    oldName: "נועם",
    newName: "נועם לוי",
  });
  assert.deepEqual(
    parseManagerCommand("שנה שם קבוצה\nא+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות\nא+ד 18:45-20:15 + ב+ה 18:45-20:15 – תחרותי ללא הסעות"),
    {
      type: "RENAME_GROUP",
      oldName: "א+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות",
      newName: "א+ד 18:45-20:15 + ב+ה 18:45-20:15 – תחרותי ללא הסעות",
    }
  );
  assert.deepEqual(parseManagerCommand("שנה שם קבוצה א+ד 18:00 – ותיקים ל- א+ד 18:30 – ותיקים"), {
    type: "RENAME_GROUP",
    oldName: "א+ד 18:00 – ותיקים",
    newName: "א+ד 18:30 – ותיקים",
  });
  assert.deepEqual(parseManagerCommand("קבוצות"), { type: "LIST_GROUPS" });
});

test("שינוי שם קבוצה: נשמר, הילדים נשארים, ושם בלי ימים ושעה נדחה", async () => {
  const before = (await pool.query(`SELECT name FROM training_groups WHERE id = $1`, [groupId])).rows[0].name;
  const newName = before.replace("18:00", "18:30");

  const bad = await attendance.renameGroup({ oldName: before, newName: "קבוצה בלי שעה" });

  assert.equal(bad.success, false);

  const renamed = await attendance.renameGroup({ oldName: before, newName });

  assert.equal(renamed.success, true);
  assert.equal(
    (await pool.query(`SELECT name FROM training_groups WHERE id = $1`, [groupId])).rows[0].name,
    newName
  );
  assert.ok((await attendance.getActiveTraineesByGroupId(groupId)).some((t) => t.name === "דני"));

  await attendance.renameGroup({ oldName: newName, newName: before });
});

test("שינוי שם מתאמן: מתעדכן בקבוצה ובשיבוצים, ושם כפול מבקש שם מלא", async () => {
  const renamed = await attendance.renameTrainee({ oldName: "רון", newName: "רון שמש" });

  assert.equal(renamed.success, true);
  assert.equal(
    (await pool.query(`SELECT COUNT(*)::int AS n FROM trainee_training_slots WHERE trainee_name = 'רון שמש'`)).rows[0].n,
    1
  );

  const danny = await attendance.renameTrainee({ oldName: "דני", newName: "דני כהן" });

  assert.equal(danny.success, true);
  assert.match(danny.message, /עודכן ב:/);
  assert.ok((await attendance.getActiveTraineesByGroupId(groupId)).some((t) => t.name === "דני כהן"));

  await pool.query(`INSERT INTO trainees (group_id, name) VALUES ($1, 'דני לוי')`, [groupId]);

  const ambiguous = await attendance.renameTrainee({ oldName: "דני", newName: "דני ש" });

  assert.equal(ambiguous.success, false);
  assert.match(ambiguous.message, /יש כמה מתאמנים/);

  const missing = await attendance.renameTrainee({ oldName: "אין כזה", newName: "x" });

  assert.match(missing.message, /לא מצאתי/);
});

/* =========================================================
 * נוכחות של מתאמן אחד
 * ========================================================= */

test("פקודה: 'תן לי נוכחות של נועם לוי החודש' — שם וחודש", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");
  const now = new Date("2026-10-26T12:00:00Z");
  const { parseTraineeAttendanceCommand } = require("../utils/staffCommandParser");

  assert.deepEqual(parseTraineeAttendanceCommand("תן לי נוכחות של נועם לוי החודש", now), {
    type: "TRAINEE_ATTENDANCE",
    name: "נועם לוי",
    yearMonth: { year: 2026, month: 10 },
  });
  assert.deepEqual(parseTraineeAttendanceCommand("נוכחות של אדל חודש קודם", now).yearMonth, { year: 2026, month: 9 });
  assert.equal(parseTraineeAttendanceCommand("דוח נוכחות של אדל שלומון ספטמבר", now).name, "אדל שלומון");
  assert.equal(parseTraineeAttendanceCommand("נוכחות של נועם בחודש הקודם", now).name, "נועם");
  assert.deepEqual(parseTraineeAttendanceCommand("נוכחות של נועם", now).yearMonth, { year: 2026, month: 10 });
  assert.equal(parseTraineeAttendanceCommand("נוכחות צעירה\nדני\nנועה", now), null, "דיווח בכמה שורות אינו בקשה לדוח");
  assert.equal(parseManagerCommand("ייצוא נוכחות").type, "EXPORT_ATTENDANCE");
});

test("דוח של מתאמן: כמה הגיע מתוך כמה, לפי תאריך", async () => {
  const { buildTraineeAttendanceReport } = require("../services/traineeReportService");
  const [year, month] = today.split("-").map(Number);

  const report = await buildTraineeAttendanceReport({ name: "נועה", yearMonth: { year, month } });

  assert.match(report, /📊 נוכחות – נועה/);
  assert.match(report, /הגיע\/ה: \d+ מתוך \d+ אימונים/);
  assert.match(report, /לפי תאריך:/);

  const ambiguous = await buildTraineeAttendanceReport({ name: "דני", yearMonth: { year, month } });

  assert.match(ambiguous, /יש כמה מתאמנים/);

  const missing = await buildTraineeAttendanceReport({ name: "לא קיים", yearMonth: { year, month } });

  assert.match(missing, /לא מצאתי/);

  const before = await buildTraineeAttendanceReport({ name: "נועה", yearMonth: { year: 2026, month: 8 } });

  assert.match(before, /הנוכחות נספרת מ-18\.10/);
});

test("הוספת כמה ילדים: פסיקים או שם בכל שורה", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");

  assert.equal(
    parseManagerCommand("תוסיף את שי-לי שושן, מילי מועלם לקבוצה א+ד 17:00 + ג 18:00 – עתודה").traineeName,
    "שי-לי שושן, מילי מועלם"
  );

  const multiLine = parseManagerCommand("תוסיף לקבוצה א+ד 16:00:\nדני כהן\n- נועה\nיואב");

  assert.equal(multiLine.type, "ADD_TRAINEE");
  assert.equal(multiLine.groupName, "א+ד 16:00");
  assert.equal(multiLine.traineeName, "דני כהן, נועה, יואב");
});
