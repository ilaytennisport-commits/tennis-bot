/*
 * הטבלה של מיכל — תחומי עבודה וזמנים (pg-mem: Postgres בזיכרון).
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

const work = require("../services/workloadService");

let token;

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    json: null,
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

function jsonRes() {
  const res = fakeRes();

  res.json = function (value) {
    this.data = value;
    return this;
  };

  return res;
}

async function call(handler, { id, body = {}, useToken = token } = {}) {
  const res = jsonRes();

  await handler({ params: { token: useToken, id }, query: {}, body }, res);

  return res;
}

test.before(async () => {
  await pool.query(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`
  );
  await work.createWorkloadTable(pool);

  token = await work.getOrCreateWorkloadToken(pool);
});

test("קישור קצר וקבוע, וקוד שגוי לא נכנס", async () => {
  assert.match(token, /^[2-9a-km-np-zA-HJ-NP-Z]{12}$/);
  assert.equal(await work.getOrCreateWorkloadToken(pool), token);
  assert.match(await work.getWorkloadLink(), /^https:\/\/bot\.example\.com\/w\/[2-9a-km-np-zA-HJ-NP-Z]{12}$/);

  const res = await call(work.handlePage, { useToken: "abcdefghijkm" });

  assert.equal(res.statusCode, 404);
});

test("פתיחה ראשונה: שבעת התחומים, בלי מספרים", async () => {
  const res = await call(work.handlePage);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.match(res.body, /תחומי העבודה של מיכל/);
  assert.match(res.body, /Grow ומורנינג/);
  assert.match(res.body, /שיווק בפייסבוק/);

  const areas = await work.listAreas(pool);

  assert.equal(areas.length, 7);
  assert.ok(areas.every((a) => a.minutesDay === 0 && a.minutesMonth === 0));
});

test("דקות ביום × 26 = דקות בחודש, ודקות בחודש ÷ 26 = דקות ביום", async () => {
  const [first] = await work.listAreas(pool);

  let res = await call(work.handleUpdate, {
    id: first.id,
    body: { field: "minutesDay", value: "15" },
  });

  assert.equal(res.data.area.minutesDay, 15);
  assert.equal(res.data.area.minutesMonth, 390);

  res = await call(work.handleUpdate, {
    id: first.id,
    body: { field: "minutesMonth", value: 100 },
  });

  assert.equal(res.data.area.minutesMonth, 100);
  assert.equal(res.data.area.minutesDay, 3.8);

  /* ערך לא תקין → 0 */
  res = await call(work.handleUpdate, {
    id: first.id,
    body: { field: "minutesDay", value: "-5" },
  });

  assert.equal(res.data.area.minutesDay, 0);
  assert.equal(res.data.area.minutesMonth, 0);
});

test("הערות, שם ותיאור נשמרים; שם ריק ושדה לא מוכר נדחים", async () => {
  const [first] = await work.listAreas(pool);

  await call(work.handleUpdate, {
    id: first.id,
    body: { field: "notes", value: "נשלח לעמותה עד ה-5 <b>" },
  });
  await call(work.handleUpdate, {
    id: first.id,
    body: { field: "title", value: "חשבוניות" },
  });

  let res = await call(work.handleUpdate, {
    id: first.id,
    body: { field: "title", value: "   " },
  });
  assert.equal(res.statusCode, 400);

  res = await call(work.handleUpdate, {
    id: first.id,
    body: { field: "id", value: "1" },
  });
  assert.equal(res.statusCode, 400);

  const [saved] = await work.listAreas(pool);

  assert.equal(saved.title, "חשבוניות");
  assert.equal(saved.notes, "נשלח לעמותה עד ה-5 <b>");

  const page = await call(work.handlePage);

  assert.match(page.body, /נשלח לעמותה עד ה-5 &lt;b&gt;/);
});

test("הוספה ומחיקה; תחום שנמחק לא חוזר בפתיחה הבאה", async () => {
  let res = await call(work.handleAdd);

  assert.equal(res.data.area.title, "תחום חדש");
  assert.match(res.data.html, /data-id="\d+"/);
  assert.equal((await work.listAreas(pool)).length, 8);

  const [first] = await work.listAreas(pool);

  res = await call(work.handleDelete, { id: first.id });
  assert.equal(res.data.ok, true);

  await call(work.handlePage);

  const titles = (await work.listAreas(pool)).map((a) => a.title);

  assert.equal(titles.length, 7);
  assert.ok(!titles.includes("חשבוניות"));
});

test("החלפת קישור: הישן מפסיק לעבוד", async () => {
  const fresh = await work.rotateWorkloadToken(pool);

  assert.equal(await work.isValidWorkloadToken(token, pool), false);
  assert.equal(await work.isValidWorkloadToken(fresh, pool), true);

  token = fresh;
});
