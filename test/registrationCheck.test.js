/*
 * נוכחים לא רשומים — הילדים בבוט מול גיליונות ההרשמה
 * (pg-mem לנתוני הבוט, גיליון אקסל בזיכרון במקום Google).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const ExcelJS = require("exceljs");
const { newDb } = require("pg-mem");

const ROOT = path.resolve(__dirname, "..");

Object.assign(process.env, {
  DATABASE_URL: "postgres://mem",
  OPENAI_API_KEY: "test",
  WHAPI_TOKEN: "test",
  MANAGER_PHONES: "0500000001",
  COACH_PHONES: "0500000002",
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

const check = require("../services/registrationCheckService");
const coach = require("../services/coachReportService");

const GALI = "גלי הדר – ראשון לציון";

/* גיליון הרשמה בדוי: שורה מחוקה = הרשמה שבוטלה */
async function sheetBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("תגובות לטופס 1");

  sheet.addRow(["חותמת זמן", "שם מלא של הילד\\ה", "כיתה"]);

  for (const [name, struck] of rows) {
    const row = sheet.addRow(["01/09/2026", name, "ה"]);

    if (struck) {
      row.getCell(2).font = { strike: true };
    }
  }

  workbook.addWorksheet("לפי כיתה").addRow(["בלי עמודת שם"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const REGISTERED = [
  ["דני כהן"],
  ["נועם זרחי"],
  ["יונתן לוין"],
  ["מילי מועלם"],
  ["מילי אנגר"],
  ["סאני רוטשטיין", true],
  ["רותם אריאל"],
];

function fakeFetch(buffer) {
  return async () => ({
    ok: true,
    headers: { get: () => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    arrayBuffer: async () => buffer,
  });
}

test.before(async () => {
  await pool.query(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE training_groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, branch TEXT, active BOOLEAN NOT NULL DEFAULT TRUE);
    CREATE TABLE trainees (id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE);
    CREATE TABLE trainee_training_slots (id BIGSERIAL PRIMARY KEY, trainee_name TEXT NOT NULL, branch TEXT NOT NULL, group_label TEXT, day_of_week INTEGER NOT NULL, start_time TIME NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE);
    CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_token TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  await require("../services/attendanceService").createStaffCoachesTable(pool);

  await pool.query(
    `INSERT INTO training_groups (name, branch) VALUES ('א+ד 18:00 – ו+', $1)`,
    [GALI]
  );

  for (const name of ["דני כהן", "נועם מזרחי", "יונתן לוי", "יונתן לוין", "מילי", "סאני", "שירה לוי"]) {
    await pool.query(`INSERT INTO trainees (group_id, name) VALUES (1, $1)`, [name]);
  }
});

test("קישור לגיליון: מזהה את הקוד, ומתעלם מטקסט שאינו קישור", () => {
  assert.equal(
    check.extractSheetId("https://docs.google.com/spreadsheets/d/1ocUiVqgopEsIhk0OISnAa1Ze5NUj-YdJ/edit?usp=sharing"),
    "1ocUiVqgopEsIhk0OISnAa1Ze5NUj-YdJ"
  );
  assert.equal(check.extractSheetId("https://example.com/x"), null);
});

test("קריאת הגיליון: כל השמות, ושורה מחוקה מסומנת", async () => {
  const kids = await check.parseRegistrationWorkbook(await sheetBuffer(REGISTERED));

  assert.equal(kids.length, 7);
  assert.deepEqual(kids.find((k) => k.name === "סאני רוטשטיין"), {
    name: "סאני רוטשטיין",
    struck: true,
  });
  assert.equal(kids.find((k) => k.name === "דני כהן").struck, false);
});

test("השוואה: לא רשום, מחוק, שם כתוב אחרת, שם פרטי בלבד, כפילות ונרשמו-לא-בבוט", async () => {
  const registered = await check.parseRegistrationWorkbook(await sheetBuffer(REGISTERED));
  const botKids = (await check.loadBotKids(pool)).filter((k) => k.branch === GALI);
  const result = check.compareBranch(botKids, registered);

  assert.deepEqual(result.missing.map((k) => k.name), ["שירה לוי"]);
  assert.deepEqual(result.struck.map((k) => k.name), ["סאני"]);
  assert.deepEqual(
    result.spelling.map((k) => `${k.name}→${k.matches.join("/")}`).sort(),
    ["יונתן לוי→יונתן לוין", "נועם מזרחי→נועם זרחי"]
  );
  assert.deepEqual(result.ambiguous.map((k) => k.name), ["מילי"]);
  assert.deepEqual(result.duplicates, [["יונתן לוי", "יונתן לוין"]]);
  assert.deepEqual(result.notInBot, ["רותם אריאל"]);
  assert.deepEqual(result.missing[0].groups, ["א+ד 18:00 – ו+"]);
});

test("הגדרת גיליון לפי שם סניף קצר, והבדיקה המלאה + הודעת WhatsApp", async () => {
  const branch = await check.resolveBranch("גלי הדר", pool);

  assert.equal(branch, GALI);

  await check.setRegistrationSheet(branch, "SHEET123", pool);

  const report = await check.runRegistrationCheck({
    db: pool,
    fetchImpl: fakeFetch(await sheetBuffer(REGISTERED)),
  });

  const message = check.buildCheckMessage(report, "https://bot.example.com/c/abc");

  assert.match(message, /גלי הדר: 2 בבוט ולא בהרשמה — שירה לוי, סאני/);
  assert.match(message, /עוד 2 שמות שכתובים קצת אחרת/);
  assert.match(message, /1 נרשמו ולא נמצאים בבוט/);
  assert.match(message, /https:\/\/bot\.example\.com\/c\/abc/);

  const page = check.renderPage(report);

  assert.match(page, /נוכחים לא רשומים/);
  assert.match(page, /נועם מזרחי/);
  assert.match(page, /רותם אריאל/);
});

test("גיליון שלא נפתח — הודעה ברורה במקום שגיאה", async () => {
  const report = await check.runRegistrationCheck({
    db: pool,
    fetchImpl: async () => ({ ok: false, status: 401, headers: { get: () => "text/html" } }),
  });

  assert.equal(report.branches[0].error, true);
  assert.match(
    check.buildCheckMessage(report, null),
    /לא הצלחתי לקרוא את גיליון ההרשמה/
  );
});

test("הדף: רק מנהל נכנס", async () => {
  const managerToken = await coach.getOrCreateStaffToken("0500000001", pool);
  const coachToken = await coach.getOrCreateStaffToken("0500000002", pool);

  function res() {
    return {
      statusCode: 200,
      headers: {},
      body: "",
      status(code) { this.statusCode = code; return this; },
      set(values) { Object.assign(this.headers, values); return this; },
      type() { return this; },
      send(body) { this.body = String(body); return this; },
    };
  }

  const denied = res();

  await check.handleCheckPage({ params: { token: coachToken } }, denied);
  assert.equal(denied.statusCode, 404);

  assert.match(
    await check.getRegistrationCheckLink("0500000001"),
    new RegExp(`^https://bot\\.example\\.com/c/${managerToken}$`)
  );
});
