const { pool } = require("./databaseService");

const {
  formatGroupName,
  getAttendanceStartDate,
} = require("./attendanceExportService");

/*
 * =========================================================
 * דשבורד נוכחות — לשונית בדף הנוכחות החי
 * =========================================================
 *
 * תמונת מצב למנהלים:
 * • אחוז נוכחות ב-4 השבועות האחרונים, ושינוי מ-4 השבועות שלפני
 * • גרף שבועי ל-8 השבועות האחרונים
 * • כל קבוצה: נוכחות, ומתי דווחה לאחרונה
 * • ילדים שהחסירו 2 אימונים ברצף או יותר
 * • כל מאמן: כמה דיווחים ומה הנוכחות אצלו
 *
 * לא נספרים: דיווחים מלפני ATTENDANCE_START_DATE,
 * ילדים שהוסרו מהרשימה וקבוצות שנסגרו.
 */

const WEEKS = 8;
const RECENT_DAYS = 28;
const STREAK_MIN = 2;
const DOTS = 6;

/* קבוצה שלא דווחה יותר מזה — מסומנת. שבוע ועוד יום של מרווח. */
const STALE_AFTER_DAYS = 8;

/* ---------- תאריכים (מחרוזות YYYY-MM-DD) ---------- */

function toUtc(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return Date.UTC(year, month - 1, day, 12);
}

function shiftDay(dateString, days) {
  return new Date(toUtc(dateString) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

/* השבוע מתחיל ביום ראשון */
function weekStart(dateString) {
  return shiftDay(
    dateString,
    -new Date(toUtc(dateString)).getUTCDay()
  );
}

function shortDate(dateString) {
  const [, month, day] = dateString.split("-");

  return `${day}/${month}`;
}

function percent(present, marked) {
  return marked > 0 ? Math.round((present / marked) * 100) : null;
}

function getRange(today) {
  const earliest = shiftDay(weekStart(today), -(WEEKS - 1) * 7);
  const startDate = getAttendanceStartDate();

  return {
    startDate: earliest > startDate ? earliest : startDate,
    endDate: shiftDay(today, 1),
    countingFrom: startDate,
  };
}

/* ---------- שליפה ---------- */

async function fetchDashboardRows({ startDate, endDate }, db = pool) {
  const result = await db.query(
    `
      SELECT
        s.id AS session_id,
        TO_CHAR(s.session_date, 'YYYY-MM-DD') AS session_date,
        s.submitted_by,
        g.id AS group_id,
        g.name AS group_name,
        g.branch,
        g.active AS group_active,
        r.status,
        t.id AS trainee_id,
        t.name AS trainee_name,
        t.active AS trainee_active
      FROM attendance_sessions s
      JOIN training_groups g
        ON g.id = s.group_id
      LEFT JOIN attendance_records r
        ON r.session_id = s.id
      LEFT JOIN trainees t
        ON t.id = r.trainee_id
      WHERE s.session_date >= $1::DATE
        AND s.session_date < $2::DATE
      ORDER BY s.session_date
    `,
    [startDate, endDate]
  );

  return result.rows;
}

/*
 * כל הקבוצות הפתוחות, ומתי דווחו לאחרונה (מאז תחילת הספירה).
 */
async function fetchActiveGroups(countingFrom, db = pool) {
  const result = await db.query(
    `
      SELECT
        g.id,
        g.name,
        g.branch,
        TO_CHAR(MAX(s.session_date), 'YYYY-MM-DD') AS last_date
      FROM training_groups g
      LEFT JOIN attendance_sessions s
        ON s.group_id = g.id
        AND s.session_date >= $1::DATE
      WHERE g.active = TRUE
      GROUP BY g.id, g.name, g.branch
    `,
    [countingFrom]
  );

  return result.rows;
}

/* ---------- חישוב (בלי מסד נתונים — קל לבדיקה) ---------- */

function buildDashboard({
  rows = [],
  groups = [],
  today,
  branch = null,
  countingFrom = "2000-01-01",
}) {
  const branches = [
    ...new Set(
      [...groups.map((g) => g.branch), ...rows.map((r) => r.branch)].filter(
        Boolean
      )
    ),
  ].sort((a, b) => a.localeCompare(b, "he"));

  const selected = branch && branches.includes(branch) ? branch : null;
  const inBranch = (value) => !selected || value === selected;

  const liveRows = rows.filter(
    (row) => row.group_active !== false && inBranch(row.branch)
  );
  const liveGroups = groups.filter((group) => inBranch(group.branch));

  const recentFrom = shiftDay(today, -(RECENT_DAYS - 1));
  const previousFrom = shiftDay(recentFrom, -RECENT_DAYS);

  /* מפגשים: נוכחות של כל מפגש, רק ילדים שעדיין ברשימה */
  const sessions = new Map();

  for (const row of liveRows) {
    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        date: row.session_date,
        groupId: String(row.group_id),
        coach: String(row.submitted_by || "").trim() || "לא ידוע",
        present: 0,
        marked: 0,
      });
    }

    if (row.trainee_id && row.trainee_active !== false && row.status) {
      const session = sessions.get(row.session_id);

      session.marked += 1;
      if (row.status === "present") session.present += 1;
    }
  }

  const sessionList = [...sessions.values()];

  function totals(list) {
    const present = list.reduce((sum, s) => sum + s.present, 0);
    const marked = list.reduce((sum, s) => sum + s.marked, 0);

    return { present, marked, percent: percent(present, marked) };
  }

  const recent = sessionList.filter((s) => s.date >= recentFrom);
  const previous = sessionList.filter(
    (s) => s.date >= previousFrom && s.date < recentFrom
  );

  const recentTotals = totals(recent);
  const previousTotals = totals(previous);

  /* גרף שבועי */
  const weeks = [];

  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = shiftDay(weekStart(today), -i * 7);
    const end = shiftDay(start, 7);

    if (end <= countingFrom) continue;

    const list = sessionList.filter((s) => s.date >= start && s.date < end);

    weeks.push({ start, sessions: list.length, ...totals(list) });
  }

  /* קבוצות */
  const groupNames = new Map();

  for (const group of liveGroups) {
    groupNames.set(String(group.id), group);
  }

  const groupList = [...groupNames.values()]
    .map((group) => {
      const list = recent.filter((s) => s.groupId === String(group.id));
      const lastDate = group.last_date || null;
      const daysSince = lastDate
        ? daysBetween(lastDate, today)
        : daysBetween(countingFrom, today);

      return {
        name: formatGroupName(group.name),
        branch: group.branch || "",
        sessions: list.length,
        ...totals(list),
        lastDate,
        stale: daysSince > STALE_AFTER_DAYS,
      };
    })
    .sort(
      (a, b) =>
        Number(b.stale) - Number(a.stale) ||
        (a.percent ?? 101) - (b.percent ?? 101) ||
        a.name.localeCompare(b.name, "he")
    );

  /* ילדים שהחסירו ברצף */
  const kids = new Map();

  for (const row of liveRows) {
    if (!row.trainee_id || row.trainee_active === false || !row.status) {
      continue;
    }

    if (!groupNames.has(String(row.group_id)) && groups.length) continue;

    const key = String(row.trainee_id);

    if (!kids.has(key)) {
      kids.set(key, {
        name: row.trainee_name,
        group: formatGroupName(row.group_name),
        branch: row.branch || "",
        marks: [],
      });
    }

    kids.get(key).marks.push({ date: row.session_date, status: row.status });
  }

  const atRisk = [...kids.values()]
    .map((kid) => {
      const marks = kid.marks.sort((a, b) => a.date.localeCompare(b.date));

      let streak = 0;
      for (let i = marks.length - 1; i >= 0 && marks[i].status === "absent"; i--) {
        streak += 1;
      }

      const lastPresent = [...marks]
        .reverse()
        .find((mark) => mark.status === "present");

      return {
        name: kid.name,
        group: kid.group,
        branch: kid.branch,
        streak,
        lastPresent: lastPresent?.date || null,
        dots: marks.slice(-DOTS).map((mark) => mark.status === "present"),
      };
    })
    .filter((kid) => kid.streak >= STREAK_MIN)
    .sort(
      (a, b) => b.streak - a.streak || a.name.localeCompare(b.name, "he")
    );

  /* מאמנים — לפי מי ששלח את הדיווח */
  const coaches = new Map();

  for (const session of recent) {
    if (!coaches.has(session.coach)) {
      coaches.set(session.coach, { name: session.coach, list: [], lastDate: null });
    }

    const coach = coaches.get(session.coach);

    coach.list.push(session);
    if (!coach.lastDate || session.date > coach.lastDate) {
      coach.lastDate = session.date;
    }
  }

  const coachList = [...coaches.values()]
    .map((coach) => ({
      name: coach.name,
      sessions: coach.list.length,
      lastDate: coach.lastDate,
      ...totals(coach.list),
    }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "he"));

  const activeKids = new Set(
    liveRows
      .filter(
        (row) =>
          row.trainee_id &&
          row.trainee_active !== false &&
          row.session_date >= recentFrom
      )
      .map((row) => String(row.trainee_id))
  ).size;

  return {
    today,
    branches,
    branch: selected,
    countingFrom,
    hasPrevious: previousTotals.marked > 0 && previousFrom >= countingFrom,
    recent: { ...recentTotals, sessions: recent.length },
    previous: previousTotals,
    activeKids,
    staleCount: groupList.filter((group) => group.stale).length,
    weeks,
    groups: groupList,
    atRisk,
    coaches: coachList,
  };
}

async function getDashboard({ today, branch = null }, db = pool) {
  const range = getRange(today);

  const [rows, groups] = await Promise.all([
    fetchDashboardRows(range, db),
    fetchActiveGroups(range.countingFrom, db),
  ]);

  return buildDashboard({
    rows,
    groups,
    today,
    branch,
    countingFrom: range.countingFrom,
  });
}

/* ---------- HTML ---------- */

function level(value) {
  if (value === null || value === undefined) return "none";

  return value >= 80 ? "good" : value >= 60 ? "mid" : "low";
}

const LEVEL_LABEL = { good: "טוב", mid: "בינוני", low: "לבדיקה", none: "—" };
const LEVEL_COLOR = {
  good: "var(--present-text)",
  mid: "#b07a00",
  low: "var(--absent-text)",
  none: "var(--border)",
};

function renderTrend(weeks, esc) {
  const withData = weeks.filter((week) => week.percent !== null);

  if (withData.length === 0) {
    return `<p class="muted">עוד אין מספיק דיווחים לגרף.</p>`;
  }

  const W = 640;
  const H = 220;
  const L = 44;
  const R = 18;
  const T = 22;
  const B = 34;
  const lowest = Math.min(...withData.map((week) => week.percent));
  const lo = Math.max(0, Math.min(60, Math.floor((lowest - 5) / 10) * 10));
  const hi = 100;
  const n = weeks.length;
  const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);

  let grid = "";
  for (let v = lo; v <= hi; v += 10) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  }

  grid += `<line x1="${L}" x2="${W - R}" y1="${y(80)}" y2="${y(80)}" stroke="var(--present-text)" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(80) - 6}" text-anchor="end" class="goal">יעד 80%</text>`;

  /* קו רק בין שבועות עם נתונים */
  const points = weeks
    .map((week, i) => (week.percent === null ? null : [x(i), y(week.percent)]))
    .filter(Boolean);

  const line = points.map((p) => p.join(",")).join(" ");
  const area =
    points.length > 1
      ? `<polygon points="${points[0][0]},${y(lo)} ${line} ${points[points.length - 1][0]},${y(lo)}" fill="var(--brand)" opacity=".1"/>`
      : "";

  const lastIndex = weeks.findLastIndex((week) => week.percent !== null);

  const dots = weeks
    .map((week, i) => {
      const label = `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${shortDate(week.start)}</text>`;

      if (week.percent === null) return label;

      const last = i === lastIndex;

      return `${label}<circle cx="${x(i)}" cy="${y(week.percent)}" r="${last ? 5.5 : 3.5}" fill="${last ? "#fff" : "var(--brand)"}" stroke="var(--brand)" stroke-width="${last ? 2.5 : 0}"><title>שבוע ${shortDate(week.start)}: ${week.percent}% (${week.sessions} אימונים)</title></circle>${
        last
          ? `<text x="${x(i)}" y="${y(week.percent) - 12}" text-anchor="middle" class="endpoint">${week.percent}%</text>`
          : ""
      }`;
    })
    .join("");

  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="אחוז נוכחות לפי שבוע">${grid}${area}<polyline points="${line}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>
  <p class="muted small">כל נקודה היא שבוע (ראשון עד שבת). התאריך הוא יום ראשון של השבוע.</p>`;
}

function renderDashboardBody({ dashboard, base, escapeHtml: esc }) {
  const d = dashboard;
  const link = (branch) =>
    `${base}?view=dashboard${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`;

  const filters =
    d.branches.length > 1
      ? `<nav class="chips" aria-label="בחירת סניף">${[null, ...d.branches]
          .map(
            (branch) =>
              `<a class="chip${branch === d.branch ? " on" : ""}" href="${link(branch)}">${branch ? esc(branch) : "כל הסניפים"}</a>`
          )
          .join("")}</nav>`
      : "";

  if (d.recent.sessions === 0 && d.weeks.every((week) => week.sessions === 0)) {
    return `${filters}<div class="card empty">עדיין אין דיווחי נוכחות ב-8 השבועות האחרונים.<br>הדשבורד יתמלא לבד כשהמאמנים ידווחו.</div>`;
  }

  const diff =
    d.hasPrevious && d.recent.percent !== null && d.previous.percent !== null
      ? d.recent.percent - d.previous.percent
      : null;

  const tiles = [
    {
      label: "נוכחות ב-4 השבועות האחרונים",
      value: d.recent.percent === null ? "–" : `${d.recent.percent}%`,
      note:
        diff === null
          ? "אין עוד נתונים להשוואה"
          : diff === 0
            ? "כמו 4 השבועות שלפני"
            : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}% מ-4 השבועות שלפני`,
      tone: diff === null || diff === 0 ? "" : diff > 0 ? "up" : "down",
    },
    {
      label: "אימונים שדווחו",
      value: d.recent.sessions,
      note: "ב-4 השבועות האחרונים",
      tone: "",
    },
    {
      label: "ילדים שסומנו",
      value: d.activeKids,
      note: "ב-4 השבועות האחרונים",
      tone: "",
    },
    {
      label: "קבוצות בלי דיווח",
      value: d.staleCount,
      note: d.staleCount ? "לא דווחו יותר משבוע" : "כל הקבוצות דווחו השבוע",
      tone: d.staleCount ? "down" : "up",
    },
  ]
    .map(
      (tile) =>
        `<div class="tile"><div class="k">${tile.label}</div><div class="v">${tile.value}</div><div class="d ${tile.tone}">${tile.note}</div></div>`
    )
    .join("");

  const groupRows = d.groups
    .map((group) => {
      const lv = level(group.percent);
      const status = group.stale
        ? `<span class="pill low">${group.lastDate ? "לא דווח מעל שבוע" : "עוד לא דווח"}</span>`
        : `<span class="pill ${lv}">${LEVEL_LABEL[lv]}</span>`;

      return `<tr>
        <td><b>${esc(group.name)}</b>${d.branch ? "" : `<span class="sub">${esc(group.branch)}</span>`}</td>
        <td class="num">${group.sessions}</td>
        <td><div class="meter"><span class="pv">${group.percent === null ? "–" : `${group.percent}%`}</span><span class="bar"><i style="width:${group.percent || 0}%;background:${LEVEL_COLOR[lv]}"></i></span></div></td>
        <td class="num">${group.lastDate ? shortDate(group.lastDate) : "–"}</td>
        <td>${status}</td>
      </tr>`;
    })
    .join("");

  const riskList = d.atRisk.length
    ? `<ul class="risk">${d.atRisk
        .map(
          (kid) => `<li>
          <div class="who"><b>${esc(kid.name)}</b><span class="sub">${esc(kid.group)}${d.branch ? "" : ` · ${esc(kid.branch)}`}</span><span class="sub">${kid.lastPresent ? `הגיע לאחרונה ב-${shortDate(kid.lastPresent)}` : "לא הגיע מאז תחילת הדיווח"}</span></div>
          <div class="dots" aria-label="${kid.dots.filter(Boolean).length} הגעות מתוך ${kid.dots.length} אימונים אחרונים">${kid.dots
            .map((came) => `<span class="${came ? "in" : "out"}"></span>`)
            .join("")}</div>
          <span class="pill ${kid.streak >= 3 ? "low" : "mid"}">${kid.streak} ברצף</span>
        </li>`
        )
        .join("")}</ul>`
    : `<p class="muted">אין ילדים שהחסירו 2 אימונים ברצף. 👏</p>`;

  const coachRows = d.coaches
    .map(
      (coach) =>
        `<tr><td><b>${esc(coach.name)}</b></td><td class="num">${coach.sessions}</td><td class="num">${coach.percent === null ? "–" : `<span class="pct ${level(coach.percent)}">${coach.percent}%</span>`}</td><td class="num">${coach.lastDate ? shortDate(coach.lastDate) : "–"}</td></tr>`
    )
    .join("");

  return `
  ${filters}
  <section class="tiles">${tiles}</section>

  <section class="card">
    <h2>אחוז נוכחות לפי שבוע</h2>
    ${renderTrend(d.weeks, esc)}
  </section>

  <div class="dash-cols">
    <section class="card">
      <h2>לפי קבוצה</h2>
      <p class="meta">4 השבועות האחרונים. קבוצות שצריך לבדוק מופיעות ראשונות.</p>
      <div class="scroll"><table>
        <thead><tr><th>קבוצה</th><th class="num">אימונים</th><th>נוכחות</th><th class="num">דיווח אחרון</th><th></th></tr></thead>
        <tbody>${groupRows || `<tr><td colspan="5" class="muted">אין קבוצות פתוחות</td></tr>`}</tbody>
      </table></div>
    </section>

    <section class="card">
      <h2>ילדים שכדאי להתקשר אליהם${d.atRisk.length ? ` (${d.atRisk.length})` : ""}</h2>
      <p class="meta">החסירו 2 אימונים אחרונים ברצף או יותר. כל עיגול הוא אימון: ירוק הגיע, אדום לא הגיע, מהישן לחדש.</p>
      ${riskList}
    </section>
  </div>

  <section class="card">
    <h2>לפי מאמן</h2>
    <p class="meta">לפי מי ששלח את הדיווח, ב-4 השבועות האחרונים.</p>
    <div class="scroll"><table>
      <thead><tr><th>מאמן</th><th class="num">דיווחים</th><th class="num">נוכחות ממוצעת</th><th class="num">דיווח אחרון</th></tr></thead>
      <tbody>${coachRows || `<tr><td colspan="4" class="muted">אין דיווחים ב-4 השבועות האחרונים</td></tr>`}</tbody>
    </table></div>
  </section>
  <p class="muted small center">נספרים דיווחים מ-${shortDate(d.countingFrom)} והלאה, בלי ילדים שהוסרו ובלי קבוצות שנסגרו.</p>`;
}

const DASHBOARD_STYLE = `
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .tile { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  .tile .k { color: var(--muted); font-size: 13px; }
  .tile .v { font-size: 30px; font-weight: 800; color: var(--brand); line-height: 1.2; font-variant-numeric: tabular-nums; }
  .tile .d { font-size: 13px; font-weight: 600; color: var(--muted); }
  .tile .d.up { color: var(--present-text); }
  .tile .d.down { color: var(--absent-text); }
  .trend { width: 100%; height: auto; display: block; direction: ltr; }
  .trend text { fill: var(--muted); font: 12px "Segoe UI", Arial, sans-serif; }
  .trend text.goal { fill: var(--present-text); }
  .trend text.endpoint { fill: var(--text); font-weight: 700; font-size: 13px; }
  .small { font-size: 12px; margin: 6px 0 0; }
  .center { text-align: center; }
  .dash-cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; }
  .dash-cols > * { min-width: 0; }
  .sub { display: block; color: var(--muted); font-size: 12px; font-weight: 400; }
  .meter { display: flex; align-items: center; gap: 8px; min-width: 120px; }
  .meter .pv { width: 38px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .bar { flex: 1; height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 99px; }
  .pill { display: inline-block; padding: 1px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .pill.good { background: var(--present); color: var(--present-text); }
  .pill.mid { background: #fff4d6; color: #8a5a00; }
  .pill.low { background: var(--absent); color: var(--absent-text); }
  .pill.none { background: var(--bg); color: var(--muted); }
  .risk { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .risk li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; }
  .risk .who { min-width: 0; flex: 1 1 160px; }
  .dots { display: flex; gap: 4px; direction: ltr; }
  .dots span { width: 11px; height: 11px; border-radius: 50%; }
  .dots .in { background: var(--present-text); }
  .dots .out { background: var(--absent-text); }
  @media (max-width: 800px) {
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .dash-cols { grid-template-columns: 1fr; }
  }
`;

module.exports = {
  WEEKS,
  STREAK_MIN,
  DASHBOARD_STYLE,
  buildDashboard,
  getDashboard,
  getRange,
  renderDashboardBody,
  weekStart,
};
