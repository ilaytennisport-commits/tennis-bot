const { pool } = require("./databaseService");

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
 * תחומי העבודה של מיכל
 * =========================================================
 *
 * טבלה נפרדת מלוח המשימות של המנהלים.
 * לכל תחום: ממוצע דקות ביום, ממוצע דקות בחודש והערות.
 * דקות ביום × 26 = דקות בחודש (ולהפך, חלקי 26).
 *
 * הדף נפתח בקישור סודי אחד, שמנהל מקבל ב-WhatsApp ("קישור מיכל")
 * ומעביר למיכל. אין צורך בחשבון או בבוט.
 * "החלף קישור מיכל" יוצר קישור חדש, והישן מפסיק לעבוד.
 */

const OWNER_NAME = "מיכל";
const WORK_DAYS = 26;
const TOKEN_KEY = "workload_token";
const SEEDED_KEY = "workload_seeded";
const MAX_MINUTES = 100000;
const MAX_TITLE = 200;
const MAX_TEXT = 2000;

const INITIAL_AREAS = [
  {
    title: "חשבוניות הוצאות",
    description:
      "העלאה לדרייב של חשבוניות שנשלחות בוואטסאפ או במייל, בקרה, ושליחת תיקיית חשבוניות ההוצאות לעמותה כל חודש",
  },
  {
    title: "Grow ומורנינג",
    description:
      "לינקים לתשלום, הוצאת קבלות וחשבוניות, מעקב תשלומים ומעקב הוראות קבע",
  },
  {
    title: "קבצי Form וגיליונות",
    description: "טיפול בקבצי Form, יצירת גיליונות ומעקבים בגיליונות",
  },
  {
    title: "משימות מאשר",
    description: "משימות שוטפות שאשר שולח: טפסים, בדיקות תשלומים",
  },
  {
    title: "רואה חשבון",
    description: "עבודה מול הרואה חשבון",
  },
  {
    title: "קייטנות",
    description: "טיפול בקייטנות",
  },
  {
    title: "שיווק בפייסבוק",
    description: "פוסטים ושיווק בפייסבוק",
  },
];

/* =========================================================
 * מסד נתונים
 * ========================================================= */

async function createWorkloadTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS workload_areas (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      minutes_day DOUBLE PRECISION NOT NULL DEFAULT 0,
      minutes_month DOUBLE PRECISION NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

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
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value]
  );

  return value;
}

/*
 * בפעם הראשונה בלבד: שבעת התחומים מהרשימה, בלי מספרים.
 * תחום שנמחק לא חוזר.
 */
async function seedAreasOnce(db = pool) {
  if (await readSetting(SEEDED_KEY, db)) {
    return false;
  }

  const existing = await db.query(
    `SELECT COUNT(*)::INT AS n FROM workload_areas`
  );

  if (Number(existing.rows[0].n) === 0) {
    for (const area of INITIAL_AREAS) {
      await db.query(
        `INSERT INTO workload_areas (title, description) VALUES ($1, $2)`,
        [area.title, area.description]
      );
    }
  }

  await writeSetting(SEEDED_KEY, "yes", db);

  return true;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function cleanMinutes(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return round1(Math.min(number, MAX_MINUTES));
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function toArea(row) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || "",
    minutesDay: Number(row.minutes_day) || 0,
    minutesMonth: Number(row.minutes_month) || 0,
    notes: row.notes || "",
  };
}

async function listAreas(db = pool) {
  const result = await db.query(
    `SELECT * FROM workload_areas ORDER BY id`
  );

  return result.rows.map(toArea);
}

async function addArea(db = pool) {
  const result = await db.query(
    `INSERT INTO workload_areas (title) VALUES ('תחום חדש') RETURNING *`
  );

  return toArea(result.rows[0]);
}

/*
 * שינוי של שדה אחד.
 * דקות ביום → דקות בחודש = × 26. דקות בחודש → דקות ביום = ÷ 26.
 */
async function updateArea(id, field, value, db = pool) {
  let sets;
  let params;

  if (field === "minutesDay") {
    const day = cleanMinutes(value);

    sets = "minutes_day = $2, minutes_month = $3";
    params = [day, round1(day * WORK_DAYS)];
  } else if (field === "minutesMonth") {
    const month = cleanMinutes(value);

    sets = "minutes_month = $2, minutes_day = $3";
    params = [month, round1(month / WORK_DAYS)];
  } else if (field === "title") {
    const title = cleanText(value, MAX_TITLE);

    if (!title) {
      return null;
    }

    sets = "title = $2";
    params = [title];
  } else if (field === "description" || field === "notes") {
    sets = `${field} = $2`;
    params = [cleanText(value, MAX_TEXT) || null];
  } else {
    return null;
  }

  const result = await db.query(
    `UPDATE workload_areas SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...params]
  );

  return result.rows[0] ? toArea(result.rows[0]) : null;
}

async function deleteArea(id, db = pool) {
  const result = await db.query(
    `DELETE FROM workload_areas WHERE id = $1`,
    [id]
  );

  return result.rowCount > 0;
}

/* =========================================================
 * הקישור
 * ========================================================= */

async function getOrCreateWorkloadToken(db = pool) {
  return (
    (await readSetting(TOKEN_KEY, db)) ||
    writeSetting(TOKEN_KEY, generateShortToken(), db)
  );
}

async function rotateWorkloadToken(db = pool) {
  return writeSetting(TOKEN_KEY, generateShortToken(), db);
}

async function isValidWorkloadToken(token, db = pool) {
  return (
    isLinkToken(token) &&
    sameToken(token, await readSetting(TOKEN_KEY, db))
  );
}

async function getWorkloadLink(fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/w/${await getOrCreateWorkloadToken()}`;
}

/* =========================================================
 * הדף
 * ========================================================= */

const STYLE = `
  :root{ --bg:#eef2f6; --surface:#fff; --fg:#14263a; --muted:#5b6b7d; --line:#d6dee7;
         --court:#1f4e79; --ball:#c8e639; --soft:#e8eff6; --ok:#1f8a4c; --bad:#b3402a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:Arial, "Segoe UI", sans-serif; font-size:16px; }
  .wrap { max-width:1000px; margin:0 auto; padding:18px max(14px, env(safe-area-inset-right)) 60px max(14px, env(safe-area-inset-left)); display:flex; flex-direction:column; gap:16px; }
  header { display:flex; align-items:center; gap:12px; }
  .logo { width:76px; height:auto; flex-shrink:0; }
  h1 { margin:0; font-size:26px; color:var(--court); }
  .sub { color:var(--muted); margin:2px 0 0; }
  .summary { display:flex; gap:10px; flex-wrap:wrap; }
  .stat { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:10px 16px; min-width:150px; }
  .stat b { display:block; font-size:26px; color:var(--court); font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:14px; }
  .stat small { display:block; color:var(--muted); font-size:13px; }
  .scroll { overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:12px; }
  table { width:100%; border-collapse:collapse; min-width:820px; }
  th, td { padding:10px; text-align:right; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:var(--soft); font-size:14px; color:var(--muted); }
  th.num, td.num { text-align:center; white-space:nowrap; font-variant-numeric:tabular-nums; }
  input, textarea { font:inherit; font-size:16px; padding:7px 8px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--fg); width:100%; }
  input.title { font-weight:700; }
  textarea { resize:vertical; font-size:15px; }
  textarea.desc { font-size:13px; color:var(--muted); margin-top:6px; }
  input.n { width:90px; text-align:center; }
  td.area { min-width:240px; }
  td.notes { min-width:200px; }
  .total td { font-weight:700; background:var(--soft); border-bottom:0; }
  .ghost { background:transparent; border:1px solid var(--line); color:var(--fg); border-radius:8px; padding:8px 14px; font:inherit; cursor:pointer; }
  .del { background:transparent; border:0; color:var(--muted); font:inherit; font-size:14px; cursor:pointer; padding:6px; white-space:nowrap; }
  .danger { background:var(--bad); color:#fff; border:0; border-radius:8px; padding:6px 10px; font:inherit; font-size:14px; font-weight:700; cursor:pointer; }
  .confirm { display:flex; flex-direction:column; gap:6px; align-items:flex-start; font-size:14px; color:var(--bad); font-weight:700; }
  .saved { position:fixed; bottom:max(16px, env(safe-area-inset-bottom)); left:16px; background:var(--court); color:#fff; padding:8px 14px; border-radius:999px; font-size:14px; font-weight:700; }
  .saved.err { background:var(--bad); }
  .hint { color:var(--muted); font-size:14px; margin:0; }
  :focus-visible { outline:3px solid var(--ball); outline-offset:2px; }
  footer { color:var(--muted); font-size:13px; text-align:center; }
  [hidden] { display:none !important; }
`;

function asHours(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (!hours) return `${rest} דקות`;
  if (!rest) return `${hours} שעות`;

  return `${hours} שעות ו-${rest} דקות`;
}

function renderRow(area) {
  const e = escapeHtml;

  return `<tr data-id="${e(area.id)}">
    <td class="area">
      <input class="title" data-field="title" value="${e(area.title)}" maxlength="${MAX_TITLE}" aria-label="שם התחום">
      <textarea class="desc" data-field="description" rows="2" maxlength="${MAX_TEXT}" placeholder="תיאור (לא חובה)" aria-label="תיאור">${e(area.description)}</textarea>
    </td>
    <td class="num"><input class="n" type="number" inputmode="decimal" min="0" step="any" data-field="minutesDay" value="${area.minutesDay}" aria-label="ממוצע דקות ביום"></td>
    <td class="num"><input class="n" type="number" inputmode="decimal" min="0" step="any" data-field="minutesMonth" value="${area.minutesMonth}" aria-label="ממוצע דקות בחודש"></td>
    <td class="notes"><textarea data-field="notes" rows="2" maxlength="${MAX_TEXT}" placeholder="הערה…" aria-label="הערות">${e(area.notes)}</textarea></td>
    <td class="num"><button class="del" type="button">מחיקה</button></td>
  </tr>`;
}

const SCRIPT = `
(function () {
  var DAYS = ${WORK_DAYS};
  var base = location.pathname.replace(/\\/+$/, "");
  var tbody = document.getElementById("rows");
  var badge = document.getElementById("saved");
  var hideTimer;

  function round1(n) { return Math.round(n * 10) / 10; }

  function asHours(m) {
    var t = Math.round(m), h = Math.floor(t / 60), r = t % 60;
    if (!h) return r + " דקות";
    if (!r) return h + " שעות";
    return h + " שעות ו-" + r + " דקות";
  }

  function show(text, isError) {
    badge.textContent = text;
    badge.className = "saved" + (isError ? " err" : "");
    badge.hidden = false;
    clearTimeout(hideTimer);
    if (!isError) hideTimer = setTimeout(function () { badge.hidden = true; }, 1500);
  }

  function totals() {
    var d = 0, m = 0, rows = tbody.querySelectorAll("tr");
    rows.forEach(function (tr) {
      d += Number(tr.querySelector('[data-field="minutesDay"]').value) || 0;
      m += Number(tr.querySelector('[data-field="minutesMonth"]').value) || 0;
    });
    d = round1(d); m = round1(m);
    document.getElementById("tot-day").textContent = d;
    document.getElementById("tot-month").textContent = m;
    document.getElementById("sum-day").textContent = d;
    document.getElementById("sum-month").textContent = m;
    document.getElementById("sum-day-h").textContent = asHours(d);
    document.getElementById("sum-month-h").textContent = asHours(m);
    document.getElementById("sum-areas").textContent = rows.length;
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  }

  var timers = {};

  function save(tr, field, value) {
    var key = tr.dataset.id + ":" + field;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      post(base + "/areas/" + tr.dataset.id, { field: field, value: value })
        .then(function () { show("נשמר ✓"); })
        .catch(function () { show("השמירה נכשלה — בדקו חיבור ונסו שוב", true); });
    }, 600);
  }

  tbody.addEventListener("input", function (event) {
    var input = event.target, field = input.dataset.field;
    if (!field) return;
    var tr = input.closest("tr");

    if (field === "minutesDay") {
      tr.querySelector('[data-field="minutesMonth"]').value =
        round1((Number(input.value) || 0) * DAYS);
      totals();
    } else if (field === "minutesMonth") {
      tr.querySelector('[data-field="minutesDay"]').value =
        round1((Number(input.value) || 0) / DAYS);
      totals();
    }

    if (field === "title" && !input.value.trim()) return;
    save(tr, field, input.value);
  });

  tbody.addEventListener("click", function (event) {
    var tr = event.target.closest("tr");
    if (!tr) return;

    if (event.target.classList.contains("del")) {
      var cell = event.target.parentElement;
      cell.innerHTML = '<div class="confirm">למחוק?<button class="danger" type="button" data-act="yes">כן, מחק</button><button class="ghost" type="button" data-act="no">ביטול</button></div>';
      return;
    }

    var act = event.target.dataset.act;
    if (act === "no") {
      event.target.closest("td").innerHTML = '<button class="del" type="button">מחיקה</button>';
    } else if (act === "yes") {
      post(base + "/areas/" + tr.dataset.id + "/delete")
        .then(function () { tr.remove(); totals(); show("נמחק ✓"); })
        .catch(function () { show("המחיקה נכשלה — נסו שוב", true); });
    }
  });

  document.getElementById("add").addEventListener("click", function () {
    post(base + "/areas")
      .then(function (data) {
        tbody.insertAdjacentHTML("beforeend", data.html);
        totals();
        var title = tbody.lastElementChild.querySelector('[data-field="title"]');
        title.focus();
        title.select();
      })
      .catch(function () { show("לא הצלחתי להוסיף — נסו שוב", true); });
  });

  totals();
})();
`;

function renderPage(areas) {
  const totalDay = round1(areas.reduce((sum, a) => sum + a.minutesDay, 0));
  const totalMonth = round1(areas.reduce((sum, a) => sum + a.minutesMonth, 0));

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>תחומי העבודה של ${OWNER_NAME}</title>
<link rel="icon" type="image/png" href="/logo.png">
<style>${STYLE}</style>
</head>
<body><div class="wrap">
  <header>
    <img class="logo" src="/logo.png" alt="האקדמיה לטניס גלי הדר" width="76">
    <div>
      <h1>תחומי העבודה של ${OWNER_NAME}</h1>
      <p class="sub">כמה זמן כל תחום לוקח, בממוצע</p>
    </div>
  </header>

  <div class="summary">
    <div class="stat"><b id="sum-day">${totalDay}</b><span>דקות ביום בסך הכל</span><small id="sum-day-h">${asHours(totalDay)}</small></div>
    <div class="stat"><b id="sum-month">${totalMonth}</b><span>דקות בחודש בסך הכל</span><small id="sum-month-h">${asHours(totalMonth)}</small></div>
    <div class="stat"><b id="sum-areas">${areas.length}</b><span>תחומים</span></div>
  </div>

  <div class="scroll">
    <table>
      <thead><tr>
        <th>תחום</th>
        <th class="num">ממוצע דקות ביום</th>
        <th class="num">ממוצע דקות בחודש</th>
        <th>הערות</th>
        <th></th>
      </tr></thead>
      <tbody id="rows">${areas.map(renderRow).join("")}</tbody>
      <tfoot><tr class="total"><td>סה״כ</td><td class="num" id="tot-day">${totalDay}</td><td class="num" id="tot-month">${totalMonth}</td><td></td><td></td></tr></tfoot>
    </table>
  </div>

  <div><button class="ghost" type="button" id="add">+ הוסף תחום</button></div>
  <p class="hint">כל שינוי נשמר לבד. משנים דקות ביום — הדקות בחודש מתעדכנות (כפול ${WORK_DAYS}). משנים דקות בחודש — הדקות ביום מתעדכנות (חלקי ${WORK_DAYS}).</p>
  <footer>הקישור הזה פרטי — לא להעביר אותו הלאה.</footer>
  <div class="saved" id="saved" hidden></div>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

/* =========================================================
 * בקשות HTTP
 * ========================================================= */

function setPrivateHeaders(res) {
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

async function checkToken(req, res) {
  setPrivateHeaders(res);

  if (!(await isValidWorkloadToken(req.params.token))) {
    res.status(404).send("Not found");
    return false;
  }

  return true;
}

function readId(req) {
  const id = String(req.params.id || "");

  return /^\d{1,18}$/.test(id) ? id : null;
}

async function handlePage(req, res) {
  if (!(await checkToken(req, res))) {
    return;
  }

  await seedAreasOnce();

  res.status(200).type("html").send(renderPage(await listAreas()));
}

async function handleAdd(req, res) {
  if (!(await checkToken(req, res))) {
    return;
  }

  const area = await addArea();

  res.json({ ok: true, area, html: renderRow(area) });
}

async function handleUpdate(req, res) {
  if (!(await checkToken(req, res))) {
    return;
  }

  const id = readId(req);
  const area = id
    ? await updateArea(id, String(req.body?.field || ""), req.body?.value)
    : null;

  if (!area) {
    res.status(400).json({ ok: false });
    return;
  }

  res.json({ ok: true, area });
}

async function handleDelete(req, res) {
  if (!(await checkToken(req, res))) {
    return;
  }

  const id = readId(req);

  res.json({ ok: id ? await deleteArea(id) : false });
}

module.exports = {
  WORK_DAYS,
  createWorkloadTable,
  seedAreasOnce,
  listAreas,
  addArea,
  updateArea,
  deleteArea,
  getOrCreateWorkloadToken,
  rotateWorkloadToken,
  isValidWorkloadToken,
  getWorkloadLink,
  renderPage,
  handlePage,
  handleAdd,
  handleUpdate,
  handleDelete,
};
