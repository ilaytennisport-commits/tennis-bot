const crypto = require("crypto");

const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  sendToOtherManagers,
  buildManagerAttendanceMessage,
} = require("./staffNotifyService");

const {
  getPublicBaseUrl,
  escapeHtml,
} = require("./attendanceViewService");

/*
 * =========================================================
 * דף דיווח נוכחות למדריכים
 * =========================================================
 *
 * כל איש צוות מקבל קישור אישי ("קישור" ב-WhatsApp).
 * בדף: האימונים של היום → רשימת הילדים בקבוצה →
 * מסמנים "הגיע" / "לא הגיע" לכל ילד → שומרים.
 *
 * השמירה משתמשת באותה פונקציה כמו דיווח ב-WhatsApp
 * (recordAttendance), והמנהלים מקבלים את אותו עדכון.
 */

const TEAM_LABELS = ["צעירה", "בוגרת"];
const TEAM_START_TIME = "16:30";

const DAY_NAMES = {
  1: "ראשון",
  2: "שני",
  3: "שלישי",
  4: "רביעי",
  5: "חמישי",
  6: "שישי",
  7: "שבת",
};

/* =========================================================
 * קישור אישי
 * ========================================================= */

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isStaffPhone(phone) {
  return (
    attendance.isManagerPhone(phone) ||
    attendance.isCoachPhone(phone)
  );
}

async function getOrCreateStaffToken(phone, db = pool) {
  const normalized = attendance.normalizePhone(phone);

  const existing = await db.query(
    `SELECT token FROM staff_links WHERE phone = $1`,
    [normalized]
  );

  if (existing.rows[0]) {
    return existing.rows[0].token;
  }

  const token = generateToken();

  await db.query(
    `
      INSERT INTO staff_links (phone, token)
      VALUES ($1, $2)
      ON CONFLICT (phone) DO NOTHING
    `,
    [normalized, token]
  );

  const saved = await db.query(
    `SELECT token FROM staff_links WHERE phone = $1`,
    [normalized]
  );

  return saved.rows[0].token;
}

async function rotateStaffToken(phone, db = pool) {
  const normalized = attendance.normalizePhone(phone);
  const token = generateToken();

  await db.query(
    `
      INSERT INTO staff_links (phone, token)
      VALUES ($1, $2)
      ON CONFLICT (phone)
      DO UPDATE SET token = EXCLUDED.token, created_at = NOW()
    `,
    [normalized, token]
  );

  return token;
}

/*
 * מחזיר את איש הצוות לפי הקוד שבקישור —
 * רק אם הוא עדיין מוגדר כמנהל או מאמן.
 */
async function resolveStaffByToken(token, db = pool) {
  if (!token || !/^[a-f0-9]{48}$/.test(String(token))) {
    return null;
  }

  const result = await db.query(
    `SELECT phone, token FROM staff_links WHERE token = $1`,
    [String(token)]
  );

  const row = result.rows[0];

  if (
    !row ||
    !crypto.timingSafeEqual(
      Buffer.from(row.token),
      Buffer.from(String(token))
    ) ||
    !isStaffPhone(row.phone)
  ) {
    return null;
  }

  return {
    phone: row.phone,
    name: attendance.getStaffName(row.phone),
    isManager: attendance.isManagerPhone(row.phone),
  };
}

async function getStaffReportLink(phone, fallbackHost = null) {
  const baseUrl = getPublicBaseUrl(fallbackHost);

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/report/${await getOrCreateStaffToken(phone)}`;
}

/* =========================================================
 * תאריכים: היום ואתמול
 * ========================================================= */

function getAllowedDates(now = new Date()) {
  const today = attendance.getIsraelDateString(0, now);
  const yesterday = attendance.getIsraelDateString(-1, now);

  return [
    { value: today, label: "היום" },
    { value: yesterday, label: "אתמול" },
  ];
}

function pickDate(value, now = new Date()) {
  const allowed = getAllowedDates(now);

  return (
    allowed.find((item) => item.value === value) ||
    allowed[0]
  ).value;
}

function dayOfWeekOf(dateString) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  return (
    new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() +
    1
  );
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");

  return `${day}/${month}/${year}`;
}

/* =========================================================
 * האימונים של יום מסוים
 * ========================================================= */

async function getSlotTimesForDay(dayOfWeek, db = pool) {
  const result = await db.query(
    `
      SELECT DISTINCT
        start_time::TEXT AS start_time,
        group_label
      FROM trainee_training_slots
      WHERE
        branch = $1
        AND day_of_week = $2
        AND active = TRUE
    `,
    ["גלי הדר – ראשון לציון", dayOfWeek]
  );

  /*
   * "17:00:00" → "17:00"
   */
  return result.rows.map((row) => ({
    ...row,
    start_time: String(row.start_time).slice(0, 5),
  }));
}

/*
 * מחזיר רשימת אימונים ליום — כל אחד עם ref שמזהה אותו:
 * g:<id>   קבוצה רגילה
 * t:<שם>   נבחרת (צעירה / בוגרת)
 * s:<שעה>  מפגש בגלי הדר לפי יום ושעה
 */
async function getSessionsForDate(dateString) {
  const dayOfWeek = dayOfWeekOf(dateString);
  const groups = await attendance.getActiveGroups();

  const sessions = [];
  const coveredGaliHadarTimes = new Set();

  for (const group of groups) {
    if (attendance.getTeamLabelFromGroupName(group.name)) {
      continue;
    }

    const segment = attendance
      .parseGroupSchedule(group.name)
      .find((item) => item.days.includes(dayOfWeek));

    if (!segment) {
      continue;
    }

    const trainees =
      await attendance.getActiveTraineesByGroupId(group.id);

    if (trainees.length === 0) {
      continue;
    }

    if (String(group.branch || "").includes("גלי הדר")) {
      coveredGaliHadarTimes.add(segment.start);
    }

    sessions.push({
      ref: `g:${group.id}`,
      time: segment.start,
      title: group.name,
      branch: group.branch || "",
      count: trainees.length,
    });
  }

  const slotRows = await getSlotTimesForDay(dayOfWeek);

  for (const label of TEAM_LABELS) {
    if (
      slotRows.some(
        (row) =>
          row.group_label === label &&
          row.start_time === TEAM_START_TIME
      )
    ) {
      sessions.push({
        ref: `t:${label}`,
        time: TEAM_START_TIME,
        title: `נבחרת ${label}`,
        branch: "גלי הדר – ראשון לציון",
      });
    }
  }

  const slotTimes = new Set(
    slotRows
      .filter(
        (row) =>
          !(
            TEAM_LABELS.includes(row.group_label) &&
            row.start_time === TEAM_START_TIME
          )
      )
      .map((row) => row.start_time)
  );

  for (const time of slotTimes) {
    if (coveredGaliHadarTimes.has(time)) {
      continue;
    }

    sessions.push({
      ref: `s:${time}`,
      time,
      title: `גלי הדר – ${DAY_NAMES[dayOfWeek]} ${time}`,
      branch: "גלי הדר – ראשון לציון",
    });
  }

  return sessions.sort(
    (a, b) =>
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title, "he")
  );
}

/*
 * כל הקבוצות — לבחירה ידנית ("קבוצה אחרת").
 */
async function getAllSessionChoices(dateString) {
  const groups = await attendance.getActiveGroups();
  const dayOfWeek = dayOfWeekOf(dateString);

  const choices = groups
    .filter(
      (group) =>
        !attendance.getTeamLabelFromGroupName(group.name)
    )
    .map((group) => ({
      ref: `g:${group.id}`,
      title: group.name,
      branch: group.branch || "",
    }));

  for (const label of TEAM_LABELS) {
    choices.push({
      ref: `t:${label}`,
      title: `נבחרת ${label}`,
      branch: "גלי הדר – ראשון לציון",
    });
  }

  /*
   * מפגשי גלי הדר לפי שיבוצים ביום הזה — גם כשבאותה שעה יש
   * קבוצה רגילה, כדי שאף רשימה לא תהיה בלתי נגישה.
   */
  const slotTimes = [
    ...new Set(
      (await getSlotTimesForDay(dayOfWeek))
        .filter(
          (row) =>
            !(
              TEAM_LABELS.includes(row.group_label) &&
              row.start_time === TEAM_START_TIME
            )
        )
        .map((row) => row.start_time)
    ),
  ].sort();

  for (const time of slotTimes) {
    choices.push({
      ref: `s:${time}`,
      title: `גלי הדר – ${DAY_NAMES[dayOfWeek]} ${time} (לפי שיבוצים)`,
      branch: "גלי הדר – ראשון לציון",
    });
  }

  return choices;
}

/*
 * הופך ref לקבוצה + רשימת מתאמנים.
 */
async function resolveSessionRef(ref, dateString) {
  const dayOfWeek = dayOfWeekOf(dateString);
  const value = String(ref || "");

  let match = value.match(/^g:(\d+)$/);

  if (match) {
    const group = (await attendance.getActiveGroups()).find(
      (item) => String(item.id) === match[1]
    );

    if (!group) {
      return null;
    }

    const teamLabel =
      attendance.getTeamLabelFromGroupName(group.name);

    if (teamLabel) {
      return resolveSessionRef(`t:${teamLabel}`, dateString);
    }

    return {
      group,
      title: group.name,
      trainees:
        await attendance.getActiveTraineesByGroupId(group.id),
      slot: null,
      teamContext: null,
    };
  }

  match = value.match(/^t:(צעירה|בוגרת)$/);

  if (match) {
    const teamContext =
      await attendance.ensureGaliHadarTeamAttendanceGroup({
        teamLabel: match[1],
        dayOfWeek,
      });

    return {
      group: teamContext.group,
      title: `נבחרת ${match[1]} – ${teamContext.dayName}`,
      trainees: await attendance.getActiveTraineesByGroupId(
        teamContext.group.id
      ),
      slot: null,
      teamContext,
    };
  }

  match = value.match(/^s:(\d{2}:\d{2})$/);

  if (match) {
    const slot = {
      branch: "גלי הדר – ראשון לציון",
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      startTime: match[1],
      displayName: `${DAY_NAMES[dayOfWeek]} ${match[1]}`,
    };

    const group =
      await attendance.ensureGaliHadarAttendanceGroup(slot);

    return {
      group,
      title: `גלי הדר – ${slot.displayName}`,
      trainees:
        await attendance.getActiveTraineesByGroupId(group.id),
      slot,
      teamContext: null,
    };
  }

  return null;
}

/*
 * דיווח קיים לאותה קבוצה ואותו תאריך (כדי להציג ולתקן).
 */
async function getExistingReport(groupId, dateString, db = pool) {
  const result = await db.query(
    `
      SELECT
        r.trainee_id,
        r.status,
        s.submitted_by
      FROM attendance_sessions s
      JOIN attendance_records r
        ON r.session_id = s.id
      WHERE s.group_id = $1
        AND s.session_date = $2::DATE
    `,
    [groupId, dateString]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    submittedBy: result.rows[0].submitted_by,
    statuses: new Map(
      result.rows.map((row) => [
        String(row.trainee_id),
        row.status,
      ])
    ),
  };
}

/* =========================================================
 * שמירה
 * ========================================================= */

async function saveReport({
  staff,
  ref,
  dateString,
  marks,
}) {
  const session = await resolveSessionRef(ref, dateString);

  if (!session) {
    return {
      success: false,
      message: "הקבוצה לא נמצאה. חזרו לרשימת האימונים ונסו שוב.",
    };
  }

  if (session.trainees.length === 0) {
    return {
      success: false,
      message: "אין מתאמנים פעילים בקבוצה הזו.",
    };
  }

  const matchedTrainees = session.trainees.filter(
    (trainee) => marks[String(trainee.id)] === "present"
  );

  const result = await attendance.recordAttendance({
    group: session.group,
    trainees: session.trainees,
    matchedTrainees,
    slot: session.slot,
    teamContext: session.teamContext,
    sessionDate: dateString,
    submittedByPhone: staff.phone,
  });

  try {
    await sendToOtherManagers(
      staff.phone,
      buildManagerAttendanceMessage(result)
    );
  } catch (error) {
    console.error(
      "❌ עדכון מנהלים על דיווח מהדף נכשל:",
      error.message
    );
  }

  return {
    ...result,
    title: session.title,
  };
}

/* =========================================================
 * HTML
 * ========================================================= */

const STYLE = `
  :root { --brand:#0b5d3b; --soft:#e5f1ea; --bg:#f4f7f5; --border:#dfe7e2; --muted:#6b7a87;
          --yes:#17a34a; --yes-soft:#e3f4e8; --no:#dc2626; --no-soft:#fbe4e4; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:#1f2933; font:17px/1.45 "Segoe UI", Arial, sans-serif; }
  .wrap { max-width:640px; margin:0 auto; padding:14px 14px 200px; }
  h1 { font-size:22px; color:var(--brand); margin:4px 0 2px; }
  .sub { color:var(--muted); font-size:14px; margin-bottom:12px; }
  .tabs { display:flex; gap:8px; margin:10px 0 14px; }
  .tabs a { flex:1; text-align:center; padding:10px; border-radius:10px; border:2px solid var(--border);
            background:#fff; color:#1f2933; text-decoration:none; font-weight:700; }
  .tabs a.on { border-color:var(--brand); background:var(--soft); color:var(--brand); }
  .session { display:flex; align-items:center; gap:12px; background:#fff; border:2px solid var(--border);
             border-radius:14px; padding:14px; margin:10px 0; text-decoration:none; color:#1f2933; }
  .session .time { font-size:22px; font-weight:800; color:var(--brand); min-width:64px; text-align:center; }
  .session .title { font-weight:700; display:block; }
  .session .branch { color:var(--muted); font-size:13px; }
  .session .go { margin-right:auto; font-size:22px; color:var(--brand); }
  .empty { background:#fff; border-radius:14px; padding:22px; text-align:center; color:var(--muted); }
  details { margin-top:18px; background:#fff; border-radius:12px; padding:10px 14px; border:1px solid var(--border); }
  summary { font-weight:700; cursor:pointer; }
  select, .btn { width:100%; font-size:17px; padding:12px; border-radius:10px; border:2px solid var(--border); margin-top:8px; }
  .btn { background:var(--brand); color:#fff; border-color:var(--brand); font-weight:800; }
  .back { display:inline-block; margin:6px 0 4px; color:var(--brand); text-decoration:none; font-weight:700; }
  .note { background:#fff6d6; border-radius:10px; padding:10px 12px; font-size:14px; margin:8px 0; }
  .kid { background:#fff; border:2px solid var(--border); border-radius:14px; padding:10px 12px; margin:10px 0; }
  .kid .name { font-weight:800; font-size:18px; margin-bottom:8px; }
  .choices { display:flex; gap:8px; }
  .choices input { position:absolute; opacity:0; pointer-events:none; }
  .choices label { flex:1; text-align:center; padding:12px 6px; border-radius:10px; border:2px solid var(--border);
                   font-weight:800; cursor:pointer; user-select:none; background:#fafbfa; color:var(--muted); }
  .choices input.yes:checked + label { background:var(--yes-soft); border-color:var(--yes); color:var(--yes); }
  .choices input.no:checked + label { background:var(--no-soft); border-color:var(--no); color:var(--no); }
  .kid.unmarked { border-color:#f59e0b; }
  .bar { position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1px solid var(--border);
         padding:10px 14px calc(10px + env(safe-area-inset-bottom)); }
  .bar .inner { max-width:640px; margin:0 auto; }
  .count { text-align:center; font-size:14px; color:var(--muted); margin-bottom:6px; }
  .quick { background:#fff; color:var(--brand); border:2px solid var(--brand); }
  .done { background:#fff; border-radius:14px; padding:20px; text-align:center; }
  .done .big { font-size:46px; }
  .list { text-align:right; margin-top:12px; }
`;

function page(title, body) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

function renderHome({ staff, token, dateString, sessions, allChoices, now }) {
  const tabs = getAllowedDates(now)
    .map(
      (item) =>
        `<a class="${item.value === dateString ? "on" : ""}" href="/report/${token}?date=${item.value}">${item.label}</a>`
    )
    .join("");

  const list =
    sessions.length > 0
      ? sessions
          .map(
            (session) =>
              `<a class="session" href="/report/${token}/session?ref=${encodeURIComponent(session.ref)}&date=${dateString}">
                <span class="time">${escapeHtml(session.time)}</span>
                <span><span class="title">${escapeHtml(session.title)}</span><span class="branch">${escapeHtml(session.branch)}</span></span>
                <span class="go">‹</span>
              </a>`
          )
          .join("")
      : `<div class="empty">אין אימונים ביום ${escapeHtml(DAY_NAMES[dayOfWeekOf(dateString)])}.<br>אפשר לבחור קבוצה למטה.</div>`;

  const options = allChoices
    .map(
      (choice) =>
        `<option value="${escapeHtml(choice.ref)}">${escapeHtml(choice.title)}</option>`
    )
    .join("");

  return page(
    "דיווח נוכחות",
    `<h1>📋 דיווח נוכחות</h1>
     <div class="sub">שלום ${escapeHtml(staff.name)} · ${escapeHtml(DAY_NAMES[dayOfWeekOf(dateString)])} ${formatDate(dateString)}</div>
     <div class="tabs">${tabs}</div>
     <div class="sub">בחרו את האימון:</div>
     ${list}
     <details>
       <summary>קבוצה אחרת</summary>
       <form method="get" action="/report/${token}/session">
         <input type="hidden" name="date" value="${dateString}">
         <select name="ref">${options}</select>
         <button class="btn" type="submit">המשך</button>
       </form>
     </details>`
  );
}

function renderRoster({ token, dateString, ref, session, existing }) {
  const kids = session.trainees
    .map((trainee) => {
      const id = String(trainee.id);
      const status = existing?.statuses.get(id) || "";

      return `<div class="kid${status ? "" : " unmarked"}" data-kid>
        <div class="name">${escapeHtml(trainee.name)}</div>
        <div class="choices">
          <input class="yes" type="radio" id="y${id}" name="t_${id}" value="present"${status === "present" ? " checked" : ""}>
          <label for="y${id}">✔ הגיע</label>
          <input class="no" type="radio" id="n${id}" name="t_${id}" value="absent"${status === "absent" ? " checked" : ""}>
          <label for="n${id}">✘ לא הגיע</label>
        </div>
      </div>`;
    })
    .join("");

  const already = existing
    ? `<div class="note">✏️ כבר דווח על האימון הזה (על ידי ${escapeHtml(existing.submittedBy || "צוות")}). אפשר לתקן ולשמור שוב — הדיווח החדש יחליף את הקודם.</div>`
    : "";

  return page(
    session.title,
    `<a class="back" href="/report/${token}?date=${dateString}">→ חזרה לאימונים</a>
     <h1>${escapeHtml(session.title)}</h1>
     <div class="sub">${escapeHtml(DAY_NAMES[dayOfWeekOf(dateString)])} ${formatDate(dateString)} · ${session.trainees.length} מתאמנים</div>
     ${already}
     <form method="post" action="/report/${token}/save" id="f">
       <input type="hidden" name="ref" value="${escapeHtml(ref)}">
       <input type="hidden" name="date" value="${dateString}">
       ${kids || '<div class="empty">אין מתאמנים פעילים בקבוצה הזו.</div>'}
       <div class="bar"><div class="inner">
         <div class="count" id="count"></div>
         <button class="btn quick" type="button" id="all">✔ כולם הגיעו</button>
         <button class="btn" type="submit">💾 שמירת נוכחות</button>
       </div></div>
     </form>
     <script>
       (function () {
         var form = document.getElementById("f");
         var kids = Array.prototype.slice.call(document.querySelectorAll("[data-kid]"));
         function update() {
           var marked = 0, present = 0;
           kids.forEach(function (kid) {
             var yes = kid.querySelector("input.yes").checked;
             var no = kid.querySelector("input.no").checked;
             if (yes || no) marked++;
             if (yes) present++;
             kid.classList.toggle("unmarked", !(yes || no));
           });
           document.getElementById("count").textContent =
             "סומנו " + marked + " מתוך " + kids.length + " · הגיעו " + present;
         }
         form.addEventListener("change", update);
         document.getElementById("all").addEventListener("click", function () {
           kids.forEach(function (kid) { kid.querySelector("input.yes").checked = true; });
           update();
         });
         form.addEventListener("submit", function (event) {
           var missing = kids.filter(function (kid) {
             return !kid.querySelector("input.yes").checked && !kid.querySelector("input.no").checked;
           }).length;
           if (missing > 0 && !window.confirm(missing + " ילדים לא סומנו. הם יירשמו כ'לא הגיע'. לשמור?")) {
             event.preventDefault();
           }
         });
         update();
       })();
     </script>`
  );
}

function renderSaved({ token, dateString, result }) {
  const absent = result.absent.length
    ? result.absent.map((trainee) => `❌ ${escapeHtml(trainee.name)}`).join("<br>")
    : "✅ כולם הגיעו";

  return page(
    "הנוכחות נשמרה",
    `<div class="done">
       <div class="big">✅</div>
       <h1>הנוכחות נשמרה</h1>
       <div class="sub">${escapeHtml(result.title)} · ${formatDate(dateString)}</div>
       <p><b>הגיעו: ${result.presentCount} מתוך ${result.total}</b></p>
       <div class="list"><b>לא הגיעו:</b><br>${absent}</div>
       <p class="sub">המנהלים קיבלו עדכון.</p>
     </div>
     <a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:14px" href="/report/${token}?date=${dateString}">חזרה לאימונים</a>`
  );
}

function renderError(token, message) {
  return page(
    "שגיאה",
    `<div class="empty">⚠️ ${escapeHtml(message)}</div>
     ${token ? `<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:14px" href="/report/${token}">חזרה</a>` : ""}`
  );
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

async function withStaff(req, res) {
  setPrivateHeaders(res);

  const staff = await resolveStaffByToken(req.params.token);

  if (!staff) {
    res.status(404).send("Not found");
    return null;
  }

  return staff;
}

async function handleHome(req, res) {
  const staff = await withStaff(req, res);

  if (!staff) {
    return;
  }

  const dateString = pickDate(req.query?.date);

  res.status(200).type("html").send(
    renderHome({
      staff,
      token: req.params.token,
      dateString,
      sessions: await getSessionsForDate(dateString),
      allChoices: await getAllSessionChoices(dateString),
    })
  );
}

async function handleSession(req, res) {
  const staff = await withStaff(req, res);

  if (!staff) {
    return;
  }

  const dateString = pickDate(req.query?.date);
  const ref = String(req.query?.ref || "");
  const session = await resolveSessionRef(ref, dateString);

  if (!session) {
    res
      .status(200)
      .type("html")
      .send(renderError(req.params.token, "הקבוצה לא נמצאה."));
    return;
  }

  res.status(200).type("html").send(
    renderRoster({
      token: req.params.token,
      dateString,
      ref,
      session,
      existing: await getExistingReport(
        session.group.id,
        dateString
      ),
    })
  );
}

async function handleSave(req, res) {
  const staff = await withStaff(req, res);

  if (!staff) {
    return;
  }

  const body = req.body || {};
  const dateString = pickDate(body.date);

  const marks = {};

  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^t_(\d+)$/);

    if (match && (value === "present" || value === "absent")) {
      marks[match[1]] = value;
    }
  }

  const result = await saveReport({
    staff,
    ref: body.ref,
    dateString,
    marks,
  });

  if (!result.success) {
    res
      .status(200)
      .type("html")
      .send(renderError(req.params.token, result.message));
    return;
  }

  res.status(200).type("html").send(
    renderSaved({
      token: req.params.token,
      dateString,
      result,
    })
  );
}

module.exports = {
  getOrCreateStaffToken,
  rotateStaffToken,
  resolveStaffByToken,
  getStaffReportLink,
  getAllowedDates,
  pickDate,
  getSessionsForDate,
  resolveSessionRef,
  saveReport,
  renderRoster,
  handleHome,
  handleSession,
  handleSave,
};
