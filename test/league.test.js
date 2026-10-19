/*
 * ליגת טניס — חישובים, וזרימה מלאה מול השרת עם SQL אמיתי
 * (pg-mem: Postgres בזיכרון, נתונים בדויים).
 *
 * מייבאים נרשמים → בונים בתים ומשחקים → שחקן נכנס בפעם הראשונה,
 * בוחר סיסמה ומדווח תוצאה → הטבלה מתעדכנת → נוקאאוט.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const http = require("http");
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

const express = require("express");
const core = require("../services/leagueCore");
const league = require("../services/leagueService");
const leagueRouter = require("../routes/league");

/* =========================================================
 * חישובים
 * ========================================================= */

test("תוצאה: מערכות תקינות, סופר טייברייק ושגיאות ברורות", () => {
  assert.deepEqual(core.validateSets([["6", "3"], ["6", "4"]]), { ok: true, sets: [[6, 3], [6, 4]], winner: "a" });
  assert.equal(core.validateSets([[3, 6], [7, 6], [8, 10]]).winner, "b");
  assert.equal(core.validateSets([[6, 3], [4, 6], [12, 10]]).ok, true);

  assert.match(core.validateSets([[6, 3], [4, 6]]).error, /1:1.*סופר טייברייק/);
  assert.match(core.validateSets([[6, 3], [6, 4], [10, 2]]).error, /הוכרע/);
  assert.match(core.validateSets([[6, 5], [6, 4]]).error, /מערכה 1/);
  assert.match(core.validateSets([[6, 3], [6, ""]]).error, /חסרה תוצאה/);
  assert.match(core.validateSets([[6, 3], [4, 6], [10, 9]]).error, /סופר טייברייק/);
  assert.match(core.validateSets([[6, 3]]).error, /שתי מערכות/);

  assert.equal(core.validateSets([[6, 3], [4, 6], [7, 5]], "full").winner, "a");
});

test("טבלה: ניקוד 3/1/0, ובשוויון של שניים המפגש ביניהם קובע", () => {
  const players = [1, 2, 3].map((id) => ({ id, full_name: `שחקן ${id}` }));
  const m = (id, a, b, winner, sets, walkover = null) => ({
    id,
    player_a: a,
    player_b: b,
    winner_id: winner,
    sets,
    walkover_winner: walkover,
  });

  const rows = core.computeStandings(players, [
    m(1, 1, 2, 2, [[4, 6], [4, 6]]),
    m(2, 1, 3, 1, [[6, 0], [6, 0]]),
    m(3, 2, 3, 3, [], 3),
  ]);

  // 1: ניצחון+הפסד = 4. 2: ניצחון + הפסד טכני = 3. 3: הפסד + ניצחון טכני = 4.
  // 1 ו-3 בשוויון של 4 — 1 ניצח את 3 במפגש ביניהם.
  assert.deepEqual(rows.map((r) => [r.player.id, r.points]), [[1, 4], [3, 4], [2, 3]]);
  assert.deepEqual(rows[0].form, ["l", "w"]);
});

test("מחזורים: כל אחד נגד כל אחד פעם אחת, גם במספר אי-זוגי", () => {
  for (const n of [4, 5, 9, 10]) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const pairs = core.roundRobin(ids).flat();
    const keys = new Set(pairs.map(([a, b]) => [a, b].sort().join("-")));

    assert.equal(pairs.length, (n * (n - 1)) / 2);
    assert.equal(keys.size, pairs.length);
  }
});

test("נוקאאוט: שני בתים עם 4 עולים — א1–ב4, ב2–א3, ב1–א4, א2–ב3", () => {
  const pairs = core.seedKnockout([["A1", "A2", "A3", "A4"], ["B1", "B2", "B3", "B4"]], 4);

  assert.deepEqual(pairs, [["A1", "B4"], ["B2", "A3"], ["B1", "A4"], ["A2", "B3"]]);

  // 3 עולים מבית אחד → המדורג ראשון עולה ישר
  assert.deepEqual(core.seedKnockout([["A1", "A2", "A3"]], 3), [["A1", null], ["A2", "A3"]]);
});

test("טופס הרשמה: קריאת CSV של Google Forms ודרגות", () => {
  const csv = [
    'Timestamp,שם מלא,טלפון,"רמה מועדפת(שיבוץ סופי, לפי המארגנים)",עיר מגורים,מועדון הטניס בו אני מתאמן',
    '7/10/2026,"דני, הבודק",052-111-2222,ליגת על,שוהם,-',
    "7/10/2026,רונית בדיקה,+972 52 333 4444,ב,חולון,",
    "7/10/2026,בלי טלפון,,א,,",
  ].join("\r\n");

  const { players, missing } = core.readRegistrations(core.parseCsv(csv));

  assert.deepEqual(missing, []);
  assert.equal(players[0].fullName, "דני, הבודק");
  assert.equal(players[0].phone, "0521112222");
  assert.equal(players[0].level.name, "ליגת על");
  assert.equal(players[0].club, "");
  assert.equal(players[1].phone, "0523334444");
  assert.equal(players[1].level.name, "דרגה ב׳");

  assert.equal(core.mapLevel("דרגה ג'").name, "דרגה ג׳");
  assert.equal(
    core.sheetCsvUrl("https://docs.google.com/spreadsheets/d/1VUuKwzMGFGjjF7CxZR-peXKujAJI/edit#gid=55"),
    "https://docs.google.com/spreadsheets/d/1VUuKwzMGFGjjF7CxZR-peXKujAJI/export?format=csv&gid=55"
  );
});

/* =========================================================
 * זרימה מלאה מול השרת
 * ========================================================= */

let server;
let baseUrl;
let leagueId;
let divisionId;
let adminToken;

async function request(method, url, { form, cookie } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    redirect: "manual",
    headers: {
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });

  return {
    status: response.status,
    location: response.headers.get("location"),
    setCookie: response.headers.get("set-cookie"),
    body: await response.text(),
  };
}

const PLAYERS = [
  ["אלף ראשון", "0520000001"],
  ["בית שני", "0520000002"],
  ["גימל שלישי", "0520000003"],
  ["דלת רביעי", "0520000004"],
  ["הא חמישי", "0520000005"],
  ["וו שישי", "0520000006"],
  ["זין שביעי", "0520000007"],
  ["חית שמיני", "0520000008"],
];

test.before(async () => {
  await pool.query(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await league.createLeagueTables(pool);

  const app = express();
  app.use("/league", leagueRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  adminToken = await league.getOrCreateAdminToken();
});

test.after(() => server.close());

test("לפני שנפתחה ליגה — הודעה ידידותית", async () => {
  const res = await request("GET", "/league");

  assert.equal(res.status, 404);
  assert.match(res.body, /הליגה עוד לא נפתחה/);
});

test("ניהול: קישור לא נכון נחסם, קישור נכון פותח ליגה", async () => {
  assert.equal((await request("GET", `/league/admin/${"a".repeat(48)}`)).status, 404);

  const home = await request("GET", `/league/admin/${adminToken}`);

  assert.equal(home.status, 200);
  assert.match(home.body, /פתיחת ליגה/);

  const created = await request("POST", `/league/admin/${adminToken}/league`, {
    form: { name: "ליגת בדיקה", season: "עונת 26/27" },
  });

  assert.equal(created.status, 303);

  leagueId = (await league.getActiveLeague()).id;
  assert.ok(leagueId);
});

test("ייבוא נרשמים: נוצרות דרגות, ואין כפילויות בייבוא חוזר", async () => {
  const csv = [
    "שם מלא,טלפון,רמה מועדפת",
    ...PLAYERS.map(([name, phone]) => `${name},${phone},ליגת על`),
    "שחקן ג,0529999999,ג",
  ].join("\n");

  const first = await league.importFromSheet(leagueId, "https://docs.google.com/spreadsheets/d/1VUuKwzMGFGjjF7CxZR-peXK/edit", async () => csv);

  assert.equal(first.ok, true);
  assert.equal(first.added, 9);

  const again = await league.importFromSheet(leagueId, "https://docs.google.com/spreadsheets/d/1VUuKwzMGFGjjF7CxZR-peXK/edit", async () => csv);

  assert.equal(again.added, 0);
  assert.equal(again.updated, 9);

  const divisions = await league.getDivisions(leagueId);

  assert.deepEqual(divisions.map((d) => d.name), ["ליגת על", "דרגה ג׳"]);
  divisionId = divisions[0].id;

  const closed = await league.importFromSheet(leagueId, "https://docs.google.com/spreadsheets/d/1VUuKwzMGFGjjF7CxZR-peXK/edit", async () => "<html>login</html>");

  assert.match(closed.error, /לא פתוח לצפייה/);
});

test("בניית בתים: שני בתים של 4, ו-12 משחקים", async () => {
  const res = await request("POST", `/league/admin/${adminToken}/division/${divisionId}/groups`, {
    form: { count: "2", method: "snake" },
  });

  assert.equal(res.status, 303);
  assert.match(new URL(res.location, baseUrl).searchParams.get("ok"), /נוצרו 12 משחקים/);

  const groups = await league.getGroups(divisionId);

  assert.equal(groups.length, 2);

  const page = await request("GET", `/league?d=${divisionId}`);

  assert.equal(page.status, 200);
  assert.match(page.body, /בית א׳/);
  assert.match(page.body, /אלף ראשון/);
  assert.doesNotMatch(page.body, /0520000001/, "טלפונים לא מוצגים בדף הציבורי");
});

let cookie;

test("כניסה ראשונה: טלפון → בחירת סיסמה → מחובר", async () => {
  const unknown = await request("POST", "/league/login", { form: { step: "phone", phone: "0541234567" } });

  assert.equal(unknown.status, 404);
  assert.match(unknown.body, /לא רשום בליגה/);

  const step = await request("POST", "/league/login", { form: { step: "phone", phone: "052-000-0001" } });

  assert.match(step.body, /זו הכניסה הראשונה/);

  const mismatch = await request("POST", "/league/login", {
    form: { step: "create", phone: "0520000001", password: "1234", confirm: "9999" },
  });

  assert.match(mismatch.body, /לא זהות/);

  const done = await request("POST", "/league/login", {
    form: { step: "create", phone: "0520000001", password: "1234", confirm: "1234" },
  });

  assert.equal(done.status, 303);
  assert.match(done.setCookie, /lg_s=[a-f0-9]{64}; Path=\/league; HttpOnly; SameSite=Lax/);
  cookie = done.setCookie.split(";")[0];

  const me = await request("GET", "/league/me", { cookie });

  assert.equal(me.status, 200);
  assert.match(me.body, /המשחקים שלי/);
  assert.match(me.body, /דיווח תוצאה/);
});

test("כניסה חוזרת: סיסמה שגויה נדחית, נכונה מכניסה", async () => {
  const step = await request("POST", "/league/login", { form: { step: "phone", phone: "0520000001" } });

  assert.match(step.body, /הזינו את הסיסמה/);

  const wrong = await request("POST", "/league/login", { form: { step: "password", phone: "0520000001", password: "0000" } });

  assert.equal(wrong.status, 401);

  const right = await request("POST", "/league/login", { form: { step: "password", phone: "0520000001", password: "1234" } });

  assert.equal(right.status, 303);
});

test("דיווח תוצאה: רק על משחק שלי, עם בדיקת תקינות, והטבלה מתעדכנת", async () => {
  const me = await league.findPlayerByPhone(leagueId, "0520000001");
  const matches = await league.getPlayerMatches(me.id);
  const mine = matches[0];
  const other = (await league.getDivisionMatches(divisionId)).find(
    (m) => m.player_a !== me.id && m.player_b !== me.id
  );

  const forbidden = await request("POST", `/league/match/${other.id}`, {
    cookie,
    form: { type: "sets", s0a: "6", s0b: "0", s1a: "6", s1b: "0", played_on: league.israelToday() },
  });

  assert.equal(forbidden.status, 403);

  const anonymous = await request("GET", `/league/match/${mine.id}`);

  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.location, "/league/login");

  const invalid = await request("POST", `/league/match/${mine.id}`, {
    cookie,
    form: { type: "sets", s0a: "6", s0b: "3", s1a: "4", s1b: "6", played_on: league.israelToday() },
  });

  assert.equal(invalid.status, 400);
  assert.match(invalid.body, /1:1/);
  assert.match(invalid.body, /value="4"/, "הערכים שהוזנו נשמרים בטופס");

  const iAmA = mine.player_a === me.id;
  const saved = await request("POST", `/league/match/${mine.id}`, {
    cookie,
    form: {
      type: "sets",
      s0a: iAmA ? "6" : "3",
      s0b: iAmA ? "3" : "6",
      s1a: iAmA ? "7" : "5",
      s1b: iAmA ? "5" : "7",
      played_on: league.israelToday(),
    },
  });

  assert.equal(saved.status, 303);
  assert.equal(saved.location, "/league/me?ok=saved");

  const updated = await league.getMatch(mine.id);

  assert.equal(updated.winner_id, me.id);
  assert.equal(updated.reported_by, "אלף ראשון");

  const data = await league.loadDivision(await league.getDivision(divisionId), await league.getLeague(leagueId));
  const row = data.groups.flatMap((g) => g.standings).find((r) => r.player.id === me.id);

  assert.equal(row.points, 3);
  assert.equal(row.wins, 1);

  const log = await league.getLog(leagueId);

  assert.match(log[0].details, /אלף ראשון ניצח את .+ 6-3, 7-5/);
});

test("נוקאאוט: נבנה מהטבלה, והמנצח עולה לשלב הבא", async () => {
  const res = await request("POST", `/league/admin/${adminToken}/division/${divisionId}/knockout`, {
    form: { qualifiers: "2", third: "1" },
  });

  assert.equal(res.status, 303);

  let ko = (await league.getDivisionMatches(divisionId)).filter((m) => m.stage !== "group");

  assert.equal(ko.filter((m) => m.stage === "ko" && m.round === 1).length, 2);
  assert.equal(ko.filter((m) => m.stage === "third").length, 1);

  const [semi1, semi2] = ko.filter((m) => m.round === 1 && m.stage === "ko").sort((a, b) => a.slot - b.slot);

  await league.saveResult(semi1.id, { walkover: "a" }, { label: "מנהל" });
  await league.saveResult(semi2.id, { sets: [[6, 1], [6, 1]] }, { label: "מנהל" });

  ko = (await league.getDivisionMatches(divisionId)).filter((m) => m.stage !== "group");

  const final = ko.find((m) => m.stage === "ko" && m.round === 2);
  const third = ko.find((m) => m.stage === "third");

  assert.equal(final.player_a, semi1.player_a);
  assert.equal(final.player_b, semi2.player_a);
  assert.equal(third.player_a, semi1.player_b);
  assert.equal(third.player_b, semi2.player_b);

  // תיקון תוצאה בחצי הגמר מעביר את השחקן הנכון לגמר
  await league.saveResult(semi1.id, { walkover: "b" }, { label: "מנהל" });

  const fixedFinal = (await league.getDivisionMatches(divisionId)).find((m) => m.stage === "ko" && m.round === 2);

  assert.equal(fixedFinal.player_a, semi1.player_b);

  const page = await request("GET", `/league?d=${divisionId}&tab=ko`);

  assert.match(page.body, /גמר/);
  assert.match(page.body, /מקום שלישי/);
});

test("ניהול: כל הדפים נפתחים, ואיפוס סיסמה מנתק את השחקן", async () => {
  for (const url of ["", "/players", `/division/${divisionId}`, "/log", "/preview", `/preview?d=${divisionId}&tab=matches`]) {
    const res = await request("GET", `/league/admin/${adminToken}${url}`);

    assert.equal(res.status, 200, url);
  }

  const me = await league.findPlayerByPhone(leagueId, "0520000001");
  const reset = await request("POST", `/league/admin/${adminToken}/players/${me.id}/reset`);

  assert.equal(reset.status, 303);

  const after = await request("GET", "/league/me", { cookie });

  assert.equal(after.status, 303, "החיבור הישן כבר לא עובד");
});

test("מעבר דרגה נחסם לשחקן שכבר יש לו משחקים", async () => {
  const me = await league.findPlayerByPhone(leagueId, "0520000001");
  const other = (await league.getDivisions(leagueId))[1];
  const result = await league.updatePlayer(me.id, { divisionId: other.id });

  assert.equal(result.ok, false);
  assert.match(result.error, /כבר יש משחקים/);
});

test("טופס מאתר אחר נחסם", async () => {
  const response = await fetch(`${baseUrl}/league/login`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
    body: "phone=0520000001",
  });

  assert.equal(response.status, 403);
});

test("וואטסאפ: מנהל מבקש קישור ליגה או מחליף אותו", () => {
  const { parseManagerCommand } = require("../utils/staffCommandParser");

  assert.deepEqual(parseManagerCommand("קישור ליגה"), { type: "LEAGUE_LINK" });
  assert.deepEqual(parseManagerCommand("שלח לי את הקישור לניהול הליגה"), { type: "LEAGUE_LINK" });
  assert.deepEqual(parseManagerCommand("החלף קישור ליגה"), { type: "ROTATE_LEAGUE_LINK" });
  assert.deepEqual(parseManagerCommand("קישור נוכחות"), { type: "ATTENDANCE_LINK" });
});
