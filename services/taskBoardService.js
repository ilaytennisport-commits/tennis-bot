const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  getOrCreateStaffToken,
  resolveStaffByToken,
} = require("./coachReportService");

const {
  getPublicBaseUrl,
  escapeHtml,
} = require("./attendanceViewService");

/*
 * =========================================================
 * לוח משימות שוטפות למנהלים
 * =========================================================
 *
 * כל מנהל מקבל קישור אישי ("משימות" ב-WhatsApp).
 * בדף: מוסיפים משימה, משייכים אותה לאחד המנהלים,
 * ומסמנים לא טופל / יטופל בתאריך / טופל.
 * אפשר גם לערוך ולמחוק.
 *
 * הקישור הוא אותו קישור אישי של דף הדיווח (staff_links),
 * רק בכתובת /tasks — ורק מנהלים יכולים להיכנס.
 */

const STATUSES = ["todo", "later", "done"];

const STATUS_LABELS = {
  todo: "לא טופל",
  later: "יטופל ב…",
  done: "טופל",
};

const MAX_TITLE = 300;
const MAX_NOTE = 2000;

async function createTasksTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS club_tasks (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT,
      assignee TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/* =========================================================
 * מי יכול לקבל משימה
 * ========================================================= */

function getManagerNames() {
  return [
    ...new Set(
      attendance
        .getManagerPhones()
        .map((phone) => attendance.getStaffName(phone))
    ),
  ];
}

function getAssigneeOptions() {
  const names = getManagerNames();

  if (names.length >= 2) {
    names.push(names.length === 2 ? "שניהם" : "כולם");
  }

  return names;
}

function cleanText(value, max) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function cleanAssignee(value) {
  const options = getAssigneeOptions();
  const text = String(value || "").trim();

  return options.includes(text) ? text : options[0] || null;
}

function cleanDate(value) {
  const text = String(value || "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/* =========================================================
 * מסד נתונים
 * ========================================================= */

const STATUS_ORDER = { todo: 0, later: 1, done: 2 };

async function listTasks(db = pool) {
  const result = await db.query(
    `SELECT id, title, note, assignee, status, due_date, created_by, created_at
       FROM club_tasks`
  );

  return result.rows
    .map((row) => ({ ...row, id: String(row.id) }))
    .sort((a, b) => {
      if (a.status !== b.status) {
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }

      if (a.status === "later") {
        return String(a.due_date || "").localeCompare(
          String(b.due_date || "")
        );
      }

      return new Date(b.created_at) - new Date(a.created_at);
    });
}

async function addTask({ title, note, assignee, createdBy }, db = pool) {
  const cleanTitle = cleanText(title, MAX_TITLE);

  if (!cleanTitle) {
    return null;
  }

  const result = await db.query(
    `
      INSERT INTO club_tasks (title, note, assignee, status, created_by)
      VALUES ($1, $2, $3, 'todo', $4)
      RETURNING id
    `,
    [
      cleanTitle,
      cleanText(note, MAX_NOTE) || null,
      cleanAssignee(assignee),
      createdBy || null,
    ]
  );

  return String(result.rows[0].id);
}

async function updateTask(id, { title, note, assignee }, db = pool) {
  const cleanTitle = cleanText(title, MAX_TITLE);

  if (!cleanTitle) {
    return false;
  }

  const result = await db.query(
    `
      UPDATE club_tasks
         SET title = $2, note = $3, assignee = $4, updated_at = NOW()
       WHERE id = $1
    `,
    [
      id,
      cleanTitle,
      cleanText(note, MAX_NOTE) || null,
      cleanAssignee(assignee),
    ]
  );

  return result.rowCount > 0;
}

/*
 * "יטופל ב…" בלי תאריך — שבוע מהיום.
 */
async function setTaskStatus(id, status, dueDate, db = pool, now = new Date()) {
  if (!STATUSES.includes(status)) {
    return false;
  }

  const date =
    status === "later"
      ? cleanDate(dueDate) || attendance.getIsraelDateString(7, now)
      : null;

  const result = await db.query(
    `
      UPDATE club_tasks
         SET status = $2, due_date = COALESCE($3, due_date), updated_at = NOW()
       WHERE id = $1
    `,
    [id, status, date]
  );

  return result.rowCount > 0;
}

async function deleteTask(id, db = pool) {
  const result = await db.query(
    `DELETE FROM club_tasks WHERE id = $1`,
    [id]
  );

  return result.rowCount > 0;
}

/* =========================================================
 * הקישור
 * ========================================================= */

async function getTasksLink(phone, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/tasks/${await getOrCreateStaffToken(phone)}`;
}

/*
 * "משימות של אשר" — הטלפון של המנהל לפי השם.
 */
function findManagerPhoneByName(name) {
  const wanted = String(name || "").trim();

  if (!wanted) {
    return null;
  }

  return (
    attendance
      .getManagerPhones()
      .find((phone) => attendance.getStaffName(phone) === wanted) ||
    attendance
      .getManagerPhones()
      .find((phone) =>
        attendance.getStaffName(phone).split(/\s+/)[0] === wanted
      ) ||
    null
  );
}

/* =========================================================
 * הדף
 * ========================================================= */

const STYLE = `
  :root{
    --bg:#eef2f6; --surface:#fff; --fg:#14263a; --muted:#5b6b7d; --line:#d6dee7;
    --court:#1f4e79; --ball:#c8e639;
    --done:#1f8a4c; --done-bg:#e3f4ea; --todo:#b3402a; --todo-bg:#fbe9e5; --later:#9a6a00; --later-bg:#fdf3d8;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:Arial, "Segoe UI", sans-serif; font-size:16px; }
  .wrap { max-width:760px; margin:0 auto; padding:18px max(14px, env(safe-area-inset-right)) 48px max(14px, env(safe-area-inset-left)); display:flex; flex-direction:column; gap:16px; }
  h1 { margin:0; font-size:28px; color:var(--court); }
  .sub { color:var(--muted); margin:2px 0 0; }
  header { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; }
  .brand { display:flex; align-items:center; gap:12px; }
  .logo { width:84px; height:auto; flex-shrink:0; }
  .counts { display:flex; gap:8px; flex-wrap:wrap; }
  .count { font-size:14px; font-weight:700; padding:4px 10px; border-radius:999px; }
  .c-todo { background:var(--todo-bg); color:var(--todo); }
  .c-later { background:var(--later-bg); color:var(--later); }
  .c-done { background:var(--done-bg); color:var(--done); }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px; }
  .grid { display:grid; grid-template-columns:1fr 160px; gap:10px; }
  .full { grid-column:1/-1; }
  input, select, textarea { font:inherit; font-size:16px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--fg); width:100%; min-width:0; }
  button, .btn { font:inherit; cursor:pointer; text-decoration:none; display:inline-block; }
  .primary { background:var(--court); color:#fff; border:0; border-radius:8px; padding:11px 20px; font-weight:700; }
  .ghost { background:transparent; border:1px solid var(--line); color:var(--fg); border-radius:8px; padding:7px 12px; font-size:14px; }
  .danger { background:var(--todo); color:#fff; border:0; border-radius:8px; padding:7px 12px; font-size:14px; font-weight:700; }
  .filters { display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
  .group { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .group-l { color:var(--muted); font-size:14px; }
  .chip { border:1px solid var(--line); color:var(--fg); border-radius:999px; padding:6px 13px; font-size:15px; background:transparent; }
  .chip.on { background:var(--court); border-color:var(--court); color:#fff; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
  .task { background:var(--surface); border:1px solid var(--line); border-right:5px solid var(--line); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
  .task.s-todo { border-right-color:var(--todo); }
  .task.s-later { border-right-color:var(--later); }
  .task.s-done { border-right-color:var(--done); }
  .task.s-done .title { text-decoration:line-through; color:var(--muted); }
  .top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .title { font-weight:700; font-size:17px; overflow-wrap:anywhere; }
  .who { display:inline-block; font-size:13px; font-weight:700; background:var(--bg); border:1px solid var(--line); border-radius:999px; padding:1px 9px; margin-top:4px; }
  .note { color:var(--muted); font-size:14px; margin-top:4px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .meta { color:var(--muted); font-size:13px; white-space:nowrap; }
  .row { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; }
  .status { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .status form { margin:0; display:flex; gap:6px; align-items:center; }
  .st { border:1px solid var(--line); background:transparent; color:var(--fg); border-radius:8px; padding:6px 12px; font-size:14px; }
  .st.on.v-todo { background:var(--todo-bg); border-color:var(--todo); color:var(--todo); font-weight:700; }
  .st.on.v-later { background:var(--later-bg); border-color:var(--later); color:var(--later); font-weight:700; }
  .st.on.v-done { background:var(--done-bg); border-color:var(--done); color:var(--done); font-weight:700; }
  .date { width:auto; font-size:14px; padding:5px 8px; }
  .late { color:var(--todo); font-weight:700; font-size:13px; }
  .actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .actions form { margin:0; }
  .confirm { color:var(--todo); font-weight:700; font-size:14px; }
  .empty { text-align:center; color:var(--muted); padding:28px 12px; background:var(--surface); border:1px dashed var(--line); border-radius:12px; }
  footer { color:var(--muted); font-size:13px; text-align:center; }
  @media (max-width:480px) { .grid { grid-template-columns:1fr; } .top { flex-direction:column; gap:2px; } }
`;

function page(body) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>משימות הטניס</title>
<link rel="icon" type="image/png" href="/logo.png">
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

function shortDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const israel = attendance.getIsraelDateString(0, date);
  const [, month, day] = israel.split("-").map(Number);

  return `${day}.${month}`;
}

function dueLabel(dateString) {
  const [, month, day] = String(dateString).split("-").map(Number);

  return `${day}.${month}`;
}

function filterUrl(base, { s, w }) {
  const params = new URLSearchParams();

  if (s && s !== "all") params.set("s", s);
  if (w && w !== "all") params.set("w", w);

  const query = params.toString();

  return query ? `${base}?${query}` : base;
}

function renderTask(task, ctx) {
  const { base, back, today, editId, deleteId, assignees } = ctx;
  const e = escapeHtml;
  const action = `${base}/task/${e(task.id)}`;

  if (editId === task.id) {
    return `<li class="task s-${e(task.status)}" id="t${e(task.id)}">
      <form method="post" action="${action}/edit" class="grid">
        <input type="hidden" name="back" value="${e(back)}">
        <input name="title" value="${e(task.title)}" maxlength="${MAX_TITLE}" required aria-label="משימה">
        <select name="assignee" aria-label="באחריות">
          ${assignees
            .map(
              (name) =>
                `<option value="${e(name)}"${name === task.assignee ? " selected" : ""}>באחריות: ${e(name)}</option>`
            )
            .join("")}
        </select>
        <textarea name="note" rows="2" class="full" maxlength="${MAX_NOTE}" placeholder="הערה (לא חובה)" aria-label="הערה">${e(task.note || "")}</textarea>
        <div class="full actions">
          <button class="primary" type="submit">שמור</button>
          <a class="btn ghost" href="${e(back)}#t${e(task.id)}">ביטול</a>
        </div>
      </form>
    </li>`;
  }

  const statusButton = (value) => `
    <form method="post" action="${action}/status">
      <input type="hidden" name="back" value="${e(back)}">
      <input type="hidden" name="status" value="${value}">
      <button class="st v-${value}${task.status === value ? " on" : ""}" type="submit">${STATUS_LABELS[value]}</button>
    </form>`;

  const dateForm =
    task.status === "later"
      ? `<form method="post" action="${action}/status">
          <input type="hidden" name="back" value="${e(back)}">
          <input type="hidden" name="status" value="later">
          <input class="date" type="date" name="due_date" value="${e(task.due_date || "")}" aria-label="תאריך טיפול">
          <button class="ghost" type="submit">עדכן תאריך</button>
        </form>
        ${task.due_date && task.due_date < today ? `<span class="late">עבר התאריך</span>` : ""}`
      : "";

  const sep = back.includes("?") ? "&" : "?";

  const actions =
    deleteId === task.id
      ? `<div class="actions">
          <span class="confirm">למחוק את המשימה?</span>
          <form method="post" action="${action}/delete">
            <input type="hidden" name="back" value="${e(back)}">
            <button class="danger" type="submit">כן, מחק</button>
          </form>
          <a class="btn ghost" href="${e(back)}#t${e(task.id)}">ביטול</a>
        </div>`
      : `<div class="actions">
          <a class="btn ghost" href="${e(back)}${sep}edit=${e(task.id)}#t${e(task.id)}">עריכה</a>
          <a class="btn ghost" href="${e(back)}${sep}del=${e(task.id)}#t${e(task.id)}">מחיקה</a>
        </div>`;

  const dueText =
    task.status === "later" && task.due_date
      ? ` · יטופל ב-${e(dueLabel(task.due_date))}`
      : "";

  return `<li class="task s-${e(task.status)}" id="t${e(task.id)}">
    <div class="top">
      <div>
        <div class="title">${e(task.title)}</div>
        <span class="who">באחריות: ${e(task.assignee || "—")}</span>
        ${task.note ? `<div class="note">${e(task.note)}</div>` : ""}
      </div>
      <span class="meta">נוסף ${e(shortDate(task.created_at))}${task.created_by ? ` ע״י ${e(task.created_by)}` : ""}${dueText}</span>
    </div>
    <div class="row">
      <div class="status">
        ${statusButton("todo")}${statusButton("later")}${statusButton("done")}
        ${dateForm}
      </div>
      ${actions}
    </div>
  </li>`;
}

function renderBoard({
  staff,
  token,
  tasks,
  filters = {},
  editId = null,
  deleteId = null,
  now = new Date(),
}) {
  const e = escapeHtml;
  const base = `/tasks/${token}`;
  const s = STATUSES.includes(filters.s) ? filters.s : "all";
  const assignees = getAssigneeOptions();
  const people = getManagerNames();
  const w = people.includes(filters.w) ? filters.w : "all";
  const back = filterUrl(base, { s, w });
  const today = attendance.getIsraelDateString(0, now);
  const together = assignees.find((name) => !people.includes(name));

  const counts = { todo: 0, later: 0, done: 0 };
  tasks.forEach((task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
  });

  const shown = tasks.filter(
    (task) =>
      (s === "all" || task.status === s) &&
      (w === "all" || task.assignee === w || task.assignee === together)
  );

  const myName = staff.name;
  const defaultAssignee = assignees.includes(myName) ? myName : assignees[0];

  const chip = (label, params, on) =>
    `<a class="btn chip${on ? " on" : ""}" href="${e(filterUrl(base, params))}">${e(label)}</a>`;

  const list = !tasks.length
    ? `<div class="empty">עוד אין משימות. כתבו משימה בשורה למעלה ולחצו "הוסף משימה".</div>`
    : !shown.length
      ? `<div class="empty">אין משימות בסינון הזה.</div>`
      : `<ul>${shown
          .map((task) =>
            renderTask(task, { base, back, today, editId, deleteId, assignees })
          )
          .join("")}</ul>`;

  return page(`
    <header>
      <div class="brand">
        <img class="logo" src="/logo.png" alt="האקדמיה לטניס גלי הדר" width="84" height="66">
        <div>
        <h1>משימות הטניס</h1>
        <p class="sub">משימות שוטפות של המועדון · שלום ${e(myName)}</p>
        </div>
      </div>
      <div class="counts">
        <span class="count c-todo">${counts.todo} לא טופלו</span>
        <span class="count c-later">${counts.later} מתוזמנות</span>
        <span class="count c-done">${counts.done} טופלו</span>
      </div>
    </header>

    <form method="post" action="${base}/add" class="card grid">
      <input type="hidden" name="back" value="${e(back)}">
      <input name="title" maxlength="${MAX_TITLE}" placeholder="משימה חדשה… למשל: להזמין כדורים" required aria-label="משימה חדשה">
      <select name="assignee" aria-label="באחריות">
        ${assignees
          .map(
            (name) =>
              `<option value="${e(name)}"${name === defaultAssignee ? " selected" : ""}>באחריות: ${e(name)}</option>`
          )
          .join("")}
      </select>
      <input name="note" class="full" maxlength="${MAX_NOTE}" placeholder="הערה (לא חובה)" aria-label="הערה">
      <div class="full"><button class="primary" type="submit">הוסף משימה</button></div>
    </form>

    <div class="filters">
      <div class="group">
        <span class="group-l">סטטוס:</span>
        ${chip("הכל", { s: "all", w }, s === "all")}
        ${STATUSES.map((value) => chip(STATUS_LABELS[value], { s: value, w }, s === value)).join("")}
      </div>
      ${
        people.length >= 2
          ? `<div class="group">
              <span class="group-l">באחריות:</span>
              ${chip("כולם", { s, w: "all" }, w === "all")}
              ${people.map((name) => chip(name, { s, w: name }, w === name)).join("")}
            </div>`
          : ""
      }
    </div>

    ${list}

    <footer>הקישור הזה אישי — לא להעביר אותו הלאה.</footer>
  `);
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

async function withManager(req, res) {
  setPrivateHeaders(res);

  const staff = await resolveStaffByToken(req.params.token);

  if (!staff || !staff.isManager) {
    res.status(404).send("Not found");
    return null;
  }

  return staff;
}

/*
 * חוזרים רק לכתובת של אותו לוח (לא לאתר אחר).
 */
function safeBack(token, value) {
  const base = `/tasks/${token}`;
  const text = String(value || "");

  return text === base || text.startsWith(`${base}?`) ? text : base;
}

function readId(req) {
  const id = String(req.params.id || "");

  return /^\d{1,18}$/.test(id) ? id : null;
}

function readQueryId(value) {
  const id = String(value || "");

  return /^\d{1,18}$/.test(id) ? id : null;
}

async function handleBoard(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  res.status(200).type("html").send(
    renderBoard({
      staff,
      token: req.params.token,
      tasks: await listTasks(),
      filters: { s: req.query?.s, w: req.query?.w },
      editId: readQueryId(req.query?.edit),
      deleteId: readQueryId(req.query?.del),
    })
  );
}

function redirectBack(req, res, anchorId = null) {
  const back = safeBack(req.params.token, req.body?.back);

  res.redirect(303, anchorId ? `${back}#t${anchorId}` : back);
}

async function handleAdd(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  await addTask({
    title: req.body?.title,
    note: req.body?.note,
    assignee: req.body?.assignee,
    createdBy: staff.name,
  });

  redirectBack(req, res);
}

async function handleEdit(req, res) {
  const staff = await withManager(req, res);
  const id = readId(req);

  if (!staff) {
    return;
  }

  if (id) {
    await updateTask(id, {
      title: req.body?.title,
      note: req.body?.note,
      assignee: req.body?.assignee,
    });
  }

  redirectBack(req, res, id);
}

async function handleStatus(req, res) {
  const staff = await withManager(req, res);
  const id = readId(req);

  if (!staff) {
    return;
  }

  if (id) {
    await setTaskStatus(id, String(req.body?.status || ""), req.body?.due_date);
  }

  redirectBack(req, res, id);
}

async function handleDelete(req, res) {
  const staff = await withManager(req, res);
  const id = readId(req);

  if (!staff) {
    return;
  }

  if (id) {
    await deleteTask(id);
  }

  redirectBack(req, res);
}

module.exports = {
  createTasksTable,
  getAssigneeOptions,
  listTasks,
  addTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  getTasksLink,
  findManagerPhoneByName,
  renderBoard,
  handleBoard,
  handleAdd,
  handleEdit,
  handleStatus,
  handleDelete,
};
