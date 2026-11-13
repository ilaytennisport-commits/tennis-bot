const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  resolveStaffByToken,
  getOrCreateStaffToken,
} = require("./coachReportService");

const { getWeek } = require("./groupsManagerService");

const { getPublicBaseUrl } = require("./attendanceViewService");

/*
 * =========================================================
 * לוח מגרשים — גלי הדר
 * =========================================================
 *
 * מנהל שולח "לוח מגרשים" ומקבל קישור אישי. בכל יום רואים 3 מגרשים:
 * איזו קבוצה באיזו שעה, מי מאמן, מי המתאמנים, ואיזה מגרש מושכר.
 * הקבוצות, המאמנים ורשימות הילדים מגיעים מהבוט; אפשר גם לכתוב חופשי.
 */

const BRANCH = "גלי הדר – ראשון לציון";
const COURTS = 3;
const VIA_OPTIONS = ["פרטי", "MOVE", "FreeFit", "עמית", "שיקומי"];
const MAX_TEXT = 80;
const MAX_PLAYERS = 40;

const SCRIPT_VERSION = crypto
  .createHash("sha1")
  .update(fs.readFileSync(path.join(__dirname, "..", "public", "courts.js")))
  .digest("hex")
  .slice(0, 10);

const TEMPLATE = fs
  .readFileSync(path.join(__dirname, "..", "views", "courtsBoard.html"), "utf8")
  .replace("__SCRIPT_VERSION__", SCRIPT_VERSION);

/* =========================================================
 * מסד נתונים
 * ========================================================= */

async function createCourtsTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS court_slots (
      id BIGSERIAL PRIMARY KEY,
      slot_date TEXT NOT NULL,
      court INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      coach TEXT,
      via TEXT,
      players TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function toSlot(row) {
  let players = [];

  try {
    players = JSON.parse(row.players || "[]");
  } catch {
    players = [];
  }

  return {
    id: String(row.id),
    date: row.slot_date,
    court: Number(row.court),
    from: row.start_time,
    to: row.end_time,
    kind: row.kind,
    title: row.title,
    coach: row.coach || "",
    via: row.via || "",
    players: Array.isArray(players) ? players : [],
  };
}

async function listSlots(fromDate, toDate, db = pool) {
  const result = await db.query(
    `
      SELECT * FROM court_slots
      WHERE slot_date >= $1 AND slot_date <= $2
      ORDER BY slot_date, court, start_time
    `,
    [fromDate, toDate]
  );

  return result.rows.map(toSlot);
}

/* =========================================================
 * בדיקת שינוי שמגיע מהדף
 * ========================================================= */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(value, max = MAX_TEXT) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanSlot(body = {}) {
  const date = String(body.date || "");
  const court = Number(body.court);
  const from = String(body.from || "");
  const to = String(body.to || "");
  const kind = body.kind === "rent" ? "rent" : body.kind === "group" ? "group" : null;
  const title = clean(body.title);

  if (
    !DATE_RE.test(date) ||
    !Number.isInteger(court) ||
    court < 1 ||
    court > COURTS ||
    !TIME_RE.test(from) ||
    !TIME_RE.test(to) ||
    to <= from ||
    !kind ||
    !title
  ) {
    return null;
  }

  const players = Array.isArray(body.players)
    ? [...new Set(body.players.map((p) => clean(p)).filter(Boolean))].slice(0, MAX_PLAYERS)
    : [];

  return {
    date,
    court,
    from,
    to,
    kind,
    title,
    coach: kind === "group" ? clean(body.coach) : "",
    via: kind === "rent" ? (VIA_OPTIONS.includes(body.via) ? body.via : "פרטי") : "",
    players: kind === "group" ? players : [],
  };
}

async function saveSlot({ id, slot, updatedBy }, db = pool) {
  const params = [
    slot.date,
    slot.court,
    slot.from,
    slot.to,
    slot.kind,
    slot.title,
    slot.coach || null,
    slot.via || null,
    JSON.stringify(slot.players),
    updatedBy || null,
  ];

  const result = id
    ? await db.query(
        `
          UPDATE court_slots
          SET slot_date = $1, court = $2, start_time = $3, end_time = $4, kind = $5,
              title = $6, coach = $7, via = $8, players = $9, updated_by = $10, updated_at = NOW()
          WHERE id = $11
          RETURNING *
        `,
        [...params, id]
      )
    : await db.query(
        `
          INSERT INTO court_slots
            (slot_date, court, start_time, end_time, kind, title, coach, via, players, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        params
      );

  return result.rows[0] ? toSlot(result.rows[0]) : null;
}

async function deleteSlot(id, db = pool) {
  const result = await db.query(`DELETE FROM court_slots WHERE id = $1`, [id]);

  return result.rowCount > 0;
}

/* =========================================================
 * שבוע: ראשון עד שישי
 * ========================================================= */

function shift(dateString, days) {
  const [y, m, d] = dateString.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function weekdayIndex(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); /* 0 = ראשון */
}

/*
 * תאריכי השבוע. בשבת מציגים את השבוע הבא.
 */
function getWeekDates(requested, today = attendance.getIsraelDateString(0)) {
  let anchor = DATE_RE.test(String(requested || "")) ? requested : today;

  if (weekdayIndex(anchor) === 6) {
    anchor = shift(anchor, 1);
  }

  const sunday = shift(anchor, -weekdayIndex(anchor));

  return Array.from({ length: 6 }, (_, i) => shift(sunday, i));
}

/*
 * מעתיק את משבצות השבוע הקודם לשבוע הזה, בלי לדרוס משבצת קיימת
 * באותו יום, מגרש ושעת התחלה.
 */
async function copyPreviousWeek(weekStart, updatedBy, db = pool) {
  const week = getWeekDates(weekStart);
  const previous = await listSlots(shift(week[0], -7), shift(week[5], -7), db);
  const current = await listSlots(week[0], week[5], db);
  const taken = new Set(current.map((s) => `${s.date}|${s.court}|${s.from}`));
  let copied = 0;

  for (const slot of previous) {
    const date = shift(slot.date, 7);
    const key = `${date}|${slot.court}|${slot.from}`;

    if (taken.has(key)) {
      continue;
    }

    taken.add(key);
    await saveSlot({ slot: { ...slot, date }, updatedBy }, db);
    copied += 1;
  }

  return { copied, slots: await listSlots(week[0], week[5], db) };
}

/* =========================================================
 * הקבוצות והמאמנים מהבוט
 * ========================================================= */

/*
 * לכל תאריך בשבוע: הקבוצות של גלי הדר באותו יום, עם רשימת הילדים.
 */
async function getGroupsForWeek(week) {
  const branch = (await getWeek()).find((b) => b.name === BRANCH);
  const byDay = {};

  week.forEach((date) => {
    const dayOfWeek = weekdayIndex(date) + 1;
    const seen = new Set();

    byDay[date] = (branch?.sessions || [])
      .filter((s) => s.day === dayOfWeek)
      .map((s) => ({ label: s.label, time: s.time, members: s.members }))
      .filter((g) => {
        if (seen.has(g.label)) return false;
        seen.add(g.label);
        return true;
      });
  });

  return byDay;
}

function getCoachNames() {
  return [
    ...new Set(
      attendance
        .getCoachPhones()
        .map((phone) => attendance.getStaffName(phone))
        .filter((name) => name && name !== "מאמן")
    ),
  ].sort((a, b) => a.localeCompare(b, "he"));
}

/* =========================================================
 * הקישור והדף
 * ========================================================= */

async function getCourtsBoardLink(phone, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  return baseUrl ? `${baseUrl}/m/${await getOrCreateStaffToken(phone)}` : null;
}

function renderPage({ week, dayIndex, slots, groups, coaches }) {
  const data = JSON.stringify({ week, dayIndex, slots, groups, coaches }).replace(
    /</g,
    "\\u003c"
  );

  return TEMPLATE.replace("__DATA_JSON__", () => data);
}

function setPrivateHeaders(res) {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

async function withManager(req, res) {
  setPrivateHeaders(res);

  const staff = await resolveStaffByToken(req.params.token);

  if (!staff || !staff.isManager) {
    res.status(404).send("Not found");
    return null;
  }

  return staff;
}

async function handlePage(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  const today = attendance.getIsraelDateString(0);
  const week = getWeekDates(req.query?.w, today);
  const todayIndex = week.indexOf(today);

  res.status(200).type("html").send(
    renderPage({
      week,
      dayIndex: todayIndex >= 0 ? todayIndex : 0,
      slots: await listSlots(week[0], week[5]),
      groups: await getGroupsForWeek(week),
      coaches: getCoachNames(),
    })
  );
}

async function handleSave(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  const slot = cleanSlot(req.body);
  const id = req.body?.id ? String(req.body.id) : null;

  if (!slot || (id && !/^\d{1,18}$/.test(id))) {
    res.status(400).json({ ok: false });
    return;
  }

  const saved = await saveSlot({ id, slot, updatedBy: staff.name });

  if (!saved) {
    res.status(404).json({ ok: false });
    return;
  }

  res.json({ ok: true, slot: saved });
}

async function handleDelete(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  const id = String(req.params.id || "");

  res.json({ ok: /^\d{1,18}$/.test(id) ? await deleteSlot(id) : false });
}

async function handleCopy(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  res.json({ ok: true, ...(await copyPreviousWeek(req.body?.weekStart, staff.name)) });
}

module.exports = {
  createCourtsTable,
  cleanSlot,
  saveSlot,
  deleteSlot,
  listSlots,
  getWeekDates,
  copyPreviousWeek,
  getCourtsBoardLink,
  renderPage,
  handlePage,
  handleSave,
  handleDelete,
  handleCopy,
};
