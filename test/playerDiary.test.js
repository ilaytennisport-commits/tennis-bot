/*
 * יומן אימון של שחקן (pg-mem: Postgres בזיכרון).
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
  MANAGER_PHONES: "0500000001,0500000003",
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

const diaryService = require("../services/playerDiaryService");
const attendance = require("../services/attendanceService");

const FULL = { fh: 2, bh: 3, fw: 2, mt: 1, vo: 3, sv: 2, rt: 4, tb: 3, ro: 1, pt: 2 };

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

let diary;

test.before(async () => {
  await diaryService.createDiaryTables(pool);
});

test("פתיחת יומן: קישור קצר וקבוע, ומציאה לפי שם מלא או שם פרטי", async () => {
  const first = await diaryService.getOrCreateDiary("אדל שלומון", pool);

  assert.equal(first.created, true);
  assert.match(first.diary.token, /^[2-9a-km-np-zA-HJ-NP-Z]{12}$/);

  diary = first.diary;

  const again = await diaryService.getOrCreateDiary("אדל שלומון", pool);

  assert.equal(again.created, false);
  assert.equal(again.diary.token, diary.token);
  assert.equal((await diaryService.findDiaryByName("אדל", pool)).id, diary.id);
  assert.equal(await diaryService.findDiaryByName("נועה", pool), null);
  assert.equal(
    diaryService.getDiaryLink(diary),
    `https://bot.example.com/d/${diary.token}`
  );
});

test("שמירה: רק 9 דירוגים מלאים מ-1 עד 5; שמירה חוזרת באותו יום מעדכנת", async () => {
  const today = attendance.getIsraelDateString(0);

  assert.equal(await diaryService.saveEntry({ diaryId: diary.id, date: today, ratings: { ...FULL, ro: 6 } }, pool), false);
  assert.equal(await diaryService.saveEntry({ diaryId: diary.id, date: today, ratings: { fh: 1 } }, pool), false);

  assert.equal(
    await diaryService.saveEntry({ diaryId: diary.id, date: today, ratings: FULL, note: "הסרב נכנס" }, pool),
    true
  );
  await diaryService.saveEntry({ diaryId: diary.id, date: today, ratings: { ...FULL, bh: 1 }, note: "" }, pool);

  const entries = await diaryService.listEntries(diary.id, today, pool);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].ratings.bh, 1);
  assert.equal(entries[0].note, "");
});

test("הדף: שם השחקן, הנתונים, ולא מריץ קוד שהוזן", async () => {
  const today = attendance.getIsraelDateString(0);

  await diaryService.saveEntry(
    { diaryId: diary.id, date: today, ratings: FULL, note: "</script><script>alert(1)</script>" },
    pool
  );

  const page = res();

  await diaryService.handlePage({ params: { token: diary.token } }, page);

  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["Cache-Control"], "no-store");
  assert.match(page.body, /<title>יומן אימון – אדל שלומון<\/title>/);
  assert.match(page.body, /<script src="\/diary\.js\?v=[a-f0-9]{10}"><\/script>/);
  assert.doesNotMatch(page.body, /<\/script><script>alert/);

  const data = JSON.parse(page.body.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);

  assert.equal(data.firstName, "אדל");
  assert.equal(data.today, today);
  assert.equal(data.entries[0].ratings.rt, 4);

  const missing = res();

  await diaryService.handlePage({ params: { token: "abcdefghijkm" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("שמירה מהדף, וקוד הדף תקין", async () => {
  const ok = res();

  sent.length = 0;
  await diaryService.handleSave({ params: { token: diary.token }, body: { ratings: FULL, note: "יופי" } }, ok);
  assert.deepEqual(ok.data, { ok: true });

  /* שני המנהלים מקבלים התראה קצרה עם קישור, בלי הדירוגים */
  assert.equal(sent.length, 2);
  assert.match(sent[0].body, /^📒 הדירוג היומי של אדל שלומון עודכן\n\nhttps:\/\/bot\.example\.com\/d\/[2-9a-km-np-zA-HJ-NP-Z]{12}$/);
  assert.doesNotMatch(sent[0].body, /פורהאנד|יופי/);

  const bad = res();

  sent.length = 0;
  await diaryService.handleSave({ params: { token: diary.token }, body: { ratings: { fh: 2 } } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(sent.length, 0);

  const script = fs.readFileSync(path.join(ROOT, "public", "diary.js"), "utf8");

  assert.doesNotThrow(() => new Function(script));
});

test("החלפת קישור: הישן מפסיק לעבוד", async () => {
  const fresh = await diaryService.rotateDiaryToken(diary.id, pool);

  assert.equal(await diaryService.getDiaryByToken(diary.token, pool), null);
  assert.equal((await diaryService.getDiaryByToken(fresh, pool)).name, "אדל שלומון");
});

test("סעיף 10 (תחרויות נקודות): חובה בשמירה חדשה, ודירוג ישן בלי הסעיף עדיין מוצג", async () => {
  const { ro, pt, ...nine } = FULL;
  const old = (await diaryService.getOrCreateDiary("נועה כהן", pool)).diary;

  assert.equal(await diaryService.saveEntry({ diaryId: old.id, date: "2026-11-01", ratings: { ...nine, ro } }, pool), false);

  /* דירוג ישן מלפני שנוסף הסעיף, שנשמר ישירות במסד הנתונים */
  await pool.query(
    `INSERT INTO diary_entries (diary_id, entry_date, ratings) VALUES ($1, '2026-11-01', $2)`,
    [old.id, JSON.stringify({ ...nine, ro })]
  );

  const [entry] = await diaryService.listEntries(old.id, "2026-11-03", pool);

  assert.equal(entry.ratings.fh, 2);
  assert.equal(entry.ratings.ro, 1);
  assert.equal(entry.ratings.pt, undefined);
});
