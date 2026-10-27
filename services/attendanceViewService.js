const {
  generateShortToken,
  isLinkToken,
  sameToken,
} = require("../utils/linkToken");

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
const SHORT_TOKEN_KEY = "attendance_view_short_token";
const REFRESH_SECONDS = 60;

/* ---------- קוד סודי ----------
 * הקישור נשלח עם קוד קצר. קוד ישן וארוך ממשיך לעבוד
 * עד ש"החלף קישור נוכחות" מבטל את שניהם.
 */

async function readSetting(key, db) {
  const result = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key]
  );

  return result.rows[0]?.value || null;
}

async function writeSetting(key, value, db) {
  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `,
    [key, value]
  );

  return value;
}

async function getOrCreateViewToken(db = pool) {
  return (
    (await readSetting(SHORT_TOKEN_KEY, db)) ||
    writeSetting(SHORT_TOKEN_KEY, generateShortToken(), db)
  );
}

async function rotateViewToken(db = pool) {
  const token = generateShortToken();

  await writeSetting(TOKEN_KEY, token, db);

  return writeSetting(SHORT_TOKEN_KEY, token, db);
}

async function isValidViewToken(token, db = pool) {
  if (!isLinkToken(token)) {
    return false;
  }

  return (
    sameToken(token, await readSetting(SHORT_TOKEN_KEY, db)) ||
    sameToken(token, await readSetting(TOKEN_KEY, db))
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

  return `${baseUrl}/a/${await getOrCreateViewToken()}`;
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
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 64px; height: auto; flex-shrink: 0; }
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
  .tabs { display: flex; gap: 6px; border-bottom: 2px solid var(--border); margin-top: 14px; }
  .tab { padding: 9px 18px; border-radius: 8px 8px 0 0; color: var(--muted); font-weight: 700; text-decoration: none; margin-bottom: -2px; border: 2px solid transparent; }
  .tab.on { color: var(--brand); background: var(--card); border-color: var(--border); border-bottom-color: var(--card); }
  .pick { display: flex; gap: 6px; align-items: center; margin: 0; }
  .pick input { font: inherit; padding: 7px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); }
  .pick .btn { cursor: pointer; font: inherit; font-weight: 600; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; font-size: 14px; }
  .chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--text); text-decoration: none; }
  .chip.on { background: var(--brand); border-color: var(--brand); color: #fff; }
  .day-total { font-weight: 700; margin: 0 0 12px; }
  .meta { color: var(--muted); margin: -4px 0 10px; font-size: 14px; }
  .meta b { color: var(--text); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  h3 { margin: 0 0 6px; font-size: 15px; }
  h3.ok { color: var(--present-text); }
  h3.no { color: var(--absent-text); }
  .names { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .names li { padding: 5px 10px; border-radius: 8px; }
  .names.p li { background: var(--present); }
  .names.a li { background: var(--absent); }
  .none { margin: 0; }
  @media (max-width: 600px) { .cols { grid-template-columns: 1fr; } }
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

/* ---------- תצוגה לפי יום ---------- */

const DAY_NAMES_FULL = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

function isDateString(value) {
  const text = String(value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function shiftDay(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days, 12))
    .toISOString()
    .slice(0, 10);
}

function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function yearMonthOf(dateString) {
  const [year, month] = dateString.split("-").map(Number);

  return { year, month };
}

function fullDayName(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return DAY_NAMES_FULL[
    new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  ];
}

function formatLongDate(dateString) {
  const [year, month, day] = dateString.split("-");

  return `${day}/${month}/${year}`;
}

/*
 * מי הגיע ומי לא — לכל קבוצה שדווחה ביום הזה.
 */
function getDaySessions(summary, dateString) {
  return summary.sessions
    .filter((session) => session.date === dateString)
    .map((session) => {
      const group = summary.groups.find(
        (item) =>
          item.name === session.groupName &&
          item.branch === session.branch
      );

      const present = [];
      const absent = [];

      for (const trainee of group?.trainees || []) {
        const status = trainee.byDate.get(dateString);

        if (status === "present") present.push(trainee.name);
        if (status === "absent") absent.push(trainee.name);
      }

      return { ...session, presentNames: present, absentNames: absent };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "he"));
}

function renderNameList(names, kind) {
  if (!names.length) {
    return `<p class="muted none">${kind === "p" ? "אף אחד" : "אין"}</p>`;
  }

  return `<ul class="names ${kind}">${names
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join("")}</ul>`;
}

function renderDayView({ summary, dateString, base, today }) {
  const sessions = getDaySessions(summary, dateString);

  const reportedDays = [
    ...new Set(summary.sessions.map((session) => session.date)),
  ].sort().reverse();

  const chips = reportedDays.length
    ? `<div class="chips"><span class="muted">ימים עם דיווח בחודש:</span>${reportedDays
        .map(
          (date) =>
            `<a class="chip${date === dateString ? " on" : ""}" href="${base}?date=${date}">${dayLetter(date)}׳ ${formatShortDate(date)}</a>`
        )
        .join("")}</div>`
    : "";

  const totals = sessions.reduce(
    (sum, session) => ({
      present: sum.present + session.present,
      total: sum.total + session.total,
    }),
    { present: 0, total: 0 }
  );

  const cards = sessions.length
    ? `<p class="day-total">${sessions.length} ${sessions.length === 1 ? "קבוצה דווחה" : "קבוצות דווחו"} · הגיעו ${totals.present} מתוך ${totals.total}</p>
      ${sessions
        .map(
          (session) => `
        <section class="card">
          <h2>${escapeHtml(session.groupName)}<span class="branch">${escapeHtml(session.branch)}</span></h2>
          <p class="meta">דווח על ידי ${escapeHtml(session.reportedBy || "—")}${session.reportedAt ? ` · ${escapeHtml(session.reportedAt)}` : ""} · <b>הגיעו ${session.present} מתוך ${session.total}</b></p>
          <div class="cols">
            <div><h3 class="ok">✔ הגיעו (${session.presentNames.length})</h3>${renderNameList(session.presentNames, "p")}</div>
            <div><h3 class="no">✘ לא הגיעו (${session.absentNames.length})</h3>${renderNameList(session.absentNames, "a")}</div>
          </div>
        </section>`
        )
        .join("")}`
    : `<div class="card empty">אין דיווחי נוכחות ביום ${fullDayName(dateString)} ${formatLongDate(dateString)}.${
        reportedDays.length
          ? `<br>אפשר לבחור יום אחר למעלה.`
          : ""
      }</div>`;

  return `
  <nav class="nav">
    <a href="${base}?date=${shiftDay(dateString, -1)}">→ יום קודם</a>
    <span class="month">יום ${fullDayName(dateString)} ${formatLongDate(dateString)}</span>
    <a href="${base}?date=${shiftDay(dateString, 1)}">יום הבא ←</a>
    ${dateString !== today ? `<a href="${base}?date=${today}">היום</a>` : ""}
    <form class="pick" method="get" action="${base}">
      <input type="date" name="date" value="${dateString}" aria-label="בחירת תאריך" onchange="this.form.submit()">
      <button class="btn" type="submit">הצג</button>
    </form>
  </nav>
  ${chips}
  ${cards}`;
}

function renderAttendancePage({
  summary,
  monthLabel,
  yearMonth,
  token,
  view = "month",
  dateString = null,
  now = new Date(),
}) {
  const previous = monthQuery(shiftMonth(yearMonth, -1));
  const next = monthQuery(shiftMonth(yearMonth, 1));
  const current = monthQuery(yearMonth);
  const base = `/attendance/${token}`;
  const today = israelToday(now);
  const isDayView = view === "day" && dateString;

  /*
   * מעבר מ"כל החודש" ל"לפי יום": היום, אם זה החודש הנוכחי;
   * אחרת היום האחרון שיש בו דיווח באותו חודש.
   */
  const dayForMonth =
    monthQuery(yearMonthOf(today)) === current
      ? today
      : [...summary.sessions.map((s) => s.date)].sort().pop() ||
        `${current}-01`;

  const tabs = `
  <nav class="tabs">
    <a class="tab${isDayView ? " on" : ""}" href="${base}?date=${isDayView ? dateString : dayForMonth}">לפי יום</a>
    <a class="tab${isDayView ? "" : " on"}" href="${base}?view=month&month=${current}">כל החודש</a>
  </nav>`;

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

  const monthBody =
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
<title>נוכחות – ${isDayView ? formatLongDate(dateString) : escapeHtml(monthLabel)}</title>
<link rel="icon" type="image/png" href="/logo.png">
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1 class="brand"><img class="logo" src="/logo.png" alt="" width="64">נוכחות האקדמיה לטניס</h1>
    <span class="updated">עודכן ב-${formatUpdatedAt(now)} · מתעדכן לבד כל דקה</span>
  </header>
  ${tabs}
  ${
    isDayView
      ? renderDayView({ summary, dateString, base, today })
      : `<nav class="nav">
    <a href="${base}?view=month&month=${previous}">→ חודש קודם</a>
    <span class="month">${escapeHtml(monthLabel)}</span>
    <a href="${base}?view=month&month=${next}">חודש הבא ←</a>
    <a class="btn primary" href="${base}/excel?month=${current}">⬇ הורד אקסל</a>
  </nav>
  ${monthBody}`
  }
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

  /*
   * ברירת מחדל: לפי יום (היום). "כל החודש" — view=month,
   * וגם קישורים ישנים עם ?month= נשארים בתצוגת החודש.
   */
  const monthView =
    req.query?.view === "month" ||
    (req.query?.month && !req.query?.date);

  const dateString = monthView
    ? null
    : isDateString(req.query?.date)
      ? String(req.query.date)
      : israelToday();

  const yearMonth = monthView
    ? parseMonthQuery(req.query?.month)
    : yearMonthOf(dateString);

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
        view: monthView ? "month" : "day",
        dateString,
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
