const ExcelJS = require("exceljs");

const { pool } = require("./databaseService");

const {
  resolveStaffByToken,
  getOrCreateStaffToken,
} = require("./coachReportService");

const {
  getPublicBaseUrl,
  escapeHtml,
} = require("./attendanceViewService");

/*
 * =========================================================
 * נוכחים לא רשומים
 * =========================================================
 *
 * משווה בין הילדים שרשומים בבוט (קבוצות, שיבוצים)
 * לבין גיליונות ההרשמה בגוגל — גיליון לכל סניף.
 *
 * הקישורים לגיליונות נשמרים במסד הנתונים (לא בקוד, כי הקוד ציבורי).
 * מנהל מגדיר אותם ב-WhatsApp:
 *   גיליון הרשמה גלי הדר <קישור>
 * הגיליון צריך להיות משותף "כל מי שיש לו את הקישור – צופה".
 *
 * שורה מחוקה (קו חוצה) בגיליון = הרשמה שבוטלה.
 */

const SHEET_KEY_PREFIX = "registration_sheet:";
const NAME_HEADER = /שם\s+מלא\s+של\s+ה?ילד/;
const FETCH_TIMEOUT_MS = 20000;

/* =========================================================
 * הגדרת הגיליונות
 * ========================================================= */

function extractSheetId(text) {
  const match = String(text || "").match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/
  );

  return match ? match[1] : null;
}

async function listBranches(db = pool) {
  const result = await db.query(
    `SELECT DISTINCT branch FROM training_groups WHERE active AND branch IS NOT NULL`
  );

  return result.rows.map((row) => row.branch).filter(Boolean);
}

/*
 * "גלי הדר" → "גלי הדר – ראשון לציון"
 */
async function resolveBranch(text, db = pool) {
  const wanted = normalize(text);

  if (!wanted) {
    return null;
  }

  const branches = await listBranches(db);

  return (
    branches.find((branch) => normalize(branch) === wanted) ||
    branches.find((branch) => normalize(branch).includes(wanted)) ||
    null
  );
}

async function setRegistrationSheet(branch, sheetId, db = pool) {
  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [SHEET_KEY_PREFIX + branch, sheetId]
  );
}

async function getRegistrationSheets(db = pool) {
  const result = await db.query(
    `SELECT key, value FROM app_settings WHERE key LIKE $1`,
    [`${SHEET_KEY_PREFIX}%`]
  );

  return result.rows
    .map((row) => ({
      branch: row.key.slice(SHEET_KEY_PREFIX.length),
      sheetId: row.value,
    }))
    .filter((sheet) => sheet.branch && sheet.sheetId);
}

/* =========================================================
 * קריאת גיליון הרשמה
 * ========================================================= */

function cellText(cell) {
  const value = cell?.value;

  if (value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }

  return String(cell?.text ?? value ?? "");
}

/*
 * כל לשונית שיש בה עמודה "שם מלא של הילד/ה".
 */
async function parseRegistrationWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  const kids = [];

  for (const sheet of workbook.worksheets) {
    const header = sheet.getRow(1);
    let column = 0;

    header.eachCell((cell, index) => {
      if (!column && NAME_HEADER.test(cellText(cell))) {
        column = index;
      }
    });

    if (!column) {
      continue;
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const cell = row.getCell(column);
      const name = cellText(cell).replace(/\s+/g, " ").trim();

      if (name) {
        kids.push({ name, struck: Boolean(cell.font?.strike) });
      }
    });
  }

  return kids;
}

async function fetchRegistrationKids(sheetId, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`,
      { signal: controller.signal, redirect: "follow" }
    );

    const type = response.headers?.get?.("content-type") || "";

    if (!response.ok || /text\/html/.test(type)) {
      throw new Error(`sheet ${response.status}`);
    }

    return parseRegistrationWorkbook(
      Buffer.from(await response.arrayBuffer())
    );
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
 * הילדים בבוט
 * ========================================================= */

const DAY_LETTERS = "אבגדהוש";

async function loadBotKids(db = pool) {
  const kids = new Map();

  function add(branch, name, where) {
    const clean = String(name || "").replace(/\s+/g, " ").trim();

    if (!branch || !clean) {
      return;
    }

    const key = `${branch}|${clean}`;

    if (!kids.has(key)) {
      kids.set(key, { branch, name: clean, groups: new Set() });
    }

    if (where) {
      kids.get(key).groups.add(where);
    }
  }

  const members = await db.query(`
    SELECT t.name AS trainee, g.name AS grp, g.branch
      FROM trainees t
      JOIN training_groups g ON g.id = t.group_id
     WHERE t.active AND g.active
  `);

  members.rows.forEach((row) => add(row.branch, row.trainee, row.grp));

  const slots = await db
    .query(`
      SELECT trainee_name AS trainee, branch, group_label, day_of_week,
             to_char(start_time, 'HH24:MI') AS start
        FROM trainee_training_slots
       WHERE active
    `)
    .catch(() => ({ rows: [] }));

  slots.rows.forEach((row) =>
    add(
      row.branch,
      row.trainee,
      [row.group_label, DAY_LETTERS[row.day_of_week - 1], row.start]
        .filter(Boolean)
        .join(" ")
    )
  );

  return [...kids.values()].map((kid) => ({
    ...kid,
    groups: [...kid.groups],
  }));
}

/* =========================================================
 * השוואה
 * ========================================================= */

function normalize(value) {
  return String(value || "")
    .replace(/[׳'`"״\-–—.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];

    row[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];

      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = saved;
    }
  }

  return row[b.length];
}

function sortedWords(value) {
  return normalize(value).split(" ").sort().join(" ");
}

/*
 * מחפש לילד מהבוט את ההרשמה שלו.
 * kind: exact / spelling / first / ambiguous / maybe / null
 */
function matchKid(botName, registered) {
  const name = normalize(botName);
  const words = name.split(" ");
  const live = registered.filter((kid) => !kid.struck);

  const exact = (list) =>
    list.filter(
      (kid) =>
        normalize(kid.name) === name ||
        sortedWords(kid.name) === sortedWords(botName)
    );

  let found = exact(live);

  if (found.length) {
    return { kind: "exact", matches: found };
  }

  found = exact(registered.filter((kid) => kid.struck));

  if (found.length) {
    return { kind: "struck", matches: found };
  }

  if (words.length > 1) {
    found = live.filter(
      (kid) => distance(normalize(kid.name), name) <= 2
    );

    if (found.length) {
      return { kind: "spelling", matches: found };
    }

    found = live.filter(
      (kid) => normalize(kid.name).split(" ")[0] === words[0]
    );

    return found.length
      ? { kind: "maybe", matches: found }
      : { kind: null, matches: [] };
  }

  /*
   * שם פרטי בלבד: קודם שם פרטי זהה, אחר כך מילה זהה בשם,
   * ורק אם אין — שם פרטי עם אות אחת שונה (זלטה / זלאטה).
   */
  const tiers = [
    (kid) => normalize(kid.name).split(" ")[0] === name,
    (kid) => normalize(kid.name).split(" ").includes(name),
    (kid) =>
      name.length >= 4 &&
      distance(normalize(kid.name).split(" ")[0], name) <= 1,
  ];

  found = [];

  for (const tier of tiers) {
    found = live.filter(tier);

    if (found.length) {
      break;
    }
  }

  if (found.length === 1) {
    return { kind: "first", matches: found };
  }

  if (found.length > 1) {
    return { kind: "ambiguous", matches: found };
  }

  found = registered.filter(
    (kid) => kid.struck && normalize(kid.name).split(" ").includes(name)
  );

  return found.length
    ? { kind: "struck", matches: found }
    : { kind: null, matches: [] };
}

function compareBranch(botKids, registered) {
  const result = {
    missing: [],
    struck: [],
    spelling: [],
    maybe: [],
    ambiguous: [],
    duplicates: [],
    notInBot: [],
  };

  const used = new Set();
  const matchedBy = new Map();

  for (const kid of [...botKids].sort((a, b) => a.name.localeCompare(b.name, "he"))) {
    const { kind, matches } = matchKid(kid.name, registered);
    const entry = { ...kid, matches: [...new Set(matches.map((m) => m.name))] };

    matches.forEach((m) => used.add(normalize(m.name)));

    if (!kind) result.missing.push(entry);
    if (kind === "struck") result.struck.push(entry);
    if (kind === "spelling") result.spelling.push(entry);
    if (kind === "maybe") result.maybe.push(entry);
    if (kind === "ambiguous") result.ambiguous.push(entry);

    /* שני שמות מלאים שונים בבוט שמתאימים לאותה הרשמה */
    if (
      (kind === "exact" || kind === "spelling") &&
      matches.length === 1 &&
      kid.name.includes(" ")
    ) {
      const key = normalize(matches[0].name);

      if (!matchedBy.has(key)) matchedBy.set(key, new Set());
      matchedBy.get(key).add(kid.name);
    }
  }

  for (const [, names] of matchedBy) {
    if (names.size > 1) {
      result.duplicates.push([...names]);
    }
  }

  const seen = new Set();

  for (const kid of registered) {
    const key = normalize(kid.name);

    if (!kid.struck && !used.has(key) && !seen.has(key)) {
      seen.add(key);
      result.notInBot.push(kid.name);
    }
  }

  return result;
}

/*
 * הבדיקה המלאה — לכל סניף שהוגדר לו גיליון.
 */
async function runRegistrationCheck({ db = pool, fetchImpl = fetch } = {}) {
  const sheets = await getRegistrationSheets(db);
  const botKids = await loadBotKids(db);
  const branches = [];

  for (const sheet of sheets) {
    const kids = botKids.filter((kid) => kid.branch === sheet.branch);

    try {
      const registered = await fetchRegistrationKids(sheet.sheetId, fetchImpl);

      branches.push({
        branch: sheet.branch,
        botCount: kids.length,
        registeredCount: new Set(
          registered.filter((k) => !k.struck).map((k) => normalize(k.name))
        ).size,
        ...compareBranch(kids, registered),
      });
    } catch (error) {
      console.error(
        `❌ קריאת גיליון ההרשמה של ${sheet.branch} נכשלה:`,
        error.message
      );

      branches.push({ branch: sheet.branch, error: true, botCount: kids.length });
    }
  }

  const configured = new Set(sheets.map((sheet) => sheet.branch));
  const unconfigured = [
    ...new Set(botKids.map((kid) => kid.branch)),
  ].filter((branch) => !configured.has(branch));

  return { branches, unconfigured, checkedAt: new Date() };
}

function countTotals(report) {
  const sum = (field) =>
    report.branches.reduce(
      (total, branch) => total + (branch[field]?.length || 0),
      0
    );

  return {
    missing: sum("missing") + sum("struck"),
    spelling: sum("spelling") + sum("maybe"),
    notInBot: sum("notInBot"),
  };
}

/* =========================================================
 * הקישור והודעת WhatsApp
 * ========================================================= */

async function getRegistrationCheckLink(phone, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/c/${await getOrCreateStaffToken(phone)}`;
}

function buildSetupHelp() {
  return [
    "📋 כדי לבדוק נוכחים לא רשומים, צריך קודם להגדיר את גיליונות ההרשמה.",
    "",
    "שולחים לי הודעה לכל סניף:",
    "גיליון הרשמה גלי הדר <הקישור לגיליון>",
    "גיליון הרשמה בית חשמונאי <הקישור לגיליון>",
    "",
    'הגיליון צריך להיות משותף "כל מי שיש לו את הקישור – צופה".',
  ].join("\n");
}

function shortBranch(branch) {
  return String(branch).split(/\s+[–-]\s+/)[0];
}

function buildCheckMessage(report, link) {
  if (!report.branches.length) {
    return buildSetupHelp();
  }

  const lines = ["🧒 נוכחים לא רשומים", ""];

  for (const branch of report.branches) {
    if (branch.error) {
      lines.push(
        `⚠️ ${shortBranch(branch.branch)}: לא הצלחתי לקרוא את גיליון ההרשמה. בדקו שהוא משותף "כל מי שיש לו את הקישור – צופה".`
      );
      continue;
    }

    const missing = [...branch.missing, ...branch.struck];

    lines.push(
      `📍 ${shortBranch(branch.branch)}: ${
        missing.length
          ? `${missing.length} בבוט ולא בהרשמה — ${missing.map((k) => k.name).join(", ")}`
          : "כל הילדים בבוט רשומים ✅"
      }`
    );
  }

  const totals = countTotals(report);

  if (totals.spelling) {
    lines.push("", `✏️ עוד ${totals.spelling} שמות שכתובים קצת אחרת — בדף המלא.`);
  }

  if (totals.notInBot) {
    lines.push(`📋 ${totals.notInBot} נרשמו ולא נמצאים בבוט — בדף המלא.`);
  }

  if (link) {
    lines.push("", "הדף המלא (מתעדכן בכל פתיחה):", link);
  }

  return lines.join("\n");
}

/* =========================================================
 * הדף
 * ========================================================= */

const STYLE = `
  :root{ --bg:#f3f6f4; --surface:#fff; --fg:#17251d; --muted:#5d6d63; --line:#d9e3dc;
    --brand:#0b5d3b; --soft:#e5f1ea; --bad:#b3402a; --warn:#8a5a00; --info:#1f4e79; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 Arial, "Segoe UI", sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:18px max(14px, env(safe-area-inset-right)) 48px max(14px, env(safe-area-inset-left)); display:flex; flex-direction:column; gap:16px; }
  header { display:flex; align-items:center; gap:12px; }
  .logo { width:72px; height:auto; flex-shrink:0; }
  h1 { margin:0; font-size:24px; color:var(--brand); }
  .sub { margin:2px 0 0; color:var(--muted); font-size:14px; }
  h2 { margin:8px 0 0; font-size:21px; }
  .summary { display:flex; gap:10px; flex-wrap:wrap; }
  .stat { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:10px 14px; flex:1 1 150px; }
  .stat b { display:block; font-size:26px; }
  .stat span { color:var(--muted); font-size:14px; }
  .stat.bad b { color:var(--bad); } .stat.warn b { color:var(--warn); } .stat.info b { color:var(--info); }
  section { background:var(--surface); border:1px solid var(--line); border-right:5px solid var(--s, var(--line)); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
  section.bad { --s:var(--bad); } section.warn { --s:var(--warn); } section.info { --s:var(--info); } section.ok { --s:var(--brand); }
  h3 { margin:0; font-size:17px; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:15px; }
  th, td { padding:7px 9px; text-align:right; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:var(--soft); font-size:13px; color:var(--muted); }
  .muted { color:var(--muted); font-size:14px; }
  .names { display:flex; flex-wrap:wrap; gap:6px; list-style:none; margin:0; padding:0; }
  .names li { background:var(--soft); border-radius:999px; padding:2px 10px; font-size:14px; }
  footer { color:var(--muted); font-size:13px; text-align:center; }
`;

function list(values) {
  return values.map((value) => escapeHtml(value)).join(" / ");
}

function tableSection(cls, title, rows, columns) {
  if (!rows.length) {
    return "";
  }

  return `<section class="${cls}">
    <h3>${title} (${rows.length})</h3>
    <div class="scroll"><table>
      <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map((row) => `<tr>${columns.map((c) => `<td>${c.value(row)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function renderBranch(branch) {
  const title = `<h2>📍 ${escapeHtml(branch.branch)}</h2>`;

  if (branch.error) {
    return `${title}<section class="bad"><p>לא הצלחתי לקרוא את גיליון ההרשמה של הסניף. בדקו שהגיליון משותף "כל מי שיש לו את הקישור – צופה".</p></section>`;
  }

  const groups = (kid) => `<span class="muted">${list(kid.groups)}</span>`;
  const name = (kid) => `<b>${escapeHtml(kid.name)}</b>`;

  const parts = [
    tableSection("bad", "❌ בבוט ולא נמצאו בהרשמה", branch.missing, [
      { label: "ילד בבוט", value: name },
      { label: "קבוצה בבוט", value: groups },
    ]),
    tableSection("bad", "❌ בבוט, אבל ההרשמה מחוקה בגיליון", branch.struck, [
      { label: "ילד בבוט", value: name },
      { label: "בהרשמה (מחוק)", value: (kid) => list(kid.matches) },
      { label: "קבוצה בבוט", value: groups },
    ]),
    tableSection("warn", "⚠️ כנראה אותו ילד, השם כתוב אחרת", branch.spelling, [
      { label: "בבוט", value: name },
      { label: "בהרשמה", value: (kid) => list(kid.matches) },
      { label: "קבוצה בבוט", value: groups },
    ]),
    tableSection("warn", "⚠️ אותו שם פרטי, שם משפחה אחר", branch.maybe, [
      { label: "בבוט", value: name },
      { label: "בהרשמה", value: (kid) => list(kid.matches) },
      { label: "קבוצה בבוט", value: groups },
    ]),
    branch.duplicates.length
      ? `<section class="warn"><h3>🔁 אולי אותו ילד פעמיים בבוט (${branch.duplicates.length})</h3>
          <ul>${branch.duplicates.map((names) => `<li>${list(names)}</li>`).join("")}</ul></section>`
      : "",
    tableSection("info", "ℹ️ רשומים בבוט רק בשם פרטי — יש כמה אפשרויות", branch.ambiguous, [
      { label: "בבוט", value: name },
      { label: "אפשרויות בהרשמה", value: (kid) => list(kid.matches) },
    ]),
    branch.notInBot.length
      ? `<section class="info"><h3>📋 נרשמו ולא נמצאים בבוט (${branch.notInBot.length})</h3>
          <ul class="names">${branch.notInBot.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></section>`
      : "",
  ].filter(Boolean);

  if (!parts.length) {
    parts.push(`<section class="ok"><p>✅ הכל תואם: כל הילדים בבוט רשומים, וכל הנרשמים נמצאים בבוט.</p></section>`);
  }

  return `${title}<p class="muted">${branch.botCount} ילדים בבוט · ${branch.registeredCount} נרשמו</p>${parts.join("")}`;
}

function renderPage(report) {
  const totals = countTotals(report);

  const checkedAt = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(report.checkedAt);

  const body = report.branches.length
    ? `<div class="summary">
        <div class="stat bad"><b>${totals.missing}</b><span>בבוט ולא בהרשמה</span></div>
        <div class="stat warn"><b>${totals.spelling}</b><span>שם כתוב אחרת</span></div>
        <div class="stat info"><b>${totals.notInBot}</b><span>נרשמו ולא בבוט</span></div>
      </div>
      ${report.branches.map(renderBranch).join("")}
      ${
        report.unconfigured.length
          ? `<p class="muted">לא הוגדר גיליון הרשמה ל: ${list(report.unconfigured)}.</p>`
          : ""
      }
      <p class="muted">כדי לתקן שם בבוט, שולחים לו בוואטסאפ למשל: <b>שנה שם נועם מזרחי לנועם זרחי</b></p>`
    : `<section class="warn"><p>${escapeHtml(buildSetupHelp()).replace(/\n/g, "<br>")}</p></section>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>נוכחים לא רשומים</title>
<link rel="icon" type="image/png" href="/logo.png">
<style>${STYLE}</style>
</head>
<body><div class="wrap">
  <header>
    <img class="logo" src="/logo.png" alt="האקדמיה לטניס גלי הדר" width="72">
    <div>
      <h1>נוכחים לא רשומים</h1>
      <p class="sub">הילדים בבוט מול גיליונות ההרשמה · נבדק ${checkedAt}</p>
    </div>
  </header>
  ${body}
  <footer>יש כאן שמות של ילדים — לא להעביר את הקישור מחוץ לצוות.</footer>
</div></body>
</html>`;
}

async function handleCheckPage(req, res) {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  const staff = await resolveStaffByToken(req.params.token);

  if (!staff || !staff.isManager) {
    res.status(404).send("Not found");
    return;
  }

  res.status(200).type("html").send(renderPage(await runRegistrationCheck()));
}

module.exports = {
  extractSheetId,
  resolveBranch,
  setRegistrationSheet,
  getRegistrationSheets,
  parseRegistrationWorkbook,
  fetchRegistrationKids,
  loadBotKids,
  matchKid,
  compareBranch,
  runRegistrationCheck,
  getRegistrationCheckLink,
  buildCheckMessage,
  buildSetupHelp,
  renderPage,
  handleCheckPage,
};
