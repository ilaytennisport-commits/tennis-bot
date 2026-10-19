const crypto = require("crypto");
const axios = require("axios");

const { pool } = require("./databaseService");

const core = require("./leagueCore");

/*
 * =========================================================
 * ליגת טניס — מסד נתונים
 * =========================================================
 *
 * עונה (league) → דרגות (division) → בתים (group) → משחקים.
 * שחקן שייך לעונה אחת, לדרגה אחת ולבית אחד.
 * שחקנים מתחברים עם טלפון + סיסמה שהם בוחרים בכניסה הראשונה.
 */

const ADMIN_TOKEN_KEY = "league_admin_token";
const SESSION_DAYS = 365;

/* =========================================================
 * טבלאות
 * ========================================================= */

async function createLeagueTables(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS leagues (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      season TEXT,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      points_win INTEGER NOT NULL DEFAULT 3,
      points_loss INTEGER NOT NULL DEFAULT 1,
      points_walkover INTEGER NOT NULL DEFAULT 0,
      rules_url TEXT,
      info TEXT,
      sheet_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_divisions (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      level_key TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 50,
      score_format TEXT NOT NULL DEFAULT 'stb',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (league_id, level_key)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_groups (
      id SERIAL PRIMARY KEY,
      division_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_players (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      division_id INTEGER,
      group_id INTEGER,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT,
      club TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (league_id, phone)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_matches (
      id SERIAL PRIMARY KEY,
      division_id INTEGER NOT NULL,
      group_id INTEGER,
      stage TEXT NOT NULL,
      round INTEGER NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      player_a INTEGER,
      player_b INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      sets TEXT,
      walkover_winner INTEGER,
      winner_id INTEGER,
      played_on TEXT,
      scheduled_on TEXT,
      scheduled_time TEXT,
      court TEXT,
      reported_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_sessions (
      token_hash TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS league_log (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      match_id INTEGER,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/* =========================================================
 * קישור ניהול סודי
 * ========================================================= */

async function getAdminToken(db = pool) {
  const result = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [ADMIN_TOKEN_KEY]);

  return result.rows[0]?.value || null;
}

async function setAdminToken(token, db = pool) {
  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [ADMIN_TOKEN_KEY, token]
  );

  return token;
}

async function getOrCreateAdminToken(db = pool) {
  return (await getAdminToken(db)) || setAdminToken(crypto.randomBytes(24).toString("hex"), db);
}

async function rotateAdminToken(db = pool) {
  return setAdminToken(crypto.randomBytes(24).toString("hex"), db);
}

async function isValidAdminToken(token, db = pool) {
  if (!token || !/^[a-f0-9]{48}$/.test(String(token))) {
    return false;
  }

  const stored = await getAdminToken(db);

  return Boolean(
    stored &&
      stored.length === String(token).length &&
      crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(String(token)))
  );
}

/* =========================================================
 * יומן שינויים
 * ========================================================= */

async function addLog(leagueId, matchId, actor, action, details = "") {
  await pool.query(
    `INSERT INTO league_log (league_id, match_id, actor, action, details) VALUES ($1, $2, $3, $4, $5)`,
    [leagueId, matchId, actor, action, details]
  );
}

async function getLog(leagueId, limit = 200) {
  const result = await pool.query(
    `SELECT * FROM league_log WHERE league_id = $1 ORDER BY id DESC LIMIT $2`,
    [leagueId, limit]
  );

  return result.rows;
}

/* =========================================================
 * עונות
 * ========================================================= */

async function getLeague(id) {
  const result = await pool.query(`SELECT * FROM leagues WHERE id = $1`, [Number(id) || 0]);

  return result.rows[0] || null;
}

async function getActiveLeague() {
  const result = await pool.query(`SELECT * FROM leagues WHERE active = TRUE ORDER BY id DESC LIMIT 1`);

  return result.rows[0] || null;
}

async function listLeagues() {
  const result = await pool.query(`SELECT * FROM leagues ORDER BY id DESC`);

  return result.rows;
}

async function createLeague({ name, season }) {
  const hasActive = Boolean(await getActiveLeague());
  const result = await pool.query(
    `INSERT INTO leagues (name, season, active) VALUES ($1, $2, $3) RETURNING id`,
    [String(name).trim(), String(season || "").trim(), !hasActive]
  );

  return result.rows[0].id;
}

async function setActiveLeague(id) {
  await pool.query(`UPDATE leagues SET active = FALSE WHERE active = TRUE`);
  await pool.query(`UPDATE leagues SET active = TRUE WHERE id = $1`, [id]);
}

async function updateLeague(id, fields) {
  const league = await getLeague(id);

  if (!league) {
    return;
  }

  const next = { ...league, ...fields };
  const points = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : fallback;
  };

  await pool.query(
    `
      UPDATE leagues SET
        name = $2, season = $3, points_win = $4, points_loss = $5,
        points_walkover = $6, rules_url = $7, info = $8, sheet_url = $9
      WHERE id = $1
    `,
    [
      id,
      String(next.name || league.name).trim(),
      String(next.season || "").trim(),
      points(next.points_win, league.points_win),
      points(next.points_loss, league.points_loss),
      points(next.points_walkover, league.points_walkover),
      String(next.rules_url || "").trim() || null,
      String(next.info || "").trim() || null,
      String(next.sheet_url || "").trim() || null,
    ]
  );
}

function leaguePoints(league) {
  return {
    win: league.points_win,
    loss: league.points_loss,
    walkover: league.points_walkover,
  };
}

/* =========================================================
 * דרגות
 * ========================================================= */

async function getDivisions(leagueId) {
  const result = await pool.query(
    `SELECT * FROM league_divisions WHERE league_id = $1 ORDER BY sort_order, id`,
    [leagueId]
  );

  return result.rows;
}

async function getDivision(id) {
  const result = await pool.query(`SELECT * FROM league_divisions WHERE id = $1`, [Number(id) || 0]);

  return result.rows[0] || null;
}

async function ensureDivision(leagueId, level) {
  const existing = await pool.query(
    `SELECT id FROM league_divisions WHERE league_id = $1 AND level_key = $2`,
    [leagueId, level.key]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO league_divisions (league_id, name, level_key, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
    [leagueId, level.name, level.key, level.order]
  );

  return result.rows[0].id;
}

async function createDivision(leagueId, name) {
  const level = core.mapLevel(name) || { key: name, name, order: 50 };

  return ensureDivision(leagueId, level);
}

async function updateDivision(id, { name, scoreFormat }) {
  const division = await getDivision(id);

  if (!division) {
    return;
  }

  await pool.query(`UPDATE league_divisions SET name = $2, score_format = $3 WHERE id = $1`, [
    id,
    String(name || division.name).trim(),
    scoreFormat === "full" ? "full" : "stb",
  ]);
}

/* =========================================================
 * שחקנים
 * ========================================================= */

async function getPlayers(leagueId) {
  const result = await pool.query(
    `SELECT * FROM league_players WHERE league_id = $1 ORDER BY full_name, id`,
    [leagueId]
  );

  return result.rows;
}

async function getPlayer(id) {
  const result = await pool.query(`SELECT * FROM league_players WHERE id = $1`, [Number(id) || 0]);

  return result.rows[0] || null;
}

async function findPlayerByPhone(leagueId, phone) {
  const result = await pool.query(
    `SELECT * FROM league_players WHERE league_id = $1 AND phone = $2`,
    [leagueId, core.normalizePhone(phone)]
  );

  return result.rows[0] || null;
}

async function addPlayer(leagueId, { fullName, phone, divisionId, city, club }) {
  const name = String(fullName || "").replace(/\s+/g, " ").trim();
  const normalized = core.normalizePhone(phone);

  if (!name) {
    return { ok: false, error: "חסר שם." };
  }

  if (!core.isValidPhone(normalized)) {
    return { ok: false, error: "מספר הטלפון לא תקין." };
  }

  if (await findPlayerByPhone(leagueId, normalized)) {
    return { ok: false, error: "כבר יש שחקן עם הטלפון הזה." };
  }

  const result = await pool.query(
    `
      INSERT INTO league_players (league_id, division_id, full_name, phone, city, club)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `,
    [leagueId, Number(divisionId) || null, name, normalized, city || null, club || null]
  );

  return { ok: true, id: result.rows[0].id };
}

async function playerHasMatches(playerId) {
  const result = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM league_matches WHERE player_a = $1 OR player_b = $1`,
    [playerId]
  );

  return Number(result.rows[0].n) > 0;
}

/*
 * עדכון שחקן. מעבר דרגה מותר רק לפני שנקבעו לו משחקים.
 */
async function updatePlayer(id, { fullName, phone, divisionId, groupId }) {
  const player = await getPlayer(id);

  if (!player) {
    return { ok: false, error: "השחקן לא נמצא." };
  }

  const name = String(fullName ?? player.full_name).replace(/\s+/g, " ").trim();
  const normalized = core.normalizePhone(phone ?? player.phone);

  if (!name) {
    return { ok: false, error: "חסר שם." };
  }

  if (!core.isValidPhone(normalized)) {
    return { ok: false, error: "מספר הטלפון לא תקין." };
  }

  const other = await findPlayerByPhone(player.league_id, normalized);

  if (other && other.id !== player.id) {
    return { ok: false, error: `הטלפון כבר שייך ל${other.full_name}.` };
  }

  let nextDivision = divisionId === undefined ? player.division_id : Number(divisionId) || null;
  let nextGroup = groupId === undefined ? player.group_id : Number(groupId) || null;

  if (nextDivision !== player.division_id) {
    if (await playerHasMatches(player.id)) {
      return { ok: false, error: "לשחקן כבר יש משחקים בדרגה הנוכחית, אז אי אפשר להעביר אותו." };
    }

    nextGroup = null;
  }

  await pool.query(
    `UPDATE league_players SET full_name = $2, phone = $3, division_id = $4, group_id = $5 WHERE id = $1`,
    [id, name, normalized, nextDivision, nextGroup]
  );

  return { ok: true };
}

async function deletePlayer(id) {
  if (await playerHasMatches(id)) {
    return { ok: false, error: "לשחקן יש משחקים. אפשר לתת ליריבים ניצחון טכני במקום למחוק." };
  }

  await pool.query(`DELETE FROM league_sessions WHERE player_id = $1`, [id]);
  await pool.query(`DELETE FROM league_players WHERE id = $1`, [id]);

  return { ok: true };
}

/*
 * ייבוא מטופס ההרשמה. שחקן קיים (לפי טלפון) מתעדכן בשם/עיר/מועדון,
 * והדרגה שלו נשארת כמו שהמנהל קבע.
 */
async function importRegistrations(leagueId, registrations) {
  const summary = { added: 0, updated: 0, skipped: [] };

  for (const reg of registrations) {
    if (!reg.fullName && !reg.phone) {
      continue;
    }

    if (!reg.fullName || !core.isValidPhone(reg.phone)) {
      summary.skipped.push(reg.fullName || reg.phone || "שורה ללא שם");
      continue;
    }

    const existing = await findPlayerByPhone(leagueId, reg.phone);

    if (existing) {
      await pool.query(
        `UPDATE league_players SET full_name = $2, city = $3, club = $4 WHERE id = $1`,
        [existing.id, reg.fullName, reg.city || existing.city, reg.club || existing.club]
      );

      if (!existing.division_id && reg.level) {
        await pool.query(`UPDATE league_players SET division_id = $2 WHERE id = $1`, [
          existing.id,
          await ensureDivision(leagueId, reg.level),
        ]);
      }

      summary.updated += 1;
      continue;
    }

    const divisionId = reg.level ? await ensureDivision(leagueId, reg.level) : null;

    await pool.query(
      `
        INSERT INTO league_players (league_id, division_id, full_name, phone, city, club)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [leagueId, divisionId, reg.fullName, reg.phone, reg.city || null, reg.club || null]
    );

    summary.added += 1;
  }

  return summary;
}

async function importFromSheet(leagueId, url, fetchCsv = defaultFetchCsv) {
  const csvUrl = core.sheetCsvUrl(url);

  if (!csvUrl) {
    return { ok: false, error: "זה לא נראה כמו קישור ל-Google Sheets." };
  }

  let text;

  try {
    text = await fetchCsv(csvUrl);
  } catch (error) {
    return {
      ok: false,
      error: "לא הצלחתי לפתוח את הגיליון. ודאו שבשיתוף מוגדר \"כל מי שיש לו את הקישור – צופה\".",
    };
  }

  if (/^\s*</.test(text)) {
    return {
      ok: false,
      error: "הגיליון לא פתוח לצפייה. בשיתוף בחרו \"כל מי שיש לו את הקישור – צופה\".",
    };
  }

  const { players, missing } = core.readRegistrations(core.parseCsv(text));

  if (missing.length) {
    return { ok: false, error: `לא מצאתי בגיליון עמודה של: ${missing.join(", ")}.` };
  }

  await updateLeague(leagueId, { sheet_url: url });

  return { ok: true, ...(await importRegistrations(leagueId, players)) };
}

async function defaultFetchCsv(url) {
  const response = await axios.get(url, {
    responseType: "text",
    timeout: 15000,
    maxRedirects: 5,
    transformResponse: (data) => data,
  });

  return String(response.data);
}

/* =========================================================
 * בתים ומשחקי בתים
 * ========================================================= */

const GROUP_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"];

async function getGroups(divisionId) {
  const result = await pool.query(
    `SELECT * FROM league_groups WHERE division_id = $1 ORDER BY sort_order, id`,
    [divisionId]
  );

  return result.rows;
}

async function countPlayedMatches(divisionId, stage) {
  const result = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM league_matches WHERE division_id = $1 AND stage = $2 AND status = 'done'`,
    [divisionId, stage]
  );

  return Number(result.rows[0].n);
}

async function getDivisionPlayers(divisionId) {
  const result = await pool.query(
    `SELECT * FROM league_players WHERE division_id = $1 ORDER BY id`,
    [divisionId]
  );

  return result.rows;
}

/*
 * בונה בתים מחדש ומפזר את השחקנים:
 * "snake" — לפי סדר ההרשמה בשיטת נחש, "random" — הגרלה.
 */
async function createGroups(divisionId, count, method = "snake") {
  const groupCount = Math.max(1, Math.min(8, Number(count) || 1));

  if (await countPlayedMatches(divisionId, "group")) {
    return { ok: false, error: "כבר יש תוצאות בשלב הבתים. אי אפשר לבנות את הבתים מחדש." };
  }

  await pool.query(`DELETE FROM league_matches WHERE division_id = $1`, [divisionId]);
  await pool.query(`DELETE FROM league_groups WHERE division_id = $1`, [divisionId]);

  const groupIds = [];

  for (let i = 0; i < groupCount; i += 1) {
    const result = await pool.query(
      `INSERT INTO league_groups (division_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [divisionId, groupCount === 1 ? "בית" : `בית ${GROUP_LETTERS[i]}׳`, i]
    );

    groupIds.push(result.rows[0].id);
  }

  const players = await getDivisionPlayers(divisionId);

  if (method === "random") {
    for (let i = players.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [players[i], players[j]] = [players[j], players[i]];
    }
  }

  for (let i = 0; i < players.length; i += 1) {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    const index = method === "snake" && row % 2 === 1 ? groupCount - 1 - col : col;

    await pool.query(`UPDATE league_players SET group_id = $2 WHERE id = $1`, [players[i].id, groupIds[index]]);
  }

  return { ok: true };
}

/*
 * יוצר את כל משחקי הבתים (כל אחד נגד כל אחד).
 */
async function generateGroupMatches(divisionId) {
  if (await countPlayedMatches(divisionId, "group")) {
    return { ok: false, error: "כבר יש תוצאות בשלב הבתים. אי אפשר ליצור את המשחקים מחדש." };
  }

  const groups = await getGroups(divisionId);

  if (!groups.length) {
    return { ok: false, error: "קודם צריך לבנות בתים." };
  }

  await pool.query(`DELETE FROM league_matches WHERE division_id = $1 AND stage = 'group'`, [divisionId]);

  const players = await getDivisionPlayers(divisionId);
  let created = 0;

  for (const group of groups) {
    const ids = players.filter((p) => p.group_id === group.id).map((p) => p.id);

    for (const [roundIndex, pairs] of core.roundRobin(ids).entries()) {
      for (const [slot, [a, b]] of pairs.entries()) {
        await pool.query(
          `
            INSERT INTO league_matches (division_id, group_id, stage, round, slot, player_a, player_b)
            VALUES ($1, $2, 'group', $3, $4, $5, $6)
          `,
          [divisionId, group.id, roundIndex + 1, slot, a, b]
        );

        created += 1;
      }
    }
  }

  return { ok: true, created };
}

/* =========================================================
 * משחקים
 * ========================================================= */

function rowToMatch(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    sets: row.sets ? JSON.parse(row.sets) : [],
  };
}

async function getMatch(id) {
  const result = await pool.query(`SELECT * FROM league_matches WHERE id = $1`, [Number(id) || 0]);

  return rowToMatch(result.rows[0]);
}

async function getDivisionMatches(divisionId) {
  const result = await pool.query(
    `SELECT * FROM league_matches WHERE division_id = $1 ORDER BY stage, round, slot, id`,
    [divisionId]
  );

  return result.rows.map(rowToMatch);
}

async function getPlayerMatches(playerId) {
  const result = await pool.query(
    `SELECT * FROM league_matches WHERE player_a = $1 OR player_b = $1 ORDER BY round, id`,
    [playerId]
  );

  return result.rows.map(rowToMatch);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/*
 * שמירת תוצאה.
 * input: { sets: [[a,b],...] } או { walkover: "a" | "b" }, ו-playedOn.
 */
async function saveResult(matchId, input, actor) {
  const match = await getMatch(matchId);

  if (!match) {
    return { ok: false, error: "המשחק לא נמצא." };
  }

  if (!match.player_a || !match.player_b) {
    return { ok: false, error: "עדיין לא ידוע מי משחק במשחק הזה." };
  }

  const playedOn = input.playedOn || israelToday();

  if (!isValidDate(playedOn)) {
    return { ok: false, error: "התאריך לא תקין." };
  }

  const tomorrow = new Date(Date.now() + 864e5);

  if (playedOn > israelToday(tomorrow)) {
    return { ok: false, error: "אי אפשר לדווח על משחק שעוד לא התקיים." };
  }

  const division = await getDivision(match.division_id);
  let sets = null;
  let walkoverWinner = null;
  let winnerId;

  if (input.walkover === "a" || input.walkover === "b") {
    walkoverWinner = input.walkover === "a" ? match.player_a : match.player_b;
    winnerId = walkoverWinner;
  } else {
    const checked = core.validateSets(input.sets || [], division.score_format);

    if (!checked.ok) {
      return checked;
    }

    sets = checked.sets;
    winnerId = checked.winner === "a" ? match.player_a : match.player_b;
  }

  await pool.query(
    `
      UPDATE league_matches SET
        status = 'done', sets = $2, walkover_winner = $3, winner_id = $4,
        played_on = $5, reported_by = $6, updated_at = NOW()
      WHERE id = $1
    `,
    [match.id, sets ? JSON.stringify(sets) : null, walkoverWinner, winnerId, playedOn, actor.label]
  );

  const names = await playerNames([match.player_a, match.player_b]);
  const winnerName = names[winnerId];
  const loserName = names[winnerId === match.player_a ? match.player_b : match.player_a];
  const score = sets ? core.formatScore(sets, winnerId === match.player_a ? "a" : "b") : "ניצחון טכני";

  await addLog(
    division.league_id,
    match.id,
    actor.label,
    match.status === "done" ? "עדכון תוצאה" : "דיווח תוצאה",
    `${winnerName} ניצח את ${loserName} ${score}`
  );

  if (match.stage !== "group") {
    await syncKnockout(match.division_id);
  }

  return { ok: true };
}

async function clearResult(matchId, actor) {
  const match = await getMatch(matchId);

  if (!match || match.status !== "done") {
    return { ok: false, error: "אין תוצאה למחוק." };
  }

  await pool.query(
    `
      UPDATE league_matches SET status = 'pending', sets = NULL, walkover_winner = NULL,
        winner_id = NULL, played_on = NULL, reported_by = NULL, updated_at = NOW()
      WHERE id = $1
    `,
    [match.id]
  );

  const division = await getDivision(match.division_id);
  const names = await playerNames([match.player_a, match.player_b]);

  await addLog(division.league_id, match.id, actor.label, "מחיקת תוצאה", `${names[match.player_a]} נגד ${names[match.player_b]}`);

  if (match.stage !== "group") {
    await syncKnockout(match.division_id);
  }

  return { ok: true };
}

async function updateSchedule(matchId, { scheduledOn, scheduledTime, court }) {
  const date = String(scheduledOn || "").trim();
  const time = String(scheduledTime || "").trim();

  if (date && !isValidDate(date)) {
    return { ok: false, error: "התאריך לא תקין." };
  }

  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { ok: false, error: "השעה לא תקינה (למשל 18:30)." };
  }

  await pool.query(
    `UPDATE league_matches SET scheduled_on = $2, scheduled_time = $3, court = $4, updated_at = NOW() WHERE id = $1`,
    [matchId, date || null, time || null, String(court || "").trim() || null]
  );

  return { ok: true };
}

async function playerNames(ids) {
  const clean = ids.filter(Boolean);

  if (!clean.length) {
    return {};
  }

  const placeholders = clean.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(`SELECT id, full_name FROM league_players WHERE id IN (${placeholders})`, clean);

  return Object.fromEntries(result.rows.map((row) => [row.id, row.full_name]));
}

/* =========================================================
 * נוקאאוט
 * ========================================================= */

async function groupStandings(divisionId, league) {
  const groups = await getGroups(divisionId);
  const players = await getDivisionPlayers(divisionId);
  const matches = (await getDivisionMatches(divisionId)).filter((m) => m.stage === "group");

  return groups.map((group) => ({
    group,
    standings: core.computeStandings(
      players.filter((p) => p.group_id === group.id),
      matches.filter((m) => m.group_id === group.id),
      leaguePoints(league)
    ),
  }));
}

/*
 * יוצר עץ נוקאאוט לפי הטבלאות הנוכחיות.
 */
async function generateKnockout(divisionId, qualifiers, thirdPlace = true) {
  const division = await getDivision(divisionId);
  const league = await getLeague(division.league_id);
  const perGroup = Math.max(1, Math.min(16, Number(qualifiers) || 0));

  if (await countPlayedMatches(divisionId, "ko")) {
    return { ok: false, error: "כבר יש תוצאות בנוקאאוט. מחקו אותן קודם." };
  }

  const tables = await groupStandings(divisionId, league);
  const pairs = core.seedKnockout(
    tables.map((t) => t.standings.map((row) => row.player.id)),
    perGroup
  );

  if (pairs.length < 1) {
    return { ok: false, error: "אין מספיק שחקנים לנוקאאוט." };
  }

  await pool.query(`DELETE FROM league_matches WHERE division_id = $1 AND stage IN ('ko', 'third')`, [divisionId]);

  const rounds = Math.log2(pairs.length * 2);

  for (const [slot, [a, b]] of pairs.entries()) {
    const bye = !a || !b;

    await pool.query(
      `
        INSERT INTO league_matches (division_id, stage, round, slot, player_a, player_b, status, winner_id)
        VALUES ($1, 'ko', 1, $2, $3, $4, $5, $6)
      `,
      [divisionId, slot, a, b, bye ? "bye" : "pending", bye ? a || b : null]
    );
  }

  for (let round = 2; round <= rounds; round += 1) {
    const slots = 2 ** (rounds - round);

    for (let slot = 0; slot < slots; slot += 1) {
      await pool.query(
        `INSERT INTO league_matches (division_id, stage, round, slot) VALUES ($1, 'ko', $2, $3)`,
        [divisionId, round, slot]
      );
    }
  }

  if (thirdPlace && rounds >= 2) {
    await pool.query(
      `INSERT INTO league_matches (division_id, stage, round, slot) VALUES ($1, 'third', $2, 0)`,
      [divisionId, rounds]
    );
  }

  await syncKnockout(divisionId);
  await addLog(league.id, null, "מנהל", "יצירת נוקאאוט", `${division.name}: ${perGroup} עולים מכל בית`);

  return { ok: true };
}

async function deleteKnockout(divisionId) {
  await pool.query(`DELETE FROM league_matches WHERE division_id = $1 AND stage IN ('ko', 'third')`, [divisionId]);
}

function loserOf(match) {
  if (!match || match.status !== "done" || !match.winner_id) {
    return null;
  }

  return match.winner_id === match.player_a ? match.player_b : match.player_a;
}

/*
 * מעביר מנצחים לשלב הבא. אם מנצח השתנה אחרי תיקון תוצאה,
 * התוצאה במשחק ההמשך נמחקת (כי השחקנים בו השתנו).
 */
async function syncKnockout(divisionId) {
  const matches = (await getDivisionMatches(divisionId)).filter((m) => m.stage !== "group");
  const ko = matches.filter((m) => m.stage === "ko");
  const at = (round, slot) => ko.find((m) => m.round === round && m.slot === slot);
  const lastRound = Math.max(0, ...ko.map((m) => m.round));

  const assign = async (match, a, b) => {
    if (match.player_a === a && match.player_b === b) {
      return;
    }

    match.player_a = a;
    match.player_b = b;
    match.status = "pending";
    match.winner_id = null;

    await pool.query(
      `
        UPDATE league_matches SET player_a = $2, player_b = $3, status = 'pending', sets = NULL,
          walkover_winner = NULL, winner_id = NULL, played_on = NULL, reported_by = NULL, updated_at = NOW()
        WHERE id = $1
      `,
      [match.id, a, b]
    );
  };

  for (let round = 2; round <= lastRound; round += 1) {
    for (const match of ko.filter((m) => m.round === round)) {
      const first = at(round - 1, match.slot * 2);
      const second = at(round - 1, match.slot * 2 + 1);

      await assign(match, first?.winner_id || null, second?.winner_id || null);
    }
  }

  const third = matches.find((m) => m.stage === "third");

  if (third && lastRound >= 2) {
    await assign(third, loserOf(at(lastRound - 1, 0)), loserOf(at(lastRound - 1, 1)));
  }
}

/* =========================================================
 * כל נתוני הדרגה לתצוגה
 * ========================================================= */

async function loadDivision(division, league) {
  const players = await getDivisionPlayers(division.id);
  const groups = await getGroups(division.id);
  const matches = await getDivisionMatches(division.id);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const points = leaguePoints(league);

  const groupViews = groups.map((group) => {
    const groupPlayers = players.filter((p) => p.group_id === group.id);
    const groupMatches = matches.filter((m) => m.stage === "group" && m.group_id === group.id);

    return {
      group,
      players: groupPlayers,
      matches: groupMatches,
      standings: core.computeStandings(groupPlayers, groupMatches, points),
    };
  });

  const ko = matches.filter((m) => m.stage === "ko");
  const koRounds = [];

  for (const match of ko) {
    (koRounds[match.round - 1] = koRounds[match.round - 1] || []).push(match);
  }

  return {
    division,
    players,
    byId,
    groups: groupViews,
    unassigned: players.filter((p) => !p.group_id),
    matches,
    koRounds,
    third: matches.find((m) => m.stage === "third") || null,
  };
}

/* =========================================================
 * התחברות שחקנים
 * ========================================================= */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");

  if (kind !== "scrypt" || !salt || !hash) {
    return false;
  }

  const actual = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function setPassword(playerId, password) {
  await pool.query(`UPDATE league_players SET password_hash = $2 WHERE id = $1`, [playerId, hashPassword(password)]);
  await pool.query(`DELETE FROM league_sessions WHERE player_id = $1`, [playerId]);
}

async function resetPassword(playerId) {
  await pool.query(`UPDATE league_players SET password_hash = NULL WHERE id = $1`, [playerId]);
  await pool.query(`DELETE FROM league_sessions WHERE player_id = $1`, [playerId]);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createSession(playerId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);

  await pool.query(
    `INSERT INTO league_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), playerId, expires.toISOString()]
  );

  return token;
}

async function getSessionPlayer(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) {
    return null;
  }

  const result = await pool.query(
    `SELECT player_id, expires_at FROM league_sessions WHERE token_hash = $1`,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  return getPlayer(row.player_id);
}

async function deleteSession(token) {
  if (token) {
    await pool.query(`DELETE FROM league_sessions WHERE token_hash = $1`, [hashToken(token)]);
  }
}

module.exports = {
  createLeagueTables,
  getOrCreateAdminToken,
  rotateAdminToken,
  isValidAdminToken,
  addLog,
  getLog,
  getLeague,
  getActiveLeague,
  listLeagues,
  createLeague,
  setActiveLeague,
  updateLeague,
  leaguePoints,
  getDivisions,
  getDivision,
  createDivision,
  updateDivision,
  getPlayers,
  getPlayer,
  findPlayerByPhone,
  addPlayer,
  updatePlayer,
  deletePlayer,
  importRegistrations,
  importFromSheet,
  getGroups,
  createGroups,
  generateGroupMatches,
  getMatch,
  getDivisionMatches,
  getPlayerMatches,
  saveResult,
  clearResult,
  updateSchedule,
  generateKnockout,
  deleteKnockout,
  syncKnockout,
  loadDivision,
  israelToday,
  hashPassword,
  verifyPassword,
  setPassword,
  resetPassword,
  createSession,
  getSessionPlayer,
  deleteSession,
};
