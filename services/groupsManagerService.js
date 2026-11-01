const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  getSessionsForDay,
  resolveStaffByToken,
  getOrCreateStaffToken,
} = require("./coachReportService");

const {
  getPublicBaseUrl,
  escapeHtml,
} = require("./attendanceViewService");

const { sendToOtherManagers } = require("./staffNotifyService");

/*
 * =========================================================
 * דף ניהול קבוצות
 * =========================================================
 *
 * מנהל פותח קישור אישי ("ניהול קבוצות" ב-WhatsApp) ורואה לכל ילד
 * את האימונים שלו בכל יום — בדיוק כמו שהמאמנים רואים בדף הדיווח.
 * לחיצה על אימון מוסיפה או מורידה את הילד מאותו יום בלבד.
 *
 * שלושה סוגי אימונים (כמו בדף הדיווח):
 *   g:<id>     קבוצה קבועה (למשל "א+ד 17:00 + ג 18:00 – עתודה").
 *              הורדה מיום אחד = trainee_day_exclusions.
 *   t:<נבחרת>  נבחרת צעירה / בוגרת ב-16:30 — לפי שיבוצים.
 *   s:<שעה>    מפגש בגלי הדר לפי יום ושעה — לפי שיבוצים.
 *
 * כל שינוי נשלח לכל המנהלים ב-WhatsApp (מרוכז, דקה אחרי השינוי האחרון).
 */

const BRANCH_GALI_HADAR = "גלי הדר – ראשון לציון";
const TEAM_LABELS = ["צעירה", "בוגרת"];
const TEAM_TIME = "16:30";
const DAY_NAMES = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const WEEK_DAYS = [1, 2, 3, 4, 5, 6];
const NOTIFY_DELAY_MS = 60 * 1000;
const MAX_NAME = 80;

/* =========================================================
 * האימונים של השבוע
 * ========================================================= */

function groupLabel(title) {
  const parts = String(title).split(/\s+[–—-]\s+/);

  return (parts.length > 1 ? parts.slice(1).join(" – ") : title).trim();
}

function kindOf(label) {
  if (/צעירה/.test(label)) return "young";
  if (/בוגרת/.test(label)) return "senior";
  if (/עתודה/.test(label)) return "reserve";

  return "other";
}

async function getSlotRows(dayOfWeek, time, db = pool) {
  const result = await db.query(
    `
      SELECT DISTINCT trainee_name AS name, group_label
      FROM trainee_training_slots
      WHERE branch = $1
        AND day_of_week = $2
        AND start_time = $3::TIME
        AND active = TRUE
      ORDER BY trainee_name
    `,
    [BRANCH_GALI_HADAR, dayOfWeek, time]
  );

  return result.rows;
}

function isTeamRow(row, time) {
  return time === TEAM_TIME && TEAM_LABELS.includes(row.group_label);
}

/*
 * כל האימונים בשבוע, לפי סניף, עם רשימת הילדים של כל אחד.
 */
async function getWeek(db = pool) {
  const branches = new Map();

  function branchOf(name) {
    if (!branches.has(name)) {
      branches.set(name, { name, sessions: [] });
    }

    return branches.get(name);
  }

  for (const day of WEEK_DAYS) {
    for (const session of await getSessionsForDay(day)) {
      const ref = session.ref;
      let members = [];
      let label = "";

      if (ref.startsWith("g:")) {
        members = session.trainees.map((t) => t.name);
        label = groupLabel(session.title);
      } else if (ref.startsWith("t:")) {
        label = ref.slice(2);
        members = (await getSlotRows(day, TEAM_TIME, db))
          .filter((row) => row.group_label === label)
          .map((row) => row.name);
        label = `נבחרת ${label}`;
      } else if (ref.startsWith("s:")) {
        const rows = (await getSlotRows(day, session.time, db)).filter(
          (row) => !isTeamRow(row, session.time)
        );

        members = rows.map((row) => row.name);

        const labels = [...new Set(rows.map((row) => row.group_label).filter(Boolean))]
          .filter((value) => value !== session.time);

        label = labels.join(" / ") || "אימון";
      }

      branchOf(session.branch || BRANCH_GALI_HADAR).sessions.push({
        id: `${ref}@${day}`,
        day,
        dayName: DAY_NAMES[day],
        time: session.time,
        label,
        kind: kindOf(label),
        members: [...new Set(members)].sort((a, b) => a.localeCompare(b, "he")),
      });
    }
  }

  return [...branches.values()]
    .map((branch) => ({
      ...branch,
      sessions: branch.sessions.sort(
        (a, b) =>
          a.day - b.day ||
          a.time.localeCompare(b.time) ||
          a.label.localeCompare(b.label, "he")
      ),
    }))
    .sort((a, b) =>
      a.name === BRANCH_GALI_HADAR ? -1 : b.name === BRANCH_GALI_HADAR ? 1 : a.name.localeCompare(b.name, "he")
    );
}

/* =========================================================
 * שינוי: הוספה / הורדה מאימון ביום מסוים
 * ========================================================= */

function parseSessionId(value) {
  const match = String(value || "").match(
    /^(g:(\d{1,18})|t:(צעירה|בוגרת)|s:(\d{2}:\d{2}))@([1-7])$/
  );

  if (!match) {
    return null;
  }

  return {
    type: match[1][0],
    groupId: match[2] || null,
    team: match[3] || null,
    time: match[4] || (match[3] ? TEAM_TIME : null),
    day: Number(match[5]),
  };
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

async function findGroup(groupId) {
  return (await attendance.getActiveGroups()).find(
    (group) => String(group.id) === String(groupId)
  );
}

function scheduleDays(group) {
  return [
    ...new Set(
      attendance.parseGroupSchedule(group.name).flatMap((segment) => segment.days)
    ),
  ];
}

async function setGroupDay({ group, name, day, on }, db = pool) {
  const days = scheduleDays(group);

  if (!days.includes(day)) {
    return false;
  }

  const existing = (
    await db.query(
      `SELECT id, active FROM trainees WHERE group_id = $1 AND name = $2`,
      [group.id, name]
    )
  ).rows[0];

  if (on) {
    if (existing?.active) {
      await db.query(
        `DELETE FROM trainee_day_exclusions WHERE trainee_id = $1 AND day_of_week = $2`,
        [existing.id, day]
      );

      return true;
    }

    /* ילד חדש בקבוצה — רק ביום הזה */
    const row = (
      await db.query(
        `
          INSERT INTO trainees (group_id, name, active)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (group_id, name)
          DO UPDATE SET active = TRUE, updated_at = NOW()
          RETURNING id
        `,
        [group.id, name]
      )
    ).rows[0];

    await db.query(`DELETE FROM trainee_day_exclusions WHERE trainee_id = $1`, [row.id]);

    for (const other of days.filter((value) => value !== day)) {
      await db.query(
        `INSERT INTO trainee_day_exclusions (trainee_id, day_of_week) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [row.id, other]
      );
    }

    return true;
  }

  if (!existing?.active) {
    return true;
  }

  const excluded = (
    await db.query(
      `SELECT day_of_week FROM trainee_day_exclusions WHERE trainee_id = $1`,
      [existing.id]
    )
  ).rows.map((row) => Number(row.day_of_week));

  const remaining = days.filter(
    (value) => value !== day && !excluded.includes(value)
  );

  if (remaining.length === 0) {
    /* לא נשאר אף יום — יוצא מהקבוצה */
    await db.query(
      `UPDATE trainees SET active = FALSE, updated_at = NOW() WHERE id = $1`,
      [existing.id]
    );
    await db.query(`DELETE FROM trainee_day_exclusions WHERE trainee_id = $1`, [existing.id]);
  } else {
    await db.query(
      `INSERT INTO trainee_day_exclusions (trainee_id, day_of_week) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [existing.id, day]
    );
  }

  return true;
}

async function setSlot({ name, day, time, label, on }, db = pool) {
  if (on) {
    await db.query(
      `
        INSERT INTO trainee_training_slots
          (trainee_name, branch, group_label, day_of_week, start_time, active)
        VALUES ($1, $2, $3, $4, $5::TIME, TRUE)
        ON CONFLICT (trainee_name, branch, day_of_week, start_time, group_label)
        DO UPDATE SET active = TRUE, updated_at = NOW()
      `,
      [name, BRANCH_GALI_HADAR, label, day, time]
    );

    return;
  }

  await db.query(
    `
      UPDATE trainee_training_slots
      SET active = FALSE, updated_at = NOW()
      WHERE trainee_name = $1
        AND branch = $2
        AND day_of_week = $3
        AND start_time = $4::TIME
        AND active = TRUE
        AND ($5::TEXT IS NULL OR group_label = $5)
        AND NOT ($6::BOOLEAN AND group_label = ANY($7::TEXT[]))
    `,
    [
      name,
      BRANCH_GALI_HADAR,
      day,
      time,
      label,
      /* מפגש לפי שעה ב-16:30 לא נוגע בשיבוצי הנבחרות */
      label === null && time === TEAM_TIME,
      TEAM_LABELS,
    ]
  );
}

/*
 * התווית לילד חדש במפגש לפי שעה: התווית הנפוצה באותו יום ושעה.
 */
async function slotLabelFor(day, time, db = pool) {
  const rows = (await getSlotRows(day, time, db)).filter(
    (row) => !isTeamRow(row, time)
  );

  const counts = new Map();

  rows.forEach((row) =>
    counts.set(row.group_label, (counts.get(row.group_label) || 0) + 1)
  );

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || time;
}

async function applyChange({ sessionId, name, on }, db = pool) {
  const session = parseSessionId(sessionId);
  const kid = cleanName(name);

  if (!session || !kid) {
    return { ok: false, error: "invalid" };
  }

  if (session.type === "g") {
    const group = await findGroup(session.groupId);

    if (!group || !(await setGroupDay({ group, name: kid, day: session.day, on: Boolean(on) }, db))) {
      return { ok: false, error: "not_found" };
    }

    return { ok: true, label: groupLabel(group.name), time: scheduleTime(group, session.day) };
  }

  if (session.type === "t") {
    await setSlot({ name: kid, day: session.day, time: TEAM_TIME, label: session.team, on: Boolean(on) }, db);

    return { ok: true, label: `נבחרת ${session.team}`, time: TEAM_TIME };
  }

  const label = on ? await slotLabelFor(session.day, session.time, db) : null;

  await setSlot({ name: kid, day: session.day, time: session.time, label, on: Boolean(on) }, db);

  return { ok: true, label: label && label !== session.time ? label : "", time: session.time };
}

function scheduleTime(group, day) {
  return (
    attendance
      .parseGroupSchedule(group.name)
      .find((segment) => segment.days.includes(day))?.start || ""
  );
}

/* =========================================================
 * עדכון למנהלים — מרוכז, דקה אחרי השינוי האחרון
 * ========================================================= */

const pending = new Map();

function describe(change) {
  return [change.label, `${DAY_NAMES[change.day]} ${change.time}`]
    .filter(Boolean)
    .join(", ");
}

function buildChangesMessage(actorName, changes) {
  /* מה השתנה בסוף: הוספה והורדה של אותו דבר מבטלות זו את זו */
  const net = new Map();

  for (const change of changes) {
    const key = `${change.name}|${change.sessionId}`;
    const entry = net.get(key);

    if (entry) {
      entry.last = change;
    } else {
      net.set(key, { first: change, last: change });
    }
  }

  const lines = [...net.values()]
    .filter(({ first, last }) => !(first !== last && first.on !== last.on))
    .map(({ last }) => `${last.on ? "➕" : "➖"} ${last.name} – ${describe(last)}`);

  if (!lines.length) {
    return null;
  }

  return [`🗂️ שינויים בקבוצות (ע״י ${actorName}):`, "", ...lines].join("\n");
}

async function flush(actorPhone) {
  const entry = pending.get(actorPhone);

  pending.delete(actorPhone);

  if (!entry) {
    return;
  }

  const message = buildChangesMessage(entry.actorName, entry.changes);

  if (message) {
    try {
      await sendToOtherManagers("", message);
    } catch (error) {
      console.error("❌ שליחת עדכון על שינויים בקבוצות נכשלה:", error.message);
    }
  }
}

function queueNotification(actor, change) {
  const entry = pending.get(actor.phone) || {
    actorName: actor.name,
    changes: [],
    timer: null,
  };

  entry.changes.push(change);
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => flush(actor.phone), NOTIFY_DELAY_MS);
  entry.timer.unref?.();

  pending.set(actor.phone, entry);
}

async function flushAllNotifications() {
  for (const phone of [...pending.keys()]) {
    clearTimeout(pending.get(phone)?.timer);
    await flush(phone);
  }
}

/* =========================================================
 * הקישור
 * ========================================================= */

async function getGroupsManagerLink(phone, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/g/${await getOrCreateStaffToken(phone)}`;
}

/* =========================================================
 * הדף
 * ========================================================= */

const STYLE = `
  :root{ --bg:#f3f6f4; --surface:#fff; --fg:#17251d; --muted:#5d6d63; --line:#d9e3dc; --brand:#0b5d3b; --soft:#e5f1ea; --ball:#c8e639;
    --young:#1f6fb2; --young-bg:#e3eef9; --senior:#7a3fb0; --senior-bg:#efe6f8; --reserve:#b35a00; --reserve-bg:#fdeedd; --other:#4b5b52; --other-bg:#eaefec; --bad:#b3402a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 Arial, "Segoe UI", sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:16px max(14px, env(safe-area-inset-right)) 70px max(14px, env(safe-area-inset-left)); display:flex; flex-direction:column; gap:14px; }
  header { display:flex; align-items:center; gap:12px; }
  .logo { width:68px; height:auto; flex-shrink:0; }
  h1 { margin:0; font-size:24px; color:var(--brand); }
  .sub { margin:2px 0 0; color:var(--muted); font-size:14px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .seg { display:flex; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:3px; gap:3px; flex-wrap:wrap; }
  .seg button { border:0; background:transparent; color:var(--muted); font:inherit; font-weight:700; padding:7px 14px; border-radius:8px; cursor:pointer; }
  .seg button[aria-pressed="true"] { background:var(--brand); color:#fff; }
  input[type=search], select, input[type=text] { font:inherit; font-size:16px; padding:9px 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--fg); }
  input[type=search] { flex:1 1 220px; min-width:0; }
  .list { display:flex; flex-direction:column; gap:8px; }
  .kid { background:var(--surface); border:1px solid var(--line); border-radius:12px; }
  .kid > button.head { all:unset; box-sizing:border-box; display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%; padding:12px 14px; cursor:pointer; }
  .kid > button.head:focus-visible { outline:3px solid var(--ball); border-radius:12px; }
  .name { font-weight:700; font-size:17px; }
  .summary { color:var(--muted); font-size:13px; margin-top:2px; }
  .chev { color:var(--muted); font-size:18px; transition:transform .15s; }
  .kid.open .chev { transform:rotate(-90deg); }
  .week { display:none; padding:0 14px 14px; gap:10px; flex-direction:column; }
  .kid.open .week { display:flex; }
  .day { display:grid; grid-template-columns:62px 1fr; gap:8px; align-items:start; }
  .day b { font-size:14px; padding-top:7px; }
  .slots { display:flex; flex-wrap:wrap; gap:6px; }
  .slot { font:inherit; font-size:14px; border:1.5px dashed var(--line); background:transparent; color:var(--muted); border-radius:999px; padding:6px 12px; cursor:pointer; }
  .slot.on { border-style:solid; font-weight:700; }
  .slot.on.young { background:var(--young-bg); border-color:var(--young); color:var(--young); }
  .slot.on.senior { background:var(--senior-bg); border-color:var(--senior); color:var(--senior); }
  .slot.on.reserve { background:var(--reserve-bg); border-color:var(--reserve); color:var(--reserve); }
  .slot.on.other { background:var(--other-bg); border-color:var(--other); color:var(--other); }
  .slot:disabled { opacity:.5; cursor:wait; }
  .slot:focus-visible { outline:3px solid var(--ball); outline-offset:1px; }
  .legend { display:flex; gap:12px; flex-wrap:wrap; font-size:13px; color:var(--muted); }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-inline-end:4px; vertical-align:middle; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
  .members { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
  .members li { display:flex; justify-content:space-between; align-items:center; padding:8px 2px; border-bottom:1px solid var(--line); }
  .members li:last-child { border-bottom:0; }
  .x { border:0; background:transparent; color:var(--bad); font:inherit; font-size:14px; cursor:pointer; padding:4px 8px; }
  .add { display:flex; gap:8px; }
  .add input { flex:1; min-width:0; }
  .primary { background:var(--brand); color:#fff; border:0; border-radius:10px; padding:9px 16px; font:inherit; font-weight:700; cursor:pointer; }
  .toast { position:fixed; bottom:max(16px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); background:var(--brand); color:#fff; padding:10px 16px; border-radius:12px; font-size:14px; font-weight:700; max-width:calc(100% - 32px); box-shadow:0 6px 20px rgba(0,0,0,.18); }
  .toast.err { background:var(--bad); }
  .hint { color:var(--muted); font-size:14px; margin:0; }
  .empty { color:var(--muted); text-align:center; padding:20px; }
  footer { color:var(--muted); font-size:13px; text-align:center; }
  [hidden] { display:none !important; }
  @media (prefers-reduced-motion:reduce) { .chev { transition:none; } }
`;

const SCRIPT = `
(function () {
  var DATA = JSON.parse(document.getElementById("data").textContent);
  var DAYS = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var base = location.pathname.replace(/\\/+$/, "");
  var branchIndex = 0, openKid = null, toastTimer;

  function el(id) { return document.getElementById(id); }
  function branch() { return DATA[branchIndex]; }
  function byId(id) { return branch().sessions.find(function (s) { return s.id === id; }); }
  function chipText(s) { return s.time + " " + s.label; }
  function sessionName(s) { return DAYS[s.day] + " " + s.time + " · " + s.label; }

  function kids() {
    var set = {};
    branch().sessions.forEach(function (s) { s.members.forEach(function (n) { set[n] = true; }); });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "he"); });
  }

  function toast(text, isError) {
    var t = el("toast");
    t.textContent = text;
    t.className = "toast" + (isError ? " err" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 5000 : 2600);
  }

  function summary(name) {
    var by = {}, order = [];
    branch().sessions.forEach(function (s) {
      if (s.members.indexOf(name) === -1) return;
      if (!by[s.label]) { by[s.label] = []; order.push(s.label); }
      if (by[s.label].indexOf(DAYS[s.day]) === -1) by[s.label].push(DAYS[s.day]);
    });
    return order.map(function (l) { return l + ": " + by[l].join(", "); }).join(" · ") || "לא רשום לאף אימון";
  }

  function change(sessionId, name, on, button) {
    var s = byId(sessionId);
    if (button) button.disabled = true;
    return fetch(base + "/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, name: name, on: on })
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }).then(function () {
      if (on) { if (s.members.indexOf(name) === -1) s.members.push(name); }
      else { s.members = s.members.filter(function (n) { return n !== name; }); }
      toast("✓ " + name + (on ? " נוסף/ה ל" : " הוסר/ה מ") + sessionName(s));
      render();
    }).catch(function () {
      if (button) button.disabled = false;
      toast("השינוי לא נשמר. בדקו חיבור ונסו שוב.", true);
    });
  }

  function renderBranches() {
    var box = el("branches");
    box.innerHTML = "";
    if (DATA.length < 2) { box.hidden = true; return; }
    DATA.forEach(function (b, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.name.split(" – ")[0];
      btn.setAttribute("aria-pressed", String(i === branchIndex));
      btn.onclick = function () { branchIndex = i; openKid = null; el("slot-pick").innerHTML = ""; render(); };
      box.appendChild(btn);
    });
  }

  function renderKids() {
    var q = el("q").value.trim();
    var box = el("kids");
    box.innerHTML = "";
    var list = kids().filter(function (n) { return !q || n.indexOf(q) !== -1; });
    if (!list.length) { box.innerHTML = '<div class="empty">לא נמצאו ילדים</div>'; return; }
    var days = [];
    branch().sessions.forEach(function (s) { if (days.indexOf(s.day) === -1) days.push(s.day); });

    list.forEach(function (name) {
      var card = document.createElement("div");
      card.className = "kid" + (name === openKid ? " open" : "");
      var head = document.createElement("button");
      head.type = "button";
      head.className = "head";
      head.setAttribute("aria-expanded", String(name === openKid));
      head.innerHTML = '<span><div class="name"></div><div class="summary"></div></span><span class="chev">‹</span>';
      head.querySelector(".name").textContent = name;
      head.querySelector(".summary").textContent = summary(name);
      head.onclick = function () { openKid = openKid === name ? null : name; renderKids(); };
      card.appendChild(head);

      if (name === openKid) {
        var week = document.createElement("div");
        week.className = "week";
        days.forEach(function (day) {
          var row = document.createElement("div");
          row.className = "day";
          row.innerHTML = "<b>" + DAYS[day] + "</b><div class='slots'></div>";
          branch().sessions.filter(function (s) { return s.day === day; }).forEach(function (s) {
            var on = s.members.indexOf(name) !== -1;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "slot " + s.kind + (on ? " on" : "");
            b.textContent = chipText(s);
            b.setAttribute("aria-pressed", String(on));
            b.setAttribute("aria-label", sessionName(s) + " — " + (on ? "רשום" : "לא רשום"));
            b.onclick = function () { change(s.id, name, !on, b); };
            row.querySelector(".slots").appendChild(b);
          });
          week.appendChild(row);
        });
        card.appendChild(week);
      }
      box.appendChild(card);
    });
  }

  function renderSlot() {
    var pick = el("slot-pick");
    if (!pick.options.length) {
      branch().sessions.forEach(function (s) {
        var o = document.createElement("option");
        o.value = s.id;
        o.textContent = sessionName(s) + " (" + s.members.length + ")";
        pick.appendChild(o);
      });
    }
    var s = byId(pick.value) || branch().sessions[0];
    var ul = el("members");
    ul.innerHTML = "";
    if (!s) return;
    if (!s.members.length) ul.innerHTML = '<li class="hint">אין ילדים באימון הזה</li>';
    s.members.slice().sort(function (a, b) { return a.localeCompare(b, "he"); }).forEach(function (n) {
      var li = document.createElement("li");
      li.innerHTML = '<span></span><button class="x" type="button">הסר ✕</button>';
      li.querySelector("span").textContent = n;
      li.querySelector("button").onclick = function (e) { change(s.id, n, false, e.target); };
      ul.appendChild(li);
    });
    el("all-kids").innerHTML = "";
    kids().forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      el("all-kids").appendChild(o);
    });
  }

  function render() {
    renderBranches();
    el("branch-name").textContent = branch() ? branch().name : "";
    if (!branch()) return;
    renderKids();
    var current = el("slot-pick").value;
    el("slot-pick").innerHTML = "";
    renderSlot();
    if (current && byId(current)) { el("slot-pick").value = current; renderSlot(); }
  }

  function view(kind) {
    el("by-kid").hidden = kind !== "kid";
    el("by-slot").hidden = kind !== "slot";
    el("v-kid").setAttribute("aria-pressed", String(kind === "kid"));
    el("v-slot").setAttribute("aria-pressed", String(kind === "slot"));
  }

  el("q").oninput = renderKids;
  el("slot-pick").onchange = renderSlot;
  el("v-kid").onclick = function () { view("kid"); };
  el("v-slot").onclick = function () { view("slot"); };
  el("add-form").onsubmit = function (e) {
    e.preventDefault();
    var name = el("add-name").value.trim();
    if (!name) return;
    change(el("slot-pick").value, name, true).then(function () { el("add-name").value = ""; });
  };

  if (!DATA.length) {
    el("kids").innerHTML = '<div class="empty">אין עדיין קבוצות פעילות</div>';
    return;
  }
  render();
})();
`;

function renderPage({ staff, week }) {
  const data = JSON.stringify(week).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>ניהול קבוצות</title>
<link rel="icon" type="image/png" href="/logo.png">
<style>${STYLE}</style>
</head>
<body><div class="wrap">
  <header>
    <img class="logo" src="/logo.png" alt="האקדמיה לטניס גלי הדר" width="68">
    <div>
      <h1>ניהול קבוצות</h1>
      <p class="sub"><span id="branch-name"></span> · שלום ${escapeHtml(staff.name)}</p>
    </div>
  </header>

  <div class="row">
    <div class="seg" role="group" aria-label="תצוגה">
      <button type="button" id="v-kid" aria-pressed="true">לפי ילד</button>
      <button type="button" id="v-slot" aria-pressed="false">לפי אימון</button>
    </div>
    <div class="seg" role="group" aria-label="סניף" id="branches"></div>
  </div>

  <section id="by-kid">
    <div class="row"><input type="search" id="q" placeholder="חיפוש ילד…" aria-label="חיפוש ילד"></div>
    <div class="legend" style="margin-top:8px">
      <span><i class="dot" style="background:var(--young)"></i>נבחרת צעירה</span>
      <span><i class="dot" style="background:var(--senior)"></i>נבחרת בוגרת</span>
      <span><i class="dot" style="background:var(--reserve)"></i>עתודה</span>
      <span><i class="dot" style="background:var(--other)"></i>קבוצות אחרות</span>
    </div>
    <p class="hint" style="margin-top:6px">לוחצים על ילד, ואז על אימון כדי להוסיף או להוריד — רק מאותו יום. מלא = רשום, מקווקו = לא רשום.</p>
    <div class="list" id="kids" style="margin-top:10px"></div>
  </section>

  <section id="by-slot" hidden>
    <div class="card">
      <label for="slot-pick" class="sub">בחרו אימון:</label>
      <select id="slot-pick"></select>
      <ul class="members" id="members"></ul>
      <form class="add" id="add-form">
        <input type="text" id="add-name" list="all-kids" placeholder="הוספת ילד לאימון…" aria-label="שם ילד" maxlength="${MAX_NAME}">
        <datalist id="all-kids"></datalist>
        <button class="primary" type="submit">הוסף</button>
      </form>
    </div>
  </section>

  <p class="hint">כל שינוי נשמר מיד ומופיע בדף הדיווח של המאמנים. המנהלים מקבלים עדכון בוואטסאפ דקה אחרי השינוי האחרון.</p>
  <footer>הקישור הזה אישי — לא להעביר אותו הלאה.</footer>
  <div class="toast" id="toast" hidden></div>
</div>
<script type="application/json" id="data">${data}</script>
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

  res.status(200).type("html").send(renderPage({ staff, week: await getWeek() }));
}

async function handleChange(req, res) {
  const staff = await withManager(req, res);

  if (!staff) {
    return;
  }

  const sessionId = String(req.body?.sessionId || "");
  const name = cleanName(req.body?.name);
  const on = Boolean(req.body?.on);
  const result = await applyChange({ sessionId, name, on });

  if (!result.ok) {
    res.status(400).json({ ok: false });
    return;
  }

  queueNotification(staff, {
    sessionId,
    name,
    on,
    day: parseSessionId(sessionId).day,
    time: result.time,
    label: result.label,
  });

  res.json({ ok: true });
}

module.exports = {
  getWeek,
  parseSessionId,
  applyChange,
  buildChangesMessage,
  queueNotification,
  flushAllNotifications,
  getGroupsManagerLink,
  renderPage,
  handlePage,
  handleChange,
};
