const { pool } = require("./databaseService");

const { sendWhatsAppMessage } = require("./whapiService");

const attendance = require("./attendanceService");

const {
  getSessionsForDay,
  getStaffReportLink,
} = require("./coachReportService");

const { sendToOtherManagers } = require("./staffNotifyService");

const { maskId } = require("../utils/whatsappIds");

/*
 * =========================================================
 * תזכורת על נוכחות שלא דווחה
 * =========================================================
 *
 * 21:00 (שעון ישראל) — לכל מאמן פעיל: אילו אימונים של היום עוד
 *                      לא דווחו, עם הקישור האישי שלו לדיווח.
 * 22:00              — למנהלים: מה עדיין לא דווח, ומה כן.
 *
 * רק אימונים שיש בהם ילדים. ביום בלי אימונים, או כשהכל דווח,
 * לא נשלח כלום. טבלת scheduled_jobs מבטיחה שליחה אחת ביום,
 * גם אם השרת מופעל מחדש.
 *
 * כיבוי: REPORT_REMINDERS=false
 * שעות: COACH_REMINDER_HOUR (21), MANAGER_REMINDER_HOUR (22)
 */

const DAY_NAMES = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function isEnabled() {
  return String(process.env.REPORT_REMINDERS || "true").toLowerCase() !== "false";
}

function hourSetting(name, fallback) {
  const value = Number(process.env[name]);

  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

function israelNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );

  const dateString = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    dateString,
    hour: Number(parts.hour),
    dayOfWeek: attendance.getIsraelDayOfWeek(now),
  };
}

function shortDate(dateString) {
  const [, month, day] = dateString.split("-").map(Number);

  return `${day}/${month}`;
}

function shortBranch(branch) {
  return String(branch || "").split(/\s+[–—-]\s+/)[0];
}

function sessionLabel(session) {
  if (session.ref.startsWith("t:")) {
    return `נבחרת ${session.ref.slice(2)}`;
  }

  if (session.ref.startsWith("g:")) {
    const parts = String(session.title).split(/\s+[–—-]\s+/);

    return (parts.length > 1 ? parts.slice(1).join(" – ") : session.title).trim();
  }

  return "אימון";
}

/*
 * האימונים של היום, ולכל אחד: האם כבר דווח.
 */
async function getTodayStatus(now = new Date(), db = pool) {
  const { dateString, dayOfWeek } = israelNow(now);
  const dayName = DAY_NAMES[dayOfWeek];

  const reported = (
    await db.query(
      `
        SELECT g.id, g.name
        FROM attendance_sessions s
        JOIN training_groups g ON g.id = s.group_id
        WHERE s.session_date = $1::DATE
      `,
      [dateString]
    )
  ).rows;

  const reportedIds = new Set(reported.map((row) => String(row.id)));
  const reportedNames = new Set(reported.map((row) => row.name));

  const sessions = [];

  for (const session of await getSessionsForDay(dayOfWeek)) {
    if (session.ref.startsWith("g:") && !session.count) {
      continue;
    }

    let done = false;

    if (session.ref.startsWith("g:")) {
      done = reportedIds.has(String(session.groupId));
    } else if (session.ref.startsWith("t:")) {
      done = reportedNames.has(
        `גלי הדר | ${dayName} 16:30 | ${session.ref.slice(2)}`
      );
    } else {
      done = reportedNames.has(`גלי הדר | ${dayName} ${session.time}`);
    }

    sessions.push({
      label: sessionLabel(session),
      time: session.time,
      branch: session.branch,
      done,
    });
  }

  return { dateString, dayOfWeek, dayName, sessions };
}

function line(session, withBranch) {
  return `${session.label} – ${session.time}${
    withBranch ? ` (${shortBranch(session.branch)})` : ""
  }`;
}

function buildCoachReminder(status, link) {
  const missing = status.sessions.filter((s) => !s.done);
  const branches = new Set(status.sessions.map((s) => s.branch));

  return [
    `⏰ תזכורת דיווח נוכחות – יום ${status.dayName} ${shortDate(status.dateString)}`,
    "",
    "עוד לא דווחו היום:",
    ...missing.map((s) => `• ${line(s, branches.size > 1)}`),
    "",
    "אם אימנת אחת מהקבוצות האלה, אפשר לדווח כאן:",
    link,
    "",
    "תודה! 🎾",
  ].join("\n");
}

function buildManagerSummary(status, coachHour) {
  const lines = [
    `📋 נוכחות שלא דווחה היום – ${status.dayName} ${shortDate(status.dateString)}`,
  ];

  const byBranch = new Map();

  for (const session of status.sessions) {
    if (!byBranch.has(session.branch)) byBranch.set(session.branch, []);
    byBranch.get(session.branch).push(session);
  }

  for (const [branch, sessions] of byBranch) {
    const missing = sessions.filter((s) => !s.done);
    const done = sessions.filter((s) => s.done);

    if (!missing.length) {
      continue;
    }

    lines.push("", `${shortBranch(branch)}:`);
    missing.forEach((s) => lines.push(`❌ ${line(s, false)}`));

    if (done.length) {
      lines.push("", `✅ דווחו: ${done.map((s) => s.label).join(", ")}`);
    }
  }

  lines.push("", `המאמנים קיבלו תזכורת ב-${coachHour}:00.`);

  return lines.join("\n");
}

async function claimJob(jobKey, db = pool) {
  const existing = await db.query(
    `SELECT 1 FROM scheduled_jobs WHERE job_key = $1`,
    [jobKey]
  );

  if (existing.rows.length > 0) {
    return false;
  }

  const result = await db.query(
    `INSERT INTO scheduled_jobs (job_key) VALUES ($1) ON CONFLICT (job_key) DO NOTHING RETURNING job_key`,
    [jobKey]
  );

  return result.rows.length > 0;
}

async function releaseJob(jobKey, db = pool) {
  await db.query(`DELETE FROM scheduled_jobs WHERE job_key = $1`, [jobKey]);
}

async function sendCoachReminders(status, coachHour) {
  const coaches = attendance.getCoachPhones();
  let sent = 0;

  for (const phone of coaches) {
    try {
      const link = await getStaffReportLink(phone);

      if (!link) {
        continue;
      }

      await sendWhatsAppMessage(phone, buildCoachReminder(status, link));
      sent += 1;
    } catch (error) {
      console.error("❌ שליחת תזכורת דיווח למאמן נכשלה:", {
        coach: maskId(phone),
        message: error.message,
      });
    }
  }

  return { sent, total: coaches.length };
}

/*
 * נקרא כל כמה דקות מהשרת.
 */
async function runReportRemindersIfDue(now = new Date(), db = pool) {
  if (!isEnabled()) {
    return { ran: false, reason: "disabled" };
  }

  const coachHour = hourSetting("COACH_REMINDER_HOUR", 21);
  const managerHour = hourSetting("MANAGER_REMINDER_HOUR", 22);
  const { dateString, hour } = israelNow(now);
  const results = {};

  if (hour >= coachHour) {
    const key = `coach-report-reminder-${dateString}`;

    if (await claimJob(key, db)) {
      const status = await getTodayStatus(now, db);

      if (status.sessions.some((s) => !s.done)) {
        const result = await sendCoachReminders(status, coachHour);

        /* אף מאמן לא קיבל — ננסה שוב בבדיקה הבאה */
        if (result.sent === 0 && result.total > 0) {
          await releaseJob(key, db);
        }

        results.coaches = result;
      } else {
        results.coaches = { sent: 0, reason: "all-reported" };
      }
    }
  }

  if (hour >= managerHour) {
    const key = `manager-missing-report-${dateString}`;

    if (await claimJob(key, db)) {
      const status = await getTodayStatus(now, db);

      if (status.sessions.some((s) => !s.done)) {
        const delivered = await sendToOtherManagers(
          "",
          buildManagerSummary(status, coachHour)
        );

        results.managers = { sent: delivered };
      } else {
        results.managers = { sent: false, reason: "all-reported" };
      }
    }
  }

  return { ran: Object.keys(results).length > 0, ...results };
}

module.exports = {
  getTodayStatus,
  buildCoachReminder,
  buildManagerSummary,
  runReportRemindersIfDue,
};
