/*
 * לוח מגרשים (pg-mem: Postgres בזיכרון, נתונים בדויים).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { newDb } = require("pg-mem");

const ROOT = path.resolve(__dirname, "..");

Object.assign(process.env, {
  DATABASE_URL: "postgres://mem",
  OPENAI_API_KEY: "test",
  WHAPI_TOKEN: "test",
  MANAGER_PHONES: "0500000001",
  COACH_PHONES: "0500000002,0500000004,0500000001",
  STAFF_NAMES: "0500000001:אור,0500000002:אבי,0500000004:נובל",
  RAILWAY_PUBLIC_DOMAIN: "bot.example.com",
});

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

const courts = require("../services/courtsBoardService");
const coach = require("../services/coachReportService");
const attendance = require("../services/attendanceService");

const GALI = "גלי הדר – ראשון לציון";
let managerToken;
let coachToken;

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

const call = async (handler, req) => {
  const r = res();
  await handler({ params: { token: managerToken }, query: {}, body: {}, ...req }, r);
  return r;
};

test.before(async () => {
  await pool.query(`
    CREATE TABLE training_groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, branch TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trainees (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, name TEXT NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(group_id, name));
    CREATE TABLE trainee_training_slots (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT, day_of_week INTEGER NOT NULL, start_time TIME NOT NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(trainee_name, branch, day_of_week, start_time, group_label));
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_token TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  await attendance.createStaffCoachesTable(pool);
  await attendance.createDayExclusionsTable(pool);
  await courts.createCourtsTable(pool);

  const reserve = (
    await pool.query(
      `INSERT INTO training_groups (name, branch) VALUES ('א+ד 17:00 + ג 18:00 – עתודה', $1) RETURNING id`,
      [GALI]
    )
  ).rows[0].id;

  for (const name of ["ילד א", "ילד ב"]) {
    await pool.query(`INSERT INTO trainees (group_id, name) VALUES ($1, $2)`, [reserve, name]);
  }

  await pool.query(
    `INSERT INTO trainee_training_slots (trainee_name, branch, group_label, day_of_week, start_time) VALUES ('ילדה ג', $1, 'צעירה', 3, '16:30')`,
    [GALI]
  );

  managerToken = await coach.getOrCreateStaffToken("0500000001", pool);
  coachToken = await coach.getOrCreateStaffToken("0500000002", pool);
});

test("שבוע: ראשון עד שישי; בשבת מוצג השבוע הבא", () => {
  assert.deepEqual(courts.getWeekDates("2026-11-11"), [
    "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
  ]);
  assert.equal(courts.getWeekDates("2026-11-14")[0], "2026-11-15");
  assert.equal(courts.getWeekDates("bad", "2026-11-10")[0], "2026-11-08");
});

test("בדיקת משבצת: שעות, מגרש, שם — ושדות לפי סוג", () => {
  const ok = courts.cleanSlot({
    date: "2026-11-10", court: 2, from: "16:30", to: "18:00", kind: "group",
    title: " נבחרת  צעירה ", coach: "נובל", via: "MOVE", players: ["א", "א", " ב "],
  });

  assert.equal(ok.title, "נבחרת צעירה");
  assert.equal(ok.via, "");
  assert.deepEqual(ok.players, ["א", "ב"]);

  const rent = courts.cleanSlot({ date: "2026-11-10", court: 3, from: "08:00", to: "09:00", kind: "rent", title: "דנה", via: "משהו", coach: "x", players: ["y"] });

  assert.equal(rent.via, "פרטי");
  assert.equal(rent.coach, "");
  assert.deepEqual(rent.players, []);

  for (const bad of [
    { court: 4 }, { from: "18:00", to: "17:00" }, { title: "  " }, { date: "10/11/2026" }, { kind: "other" }, { from: "25:00" },
  ]) {
    assert.equal(
      courts.cleanSlot({ date: "2026-11-10", court: 1, from: "16:00", to: "17:00", kind: "group", title: "x", ...bad }),
      null,
      JSON.stringify(bad)
    );
  }
});

test("הדף: רק מנהל; קבוצות היום מהבוט עם הילדים, ומאמנים", async () => {
  const denied = res();

  await courts.handlePage({ params: { token: coachToken }, query: {} }, denied);
  assert.equal(denied.statusCode, 404);

  const page = await call(courts.handlePage, { query: { w: "2026-11-10" } });

  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["Cache-Control"], "no-store");
  assert.match(page.body, /<script src="\/courts\.js\?v=[a-f0-9]{10}"><\/script>/);

  const data = JSON.parse(page.body.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);

  assert.equal(data.week[0], "2026-11-08");
  /* אור לא ברשימה, אשר כן */
  assert.deepEqual(data.coaches, ["אבי", "אשר", "נובל"]);

  const tuesday = data.groups["2026-11-10"].map((g) => g.label).sort();

  assert.deepEqual(tuesday, ["נבחרת צעירה", "עתודה"]);
  assert.deepEqual(
    data.groups["2026-11-10"].find((g) => g.label === "עתודה").members,
    ["ילד א", "ילד ב"]
  );
  assert.deepEqual(data.groups["2026-11-08"].map((g) => g.label), ["עתודה"]);
});

test("שמירה, עדכון ומחיקה של משבצת", async () => {
  let r = await call(courts.handleSave, {
    body: { date: "2026-11-10", court: 1, from: "16:30", to: "18:00", kind: "group", title: "נבחרת צעירה", coach: "נובל", players: ["ילדה ג"] },
  });

  assert.equal(r.data.ok, true);

  const id = r.data.slot.id;

  r = await call(courts.handleSave, {
    body: { id, date: "2026-11-10", court: 1, from: "16:30", to: "18:00", kind: "group", title: "נבחרת צעירה", coach: "יוני (חיצוני)", players: [] },
  });
  assert.equal(r.data.slot.coach, "יוני (חיצוני)");

  r = await call(courts.handleSave, { body: { date: "2026-11-10", court: 9, from: "16:30", to: "18:00", kind: "group", title: "x" } });
  assert.equal(r.statusCode, 400);

  await call(courts.handleSave, {
    body: { date: "2026-11-10", court: 3, from: "08:00", to: "09:00", kind: "rent", title: "דנה כהן", via: "MOVE" },
  });

  const slots = await courts.listSlots("2026-11-08", "2026-11-13", pool);

  assert.equal(slots.length, 2);
  assert.equal(slots.find((s) => s.kind === "rent").via, "MOVE");

  r = await call(courts.handleDelete, { params: { token: managerToken, id } });
  assert.deepEqual(r.data, { ok: true });
  assert.equal((await courts.listSlots("2026-11-08", "2026-11-13", pool)).length, 1);
});

test("העתקה מהשבוע שעבר: מעתיקה פעם אחת, בלי לדרוס", async () => {
  let r = await call(courts.handleCopy, { body: { weekStart: "2026-11-15" } });

  assert.equal(r.data.copied, 1);
  assert.equal(r.data.slots[0].date, "2026-11-17");
  assert.equal(r.data.slots[0].title, "דנה כהן");

  r = await call(courts.handleCopy, { body: { weekStart: "2026-11-15" } });
  assert.equal(r.data.copied, 0);
  assert.equal(r.data.slots.length, 1);
});

test("קוד הדף תקין", () => {
  const script = fs.readFileSync(path.join(ROOT, "public", "courts.js"), "utf8");

  assert.doesNotThrow(() => new Function(script));
});
