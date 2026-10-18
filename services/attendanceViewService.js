const crypto = require("crypto");

const { pool } = require("./databaseService");

const {
  getMonthlyAttendanceSummary,
  createMonthlyAttendanceFile,
} = require("./attendanceExportService");

const {
  getIsraelYearMonth,
  shiftMonth,
  parseMonthSpec,
} = require("../utils/months");

/*
 * =========================================================
 * דף נוכחות חי — בקישור סודי
 * =========================================================
 *
 * מנהל שולח לבוט "קישור נוכחות" ומקבל קישור.
 * בדף: טבלת הנוכחות של החודש, שמתעדכנת לבד כל דקה,
 * וכפתור להורדת קובץ אקסל.
 *
 * הקישור מכיל קוד סודי אקראי שנשמר במסד הנתונים.
 * "החלף קישור נוכחות" יוצר קוד חדש, והקישור הישן מפסיק לעבוד.
 */

const TOKEN_KEY = "attendance_view_token";
const REFRESH_SECONDS = 60;

/* ---------- קוד סודי ---------- */

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function getViewToken(db = pool) {
  const result = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [TOKEN_KEY]
  );

  return result.rows[0]?.value || null;
}

async function setViewToken(token, db = pool) {
  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `,
    [TOKEN_KEY, token]
  );

  return token;
}

async function getOrCreateViewToken(db = pool) {
  return (
    (await getViewToken(db)) ||
    setViewToken(generateToken(), db)
  );
}

async function rotateViewToken(db = pool) {
  return setViewToken(generateToken(), db);
}

async function isValidViewToken(token, db = pool) {
  if (!token || !/^[a-f0-9]{48}$/.test(String(token))) {
    return false;
  }

  const stored = await getViewToken(db);

  if (!stored) {
    return false;
  }

  const a = Buffer.from(String(token));
  const b = Buffer.from(stored);

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

/* ---------- כתובת הקישור ---------- */

/*
 * PUBLIC_BASE_URL אם הוגדר; אחרת הדומיין ש-Railway מגדיר אוטומטית.
 */
function getPublicBaseUrl(fallbackHost = null) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  return fallbackHost ? `https://${fallbackHost}` : null;
}

async function getViewLink(fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/attendance/${await getOrCreateViewToken()}`;
}

/* ---------- בחירת חודש ---------- */

function parseMonthQuery(value, now = new Date()) {
  if (!value) {
    return getIsraelYearMonth(now);
  }

  return parseMonthSpec(String(value), now) || getIsraelYearMonth(now);
}

function monthQuery({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/* ---------- HTML ---------- */

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatShortDate(dateString) {
  const [, month, day] = dateString.split("-");

  return `${day}/${month}`;
}

function percentCell(value) {
  if (value === null || value === undefined) {
    return `<td class="num muted">–</td>`;
  }

  const level =
    value >= 80 ? "good" : value >= 60 ? "mid" : "low";

  return `<td class="num"><span class="pct ${level}">${value}%</span></td>`;
}

function formatUpdatedAt(now = new Date()) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

const PAGE_STYLE = `
  :root {
    --bg: #f4f7f5; --card: #ffffff; --text: #1f2933; --muted: #6b7a87;
    --border: #dfe7e2; --brand: #0b5d3b; --brand-soft: #e5f1ea;
    --present: #e3f4e8; --present-text: #17663a;
    --absent: #fbe4e4; --absent-text: #a61b1b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 "Segoe UI", Arial, sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 16px; }
  header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: 22px; color: var(--brand); }
  .updated { color: var(--muted); font-size: 13px; }
  .nav { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0 16px; }
  .nav a, .btn {
    display: inline-block; padding: 8px 14px; border-radius: 8px; text-decoration: none;
    border: 1px solid var(--border); background: var(--card); color: var(--text); font-weight: 600;
  }
  .btn.primary { background: var(--brand); color: #fff; border-color: var(--brand); }
  .month { font-size: 18px; font-weight: 700; padding: 0 6px; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px; margin-bottom: 16px;
  }
  h2 { margin: 0 0 10px; font-size: 17px; color: var(--brand); }
  .branch { color: var(--muted); font-size: 13px; font-weight: 400; margin-right: 6px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-bottom: 1px solid var(--border); padding: 7px 8px; text-align: right; white-space: nowrap; }
  th { background: var(--brand-soft); font-weight: 700; position: sticky; top: 0; }
  td.name, th.name { position: sticky; right: 0; background: var(--card); z-index: 1; }
  th.name { background: var(--brand-soft); z-index: 2; }
  td.num, th.num { text-align: center; }
  td.p { background: var(--present); color: var(--present-text); text-align: center; font-weight: 700; }
  td.a { background: var(--absent); color: var(--absent-text); text-align: center; font-weight: 700; }
  td.e { text-align: center; color: var(--muted); }
  .muted { color: var(--muted); }
  .pct { padding: 2px 8px; border-radius: 10px; font-weight: 700; }
  .pct.good { background: var(--present); color: var(--present-text); }
  .pct.mid { background: #fff4d6; color: #8a5a00; }
  .pct.low { background: var(--absent); color: var(--absent-text); }
  .empty { text-align: center; padding: 40px 16px; color: var(--muted); font-size: 16px; }
  .day { display: block; font-size: 11px; color: var(--muted); font-weight: 400; }
  footer { color: var(--muted); font-size: 12px; text-align: center; margin: 20px 0 8px; }
  @media (max-width: 600px) {
    .hide-mobile { display: none; }
    .wrap { padding: 12px; }
    th, td { padding: 6px 6px; }
  }
`;

const DAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function dayLetter(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return DAY_SHORT[
    new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  ];
}

function renderGroup(group) {
  const header = [
    `<th class="name">מתאמן</th>`,
    ...group.dates.map(
      (date) =>
        `<th class="num">${formatShortDate(date)}<span class="day">${dayLetter(date)}׳</span></th>`
    ),
    `<th class="num">הגיע</th>`,
    `<th class="num">%</th>`,
  ].join("");

  const rows = group.trainees
    .map((trainee) => {
      const cells = group.dates
        .map((date) => {
          const status = trainee.byDate.get(date);

          if (status === "present") {
            return `<td class="p">✔</td>`;
          }

          if (status === "absent") {
            return `<td class="a">✘</td>`;
          }

          return `<td class="e">·</td>`;
        })
        .join("");

      return `<tr><td class="name">${escapeHtml(trainee.name)}</td>${cells}<td class="num">${trainee.present}/${trainee.present + trainee.absent}</td>${percentCell(trainee.percent)}</tr>`;
    })
    .join("");

  return `
    <section class="card">
      <h2>${escapeHtml(group.name)}<span class="branch">${escapeHtml(group.branch)}</span></h2>
      <div class="scroll"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
}

function renderAttendancePage({
  summary,
  monthLabel,
  yearMonth,
  token,
  now = new Date(),
}) {
  const previous = monthQuery(shiftMonth(yearMonth, -1));
  const next = monthQuery(shiftMonth(yearMonth, 1));
  const current = monthQuery(yearMonth);
  const base = `/attendance/${token}`;

  const summaryRows = summary.groups
    .map(
      (group) =>
        `<tr><td>${escapeHtml(group.name)}</td><td class="muted hide-mobile">${escapeHtml(group.branch)}</td><td class="num">${group.sessionCount}</td><td class="num">${group.trainees.length}</td>${percentCell(group.percent)}</tr>`
    )
    .join("");

  const reportRows = [...summary.sessions]
    .reverse()
    .map(
      (session) =>
        `<tr><td>${formatShortDate(session.date)} <span class="muted">${escapeHtml(session.day)}</span></td><td>${escapeHtml(session.groupName)}</td><td>${escapeHtml(session.reportedBy)}</td><td class="muted hide-mobile">${escapeHtml(session.reportedAt)}</td><td class="num">${session.present}/${session.total}</td></tr>`
    )
    .join("");

  const body =
    summary.sessions.length === 0
      ? `<div class="card empty">עדיין אין דיווחי נוכחות ב${escapeHtml(monthLabel)}.<br>הדף יתעדכן לבד כשיגיע הדיווח הראשון.</div>`
      : `
    <section class="card">
      <h2>סיכום לפי קבוצה</h2>
      <div class="scroll"><table>
        <thead><tr><th>קבוצה</th><th class="hide-mobile">סניף</th><th class="num">מפגשים</th><th class="num">מתאמנים</th><th class="num">נוכחות</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table></div>
    </section>
    ${summary.groups.map(renderGroup).join("")}
    <section class="card">
      <h2>דיווחי מדריכים</h2>
      <div class="scroll"><table>
        <thead><tr><th>תאריך</th><th>קבוצה</th><th>דווח על ידי</th><th class="hide-mobile">זמן הדיווח</th><th class="num">הגיעו</th></tr></thead>
        <tbody>${reportRows}</tbody>
      </table></div>
    </section>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>נוכחות – ${escapeHtml(monthLabel)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>📋 נוכחות האקדמיה לטניס</h1>
    <span class="updated">עודכן ב-${formatUpdatedAt(now)} · מתעדכן לבד כל דקה</span>
  </header>
  <nav class="nav">
    <a href="${base}?month=${previous}">→ חודש קודם</a>
    <span class="month">${escapeHtml(monthLabel)}</span>
    <a href="${base}?month=${next}">חודש הבא ←</a>
    <a class="btn primary" href="${base}/excel?month=${current}">⬇ הורד אקסל</a>
  </nav>
  ${body}
  <footer>הקישור הזה פרטי — אין להעביר אותו מחוץ לצוות האקדמיה.</footer>
</div>
</body>
</html>`;
}

/* ---------- בקשות HTTP ---------- */

function setPrivateHeaders(res) {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

async function handleAttendancePage(req, res) {
  setPrivateHeaders(res);

  if (!(await isValidViewToken(req.params.token))) {
    res.status(404).send("Not found");
    return;
  }

  const yearMonth = parseMonthQuery(req.query?.month);

  const { summary, monthLabel } =
    await getMonthlyAttendanceSummary(yearMonth);

  res
    .status(200)
    .type("html")
    .send(
      renderAttendancePage({
        summary,
        monthLabel,
        yearMonth,
        token: req.params.token,
      })
    );
}

async function handleAttendanceExcel(req, res) {
  setPrivateHeaders(res);

  if (!(await isValidViewToken(req.params.token))) {
    res.status(404).send("Not found");
    return;
  }

  const yearMonth = parseMonthQuery(req.query?.month);
  const file = await createMonthlyAttendanceFile(yearMonth);

  if (file.empty) {
    res
      .status(200)
      .type("html")
      .send(
        `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font-family:Arial;padding:24px">אין דיווחי נוכחות ב${escapeHtml(file.monthLabel)}. <a href="/attendance/${req.params.token}?month=${monthQuery(yearMonth)}">חזרה</a></body></html>`
      );
    return;
  }

  res
    .status(200)
    .set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    })
    .send(file.buffer);
}

module.exports = {
  REFRESH_SECONDS,
  getOrCreateViewToken,
  rotateViewToken,
  isValidViewToken,
  getPublicBaseUrl,
  getViewLink,
  parseMonthQuery,
  renderAttendancePage,
  escapeHtml,
  handleAttendancePage,
  handleAttendanceExcel,
};
