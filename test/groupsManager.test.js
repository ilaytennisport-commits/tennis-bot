/*
 * דף ניהול קבוצות — הוספה והורדה של ילד מאימון ביום מסוים
 * (pg-mem: Postgres בזיכרון, נתונים בדויים).
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
  STAFF_NAMES: "0500000001:אור,0500000003:אשר,0500000002:אבי",
  RAILWAY_PUBLIC_DOMAIN: "bot.example.com",
});

const memoryDb = newDb();
const { Pool } = memoryDb.adapters.createPg();
const pool = new Pool();

function installModule(relativePath, exports) {
  const fullPath = require.resolve(path.join(ROOT, relativePath));

  require.cache[fullPath] = { id: fullPath, filename: fullPath, loaded: true, exports };
}

installModule("services/databaseService.js", { pool, initializeDatabase: async () => {} });

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

const groups = require("../services/groupsManagerService");
const coach = require("../services/coachReportService");
const attendance = require("../services/attendanceService");

const GALI = "גלי הדר – ראשון לציון";
let reserveId;
let managerToken;
let coachToken;

/* תאריך קרוב שנופל ביום מסוים בשבוע (1 = ראשון) */
function dateForDay(dayOfWeek) {
  const date = new Date(Date.UTC(2026, 10, 1, 12));

  while (date.getUTCDay() + 1 !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10);
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    data: null,
    status(code) { this.statusCode = code; return this; },
    set(values) { Object.assign(this.headers, values); return this; },
    type() { return this; },
    send(body) { this.body = String(body); return this; },
    json(value) { this.data = value; return this; },
  };
}

async function weekOf(branch = GALI) {
  return (await groups.getWeek()).find((b) => b.name === branch);
}

function session(week, id) {
  return week.sessions.find((s) => s.id === id);
}

test.before(async () => {
  await pool.query(`
    CREATE TABLE training_groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, branch TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trainees (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, name TEXT NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(group_id, name));
    CREATE TABLE trainee_training_slots (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT, day_of_week INTEGER NOT NULL, start_time TIME NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(trainee_name, branch, day_of_week, start_time, group_label));
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_token TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  await attendance.createStaffCoachesTable(pool);
  await attendance.createDayExclusionsTable(pool);

  reserveId = (
    await pool.query(
      `INSERT INTO training_groups (name, branch) VALUES ('א+ד 17:00 + ג 18:00 – עתודה', $1) RETURNING id`,
      [GALI]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO training_groups (name, branch) VALUES ('ב+ה 16:45-17:30 – א-ג מתחילים', 'בית חשמונאי')`
  );

  for (const name of ["אריאל דדי", "מילי מועלם", "שי-לי שושן"]) {
    await pool.query(`INSERT INTO trainees (group_id, name) VALUES ($1, $2)`, [reserveId, name]);
  }

  await pool.query(`INSERT INTO trainees (group_id, name) VALUES (2, 'גל רוט')`);

  for (const name of ["אריאל דדי", "מילי מועלם"]) {
    for (const day of [2, 3, 5]) {
      await pool.query(
        `INSERT INTO trainee_training_slots (trainee_name, branch, group_label, day_of_week, start_time) VALUES ($1, $2, 'צעירה', $3, '16:30')`,
        [name, GALI, day]
      );
    }
  }

  managerToken = await coach.getOrCreateStaffToken("0500000001", pool);
  coachToken = await coach.getOrCreateStaffToken("0500000002", pool);
});

test("השבוע: קבוצה קבועה בכל הימים שלה, נבחרת לפי שיבוצים, וסניף נפרד", async () => {
  const week = await weekOf();

  for (const day of [1, 3, 4]) {
    assert.deepEqual(session(week, `g:${reserveId}@${day}`).members, ["אריאל דדי", "מילי מועלם", "שי-לי שושן"]);
  }

  assert.equal(session(week, `g:${reserveId}@1`).label, "עתודה");
  assert.equal(session(week, `g:${reserveId}@1`).kind, "reserve");
  assert.deepEqual(session(week, "t:צעירה@2").members, ["אריאל דדי", "מילי מועלם"]);
  assert.equal(session(week, "t:צעירה@2").kind, "young");

  const other = await weekOf("בית חשמונאי");

  assert.deepEqual(session(other, "g:2@2").members, ["גל רוט"]);
});

test("הורדה מעתודה רק ביום ראשון: נשארת ברביעי ובשלישי, וגם דף הדיווח מתעדכן", async () => {
  const result = await groups.applyChange({
    sessionId: `g:${reserveId}@1`,
    name: "אריאל דדי",
    on: false,
  });

  assert.equal(result.ok, true);

  const week = await weekOf();

  assert.deepEqual(session(week, `g:${reserveId}@1`).members, ["מילי מועלם", "שי-לי שושן"]);
  assert.ok(session(week, `g:${reserveId}@4`).members.includes("אריאל דדי"));
  assert.ok(session(week, `g:${reserveId}@3`).members.includes("אריאל דדי"));

  const sunday = await coach.resolveSessionRef(`g:${reserveId}`, dateForDay(1));
  const wednesday = await coach.resolveSessionRef(`g:${reserveId}`, dateForDay(4));

  assert.ok(!sunday.trainees.some((t) => t.name === "אריאל דדי"));
  assert.ok(wednesday.trainees.some((t) => t.name === "אריאל דדי"));

  /* החזרה ליום ראשון */
  await groups.applyChange({ sessionId: `g:${reserveId}@1`, name: "אריאל דדי", on: true });

  assert.ok(session(await weekOf(), `g:${reserveId}@1`).members.includes("אריאל דדי"));
});

test("הורדה מכל הימים של הקבוצה — הילד יוצא מהקבוצה", async () => {
  for (const day of [1, 3, 4]) {
    await groups.applyChange({ sessionId: `g:${reserveId}@${day}`, name: "מילי מועלם", on: false });
  }

  const row = (
    await pool.query(`SELECT active FROM trainees WHERE group_id = $1 AND name = 'מילי מועלם'`, [reserveId])
  ).rows[0];

  assert.equal(row.active, false);
  assert.equal(
    (await pool.query(`SELECT COUNT(*)::INT AS n FROM trainee_day_exclusions`)).rows[0].n,
    0
  );
});

test("ילד חדש בקבוצה קבועה ביום אחד — מופיע רק ביום הזה", async () => {
  await groups.applyChange({ sessionId: `g:${reserveId}@4`, name: "מילי מועלם", on: true });

  const week = await weekOf();

  assert.ok(session(week, `g:${reserveId}@4`).members.includes("מילי מועלם"));
  assert.ok(!session(week, `g:${reserveId}@1`).members.includes("מילי מועלם"));
  assert.ok(!session(week, `g:${reserveId}@3`).members.includes("מילי מועלם"));
});

test("נבחרת: הוספה ביום שלישי בלבד, והורדה מנבחרת ביום חמישי", async () => {
  await groups.applyChange({ sessionId: "t:צעירה@3", name: "שי-לי שושן", on: true });
  await groups.applyChange({ sessionId: "t:צעירה@5", name: "אריאל דדי", on: false });

  const week = await weekOf();

  assert.ok(session(week, "t:צעירה@3").members.includes("שי-לי שושן"));
  assert.ok(!session(week, "t:צעירה@2").members.includes("שי-לי שושן"));
  assert.ok(!session(week, "t:צעירה@5").members.includes("אריאל דדי"));
  assert.ok(session(week, "t:צעירה@2").members.includes("אריאל דדי"));
});

test("שינוי לא חוקי נדחה", async () => {
  assert.equal((await groups.applyChange({ sessionId: "x:1@1", name: "דני", on: true })).ok, false);
  assert.equal((await groups.applyChange({ sessionId: `g:${reserveId}@2`, name: "דני", on: true })).ok, false);
  assert.equal((await groups.applyChange({ sessionId: `g:${reserveId}@1`, name: "  ", on: true })).ok, false);
});

test("הודעה למנהלים: שינוי שבוטל לא נשלח, והשאר מרוכזים בהודעה אחת", () => {
  const message = groups.buildChangesMessage("אור", [
    { sessionId: `g:${reserveId}@1`, name: "אריאל דדי", on: false, day: 1, time: "17:00", label: "עתודה" },
    { sessionId: "t:צעירה@3", name: "שי-לי שושן", on: true, day: 3, time: "16:30", label: "נבחרת צעירה" },
    { sessionId: "t:צעירה@3", name: "מילי מועלם", on: false, day: 3, time: "16:30", label: "נבחרת צעירה" },
    { sessionId: "t:צעירה@3", name: "מילי מועלם", on: true, day: 3, time: "16:30", label: "נבחרת צעירה" },
  ]);

  assert.equal(
    message,
    [
      "🗂️ שינויים בקבוצות (ע״י אור):",
      "",
      "➖ אריאל דדי – עתודה, ראשון 17:00",
      "➕ שי-לי שושן – נבחרת צעירה, שלישי 16:30",
    ].join("\n")
  );

  assert.equal(
    groups.buildChangesMessage("אור", [
      { sessionId: "t:צעירה@3", name: "מילי מועלם", on: false, day: 3, time: "16:30", label: "נבחרת צעירה" },
      { sessionId: "t:צעירה@3", name: "מילי מועלם", on: true, day: 3, time: "16:30", label: "נבחרת צעירה" },
    ]),
    null
  );
});

test("הדף: רק מנהל נכנס; שינוי מהדף נשמר והעדכון נשלח לשני המנהלים", async () => {
  const denied = res();

  await groups.handlePage({ params: { token: coachToken } }, denied);
  assert.equal(denied.statusCode, 404);

  const page = res();

  await groups.handlePage({ params: { token: managerToken } }, page);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["Cache-Control"], "no-store");
  assert.match(page.body, /ניהול קבוצות/);
  assert.match(page.body, /שי-לי שושן/);
  assert.doesNotMatch(page.body, /<\/script><script>alert/);

  /* הקוד של הדף תקין, והנתונים נקראים */
  const script = page.body.match(/<script>([\s\S]*)<\/script>/)[1];
  const data = page.body.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1];

  assert.doesNotThrow(() => new Function(script));
  assert.ok(JSON.parse(data).some((b) => b.name === GALI));

  const bad = res();

  await groups.handleChange({ params: { token: managerToken }, body: { sessionId: "nope", name: "x", on: true } }, bad);
  assert.equal(bad.statusCode, 400);

  sent.length = 0;

  const ok = res();

  await groups.handleChange(
    { params: { token: managerToken }, body: { sessionId: `g:${reserveId}@1`, name: "שי-לי שושן", on: false } },
    ok
  );
  assert.deepEqual(ok.data, { ok: true });

  await groups.flushAllNotifications();

  const updates = sent.filter((m) => String(m.body).includes("שינויים בקבוצות"));

  assert.equal(updates.length, 2);
  assert.match(updates[0].body, /ע״י אור/);
  assert.match(updates[0].body, /➖ שי-לי שושן – עתודה, ראשון 17:00/);

  assert.match(await groups.getGroupsManagerLink("0500000001"), /^https:\/\/bot\.example\.com\/g\/[2-9a-km-np-zA-HJ-NP-Z]{12}$/);
});
