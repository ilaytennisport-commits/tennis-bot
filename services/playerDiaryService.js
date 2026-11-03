const fs = require("fs");
const path = require("path");

const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  generateShortToken,
  isLinkToken,
  sameToken,
} = require("../utils/linkToken");

const {
  getPublicBaseUrl,
  escapeHtml,
} = require("./attendanceViewService");

/*
 * =========================================================
 * יומן אימון של שחקן
 * =========================================================
 *
 * לכל שחקן קישור קבוע (מנהל שולח לבוט "אדל" או "יומן אדל").
 * אחרי כל אימון השחקן מדרג 9 סעיפים מ-1 (הכי טוב) עד 5,
 * ורואה סיכום לפי תקופה או לפי תאריך.
 */

const ITEM_KEYS = ["fh", "bh", "fw", "mt", "vo", "sv", "rt", "tb", "ro"];
const MAX_NOTE = 1000;
const MAX_NAME = 60;
const HISTORY_DAYS = 400;

const TEMPLATE = fs.readFileSync(
  path.join(__dirname, "..", "views", "playerDiary.html"),
  "utf8"
);

/* =========================================================
 * מסד נתונים
 * ========================================================= */

async function createDiaryTables(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_diaries (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS diary_entries (
      diary_id BIGINT NOT NULL,
      entry_date TEXT NOT NULL,
      ratings TEXT NOT NULL,
      note TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (diary_id, entry_date)
    )
  `);
}

function cleanName(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s'׳"״\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function normalize(value) {
  return cleanName(value).replace(/['׳"״\-]/g, "").toLowerCase();
}

async function listDiaries(db = pool) {
  return (
    await db.query(`SELECT id, name, token FROM player_diaries ORDER BY name`)
  ).rows;
}

/*
 * יומן לפי שם: שם מלא, או שם פרטי כשיש רק יומן אחד כזה.
 */
async function findDiaryByName(name, db = pool) {
  const wanted = normalize(name);

  if (!wanted) {
    return null;
  }

  const diaries = await listDiaries(db);

  const exact = diaries.find((diary) => normalize(diary.name) === wanted);

  if (exact) {
    return exact;
  }

  const byFirst = diaries.filter(
    (diary) => normalize(diary.name).split(" ")[0] === wanted
  );

  return byFirst.length === 1 ? byFirst[0] : null;
}

async function getOrCreateDiary(name, db = pool) {
  const existing = await findDiaryByName(name, db);

  if (existing) {
    return { diary: existing, created: false };
  }

  const clean = cleanName(name);

  if (!clean) {
    return { diary: null, created: false };
  }

  const diary = (
    await db.query(
      `INSERT INTO player_diaries (name, token) VALUES ($1, $2) RETURNING id, name, token`,
      [clean, generateShortToken()]
    )
  ).rows[0];

  return { diary, created: true };
}

async function rotateDiaryToken(diaryId, db = pool) {
  const token = generateShortToken();

  await db.query(`UPDATE player_diaries SET token = $2 WHERE id = $1`, [
    diaryId,
    token,
  ]);

  return token;
}

async function getDiaryByToken(token, db = pool) {
  if (!isLinkToken(token)) {
    return null;
  }

  const row = (
    await db.query(
      `SELECT id, name, token FROM player_diaries WHERE token = $1`,
      [String(token)]
    )
  ).rows[0];

  return row && sameToken(row.token, token) ? row : null;
}

async function listEntries(diaryId, today, db = pool) {
  const from = attendance.getIsraelDateString(-HISTORY_DAYS);
  const rows = (
    await db.query(
      `
        SELECT entry_date, ratings, note
        FROM diary_entries
        WHERE diary_id = $1 AND entry_date >= $2 AND entry_date <= $3
        ORDER BY entry_date DESC
      `,
      [diaryId, from, today]
    )
  ).rows;

  return rows.map((row) => ({
    date: row.entry_date,
    ratings: safeRatings(row.ratings),
    note: row.note || "",
  }));
}

function safeRatings(text) {
  try {
    return cleanRatings(JSON.parse(text)) || {};
  } catch {
    return {};
  }
}

/*
 * כל 9 הסעיפים, כל אחד מספר שלם 1–5. אחרת null.
 */
function cleanRatings(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const ratings = {};

  for (const key of ITEM_KEYS) {
    const number = Number(value[key]);

    if (!Number.isInteger(number) || number < 1 || number > 5) {
      return null;
    }

    ratings[key] = number;
  }

  return ratings;
}

async function saveEntry({ diaryId, date, ratings, note }, db = pool) {
  const clean = cleanRatings(ratings);

  if (!clean) {
    return false;
  }

  await db.query(
    `
      INSERT INTO diary_entries (diary_id, entry_date, ratings, note, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (diary_id, entry_date)
      DO UPDATE SET ratings = EXCLUDED.ratings, note = EXCLUDED.note, updated_at = NOW()
    `,
    [
      diaryId,
      date,
      JSON.stringify(clean),
      String(note || "").trim().slice(0, MAX_NOTE) || null,
    ]
  );

  return true;
}

/* =========================================================
 * הקישור
 * ========================================================= */

function getDiaryLink(diary, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  return baseUrl ? `${baseUrl}/d/${diary.token}` : null;
}

/* =========================================================
 * הדף
 * ========================================================= */

function renderPage({ diary, entries, today }) {
  const data = JSON.stringify({
    name: diary.name,
    firstName: diary.name.split(" ")[0],
    today,
    entries,
  }).replace(/</g, "\\u003c");

  return TEMPLATE.split("__NAME_HTML__")
    .join(escapeHtml(diary.name))
    .replace("__DATA_JSON__", () => data);
}

function setPrivateHeaders(res) {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

async function handlePage(req, res) {
  setPrivateHeaders(res);

  const diary = await getDiaryByToken(req.params.token);

  if (!diary) {
    res.status(404).send("Not found");
    return;
  }

  const today = attendance.getIsraelDateString(0);

  res
    .status(200)
    .type("html")
    .send(renderPage({ diary, entries: await listEntries(diary.id, today), today }));
}

async function handleSave(req, res) {
  setPrivateHeaders(res);

  const diary = await getDiaryByToken(req.params.token);

  if (!diary) {
    res.status(404).json({ ok: false });
    return;
  }

  const saved = await saveEntry({
    diaryId: diary.id,
    date: attendance.getIsraelDateString(0),
    ratings: req.body?.ratings,
    note: req.body?.note,
  });

  if (!saved) {
    res.status(400).json({ ok: false });
    return;
  }

  res.json({ ok: true });
}

module.exports = {
  ITEM_KEYS,
  createDiaryTables,
  findDiaryByName,
  getOrCreateDiary,
  rotateDiaryToken,
  getDiaryByToken,
  listEntries,
  saveEntry,
  getDiaryLink,
  renderPage,
  handlePage,
  handleSave,
};
