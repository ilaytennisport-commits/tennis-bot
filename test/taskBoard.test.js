/*
 * לוח המשימות של המנהלים — זרימה מלאה עם SQL אמיתי
 * (pg-mem: Postgres בזיכרון).
 *
 * פותחים קישור → מוסיפים משימה → משנים סטטוס → עורכים → מוחקים.
 * מאמן או קישור לא נכון לא נכנסים.
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

const dbPath = require.resolve(path.join(ROOT, "services/databaseService.js"));

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool, initializeDatabase: async () => {} },
};

const tasks = require("../services/taskBoardService");
const coach = require("../services/coachReportService");

let orToken;
let coachToken;

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    location: null,
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
    redirect(code, url) {
      this.statusCode = code;
      this.location = url;
      return this;
    },
  };
}

async function call(handler, { token, id, query = {}, body = {} }) {
  const res = fakeRes();

  await handler({ params: { token, id }, query, body }, res);

  return res;
}

async function rows() {
  return (await pool.query(`SELECT * FROM club_tasks ORDER BY id`)).rows;
}

test.before(async () => {
  await pool.query(
    `CREATE TABLE staff_links (phone TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW())`
  );
  await require("../services/attendanceService").createStaffCoachesTable(pool);
  await tasks.createTasksTable(pool);

  orToken = await coach.getOrCreateStaffToken("0500000001", pool);
  coachToken = await coach.getOrCreateStaffToken("0500000002", pool);
});

test("הקישור של מנהל: כתובת /tasks עם הקוד האישי", async () => {
  const link = await tasks.getTasksLink("0500000003");

  assert.match(link, /^https:\/\/bot\.example\.com\/tasks\/[a-f0-9]{48}$/);
  assert.equal(tasks.findManagerPhoneByName("אשר"), "0500000003");
  assert.equal(tasks.findManagerPhoneByName("אבי"), null);
});

test("אפשרויות שיוך: שני המנהלים + שניהם", () => {
  assert.deepEqual(tasks.getAssigneeOptions(), ["אור", "אשר", "שניהם"]);
});

test("מאמן או קוד לא נכון — לא נכנסים", async () => {
  assert.equal((await call(tasks.handleBoard, { token: coachToken })).statusCode, 404);
  assert.equal((await call(tasks.handleBoard, { token: "a".repeat(48) })).statusCode, 404);

  const res = await call(tasks.handleAdd, {
    token: coachToken,
    body: { title: "לא אמור להישמר" },
  });

  assert.equal(res.statusCode, 404);
  assert.equal((await rows()).length, 0);
});

test("דף ריק מסביר איך מוסיפים משימה", async () => {
  const res = await call(tasks.handleBoard, { token: orToken });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.match(res.body, /עוד אין משימות/);
  assert.match(res.body, /שלום אור/);
});

test("הוספה, סטטוס, עריכה ומחיקה", async () => {
  const back = `/tasks/${orToken}?s=todo`;

  let res = await call(tasks.handleAdd, {
    token: orToken,
    body: { title: "  להזמין כדורים <b>  ", note: "6 קרטונים", assignee: "אשר", back },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.location, back);

  let [task] = await rows();

  assert.equal(task.title, "להזמין כדורים <b>");
  assert.equal(task.assignee, "אשר");
  assert.equal(task.status, "todo");
  assert.equal(task.created_by, "אור");

  const id = String(task.id);

  res = await call(tasks.handleBoard, { token: orToken });
  assert.match(res.body, /להזמין כדורים &lt;b&gt;/);
  assert.match(res.body, /באחריות: אשר/);

  /* יטופל ב… בלי תאריך — שבוע מהיום */
  await call(tasks.handleStatus, { token: orToken, id, body: { status: "later" } });
  [task] = await rows();
  assert.equal(task.status, "later");
  assert.match(task.due_date, /^\d{4}-\d{2}-\d{2}$/);

  await call(tasks.handleStatus, {
    token: orToken,
    id,
    body: { status: "later", due_date: "2020-01-05" },
  });
  [task] = await rows();
  assert.equal(task.due_date, "2020-01-05");

  res = await call(tasks.handleBoard, { token: orToken });
  assert.match(res.body, /עבר התאריך/);

  await call(tasks.handleStatus, { token: orToken, id, body: { status: "done" } });
  [task] = await rows();
  assert.equal(task.status, "done");

  /* סטטוס לא חוקי לא משנה כלום */
  await call(tasks.handleStatus, { token: orToken, id, body: { status: "hacked" } });
  assert.equal((await rows())[0].status, "done");

  /* עריכה */
  res = await call(tasks.handleBoard, { token: orToken, query: { edit: id } });
  assert.match(res.body, /action="\/tasks\/[a-f0-9]{48}\/task\/\d+\/edit"/);

  await call(tasks.handleEdit, {
    token: orToken,
    id,
    body: { title: "להזמין 8 קרטונים", note: "", assignee: "שניהם" },
  });
  [task] = await rows();
  assert.equal(task.title, "להזמין 8 קרטונים");
  assert.equal(task.note, null);
  assert.equal(task.assignee, "שניהם");

  /* שם ריק לא נשמר */
  await call(tasks.handleEdit, { token: orToken, id, body: { title: "   " } });
  assert.equal((await rows())[0].title, "להזמין 8 קרטונים");

  /* סינון לפי אשר מראה גם משימות של "שניהם" */
  res = await call(tasks.handleBoard, { token: orToken, query: { w: "אשר" } });
  assert.match(res.body, /להזמין 8 קרטונים/);

  /* מחיקה: קודם שאלת אישור, ואז מחיקה */
  res = await call(tasks.handleBoard, { token: orToken, query: { del: id } });
  assert.match(res.body, /למחוק את המשימה\?/);

  res = await call(tasks.handleDelete, {
    token: orToken,
    id,
    body: { back: "https://evil.example.com" },
  });
  assert.equal(res.location, `/tasks/${orToken}`);
  assert.equal((await rows()).length, 0);
});

test("סדר: לא טופל, אחר כך מתוזמנות לפי תאריך, ובסוף טופל", async () => {
  const a = await tasks.addTask({ title: "א", assignee: "אור" }, pool);
  const b = await tasks.addTask({ title: "ב", assignee: "אור" }, pool);
  const c = await tasks.addTask({ title: "ג", assignee: "אור" }, pool);
  const d = await tasks.addTask({ title: "ד", assignee: "מישהו אחר" }, pool);

  await tasks.setTaskStatus(a, "done", null, pool);
  await tasks.setTaskStatus(b, "later", "2026-12-01", pool);
  await tasks.setTaskStatus(c, "later", "2026-11-01", pool);

  const list = await tasks.listTasks(pool);

  assert.deepEqual(list.map((t) => t.title), ["ד", "ג", "ב", "א"]);

  /* שיוך לא מוכר → המנהל הראשון */
  assert.equal(list[0].assignee, "אור");
});
