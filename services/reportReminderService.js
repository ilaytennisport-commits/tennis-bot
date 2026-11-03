const { pool } = require("./databaseService");

const { sendWhatsAppMessage } = require("./whapiService");

const attendance = require("./attendanceService");

const {
  getSessionsForDay,
  getStaffReportLink,
} = require("./coachReportService");

const { sendToOtherManagers } = require("./staffNotifyService");

const { maskId } = require("../utils/whatsappIds");

const { getNoTrainingHoliday } = require("../utils/hebrewHolidays");

/*
 * =========================================================
 * ימים בלי אימונים
 * =========================================================
 *
 * חגים — לפי הלוח העברי (utils/hebrewHolidays).
 * ביטול ידני (גשם וכו') — מנהל שולח "אין אימונים היום".
 * "יש אימונים היום" מבטל את זה, וגם פותח יום חג אם בכל זאת מתאמנים.
 */

/*
 * =========================================================
 * ימי העבודה של כל מאמן
 * =========================================================
 *
 * מאמן שהוגדרו לו ימים ("ימי אימון נובל: שני, שלישי, חמישי")
 * מקבל תזכורת רק בימים האלה. בלי הגדרה — בכל יום שיש אימונים.
 */

const COACH_DAYS_KEY = "coach_days:";

const DAY_WORDS = {
  ראשון: 1, א: 1,
  שני: 2, ב: 2,
  שלישי: 3, ג: 3,
  רביעי: 4, ד: 4,
  חמישי: 5, ה: 5,
  שישי: 6, ו: 6,
};

/*
 * "שני, שלישי וחמישי" / "ב ג ה" / "ב+ג+ה" → [2, 3, 5]
 */
function parseCoachDays(text = "") {
  const days = new Set();

  for (const raw of String(text).split(/[\s,+،/]+/)) {
    /* "ובחמישי" / "בשני" / "וחמישי" → היום עצמו */
    const word = raw
      .replace(/[׳'"״.]/g, "")
      .replace(/^(?:ו|ב|וב)(?=(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)$)/, "")
      .replace(/^ימי?$/, "");

    if (DAY_WORDS[word]) {
      days.add(DAY_WORDS[word]);
    }
  }

  return [...days].sort();
}

async function setCoachDays(phone, days, db = pool) {
  const key = COACH_DAYS_KEY + attendance.normalizePhone(phone);

  if (!days || days.length === 0) {
    await db.query(`DELETE FROM app_settings WHERE key = $1`, [key]);
    return;
  }

  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, days.join(",")]
  );
}

async function getCoachDays(phone, db = pool) {
  const row = (
    await db.query(`SELECT value FROM app_settings WHERE key = $1`, [
      COACH_DAYS_KEY + attendance.normalizePhone(phone),
    ])
  ).rows[0];

  return row?.value ? row.value.split(",").map(Number) : null;
}

function formatDays(days) {
  return days.map((day) => DAY_NAMES[day]).join(", ");
}

const NO_TRAINING_KEY = "no_training:";
const OPEN_VALUE = "open";

async function setTrainingDay(dateString, cancelled, byName, db = pool) {
  await db.query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [NO_TRAINING_KEY + dateString, cancelled ? `cancelled:${byName || ""}` : OPEN_VALUE]
  );
}

/*
 * למה אין היום אימונים (שם החג / "בוטלו"), או null אם יש.
 */
async function getNoTrainingReason(dateString, db = pool) {
  const row = (
    await db.query(`SELECT value FROM app_settings WHERE key = $1`, [
      NO_TRAINING_KEY + dateString,
    ])
  ).rows[0];

  if (row?.value === OPEN_VALUE) {
    return null;
  }

  if (row?.value?.startsWith("cancelled")) {
    return "האימונים בוטלו";
  }

  return getNoTrainingHoliday(dateString);
}

/*
 * =========================================================
 * תזכורת על נוכחות שלא דווחה
 * =========================================================
 *
 * 21:30 (שעון ישראל) — לכל מאמן פעיל: אילו אימונים של היום עוד
 *                      לא דווחו, עם הקישור האישי שלו לדיווח.
 * 22:00              — למנהלים: מה עדיין לא דווח, ומה כן.
 *
 * רק אימונים שיש בהם ילדים. ביום בלי אימונים, או כשהכל דווח,
 * לא נשלח כלום. טבלת scheduled_jobs מבטיחה שליחה אחת ביום,
 * גם אם השרת מופעל מחדש.
 *
 * כיבוי: REPORT_REMINDERS=false
 * שעות: COACH_REMINDER_TIME ("21:30"), MANAGER_REMINDER_TIME ("22:00")
 */

const DAY_NAMES = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function isEnabled() {
  return String(process.env.REPORT_REMINDERS || "true").toLowerCase() !== "false";
}

/*
 * שעה בפורמט "21:30" (או שעה עגולה "21"). מחזיר דקות מתחילת היום.
 */
function timeSetting(name, fallback) {
  const match = String(process.env[name] || "").trim().match(/^(d{1,2})(?::(d{2}))?$/);
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2] || 0) : NaN;

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : fallback;
}

function formatTime(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function israelNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );

  const dateString = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    dateString,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
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

function buildManagerSummary(status, coachTime) {
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

  lines.push("", `המאמנים קיבלו תזכורת ב-${coachTime}.`);

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

async function sendCoachReminders(status, db = pool) {
  const coaches = [];

  /* רק מאמנים שעובדים היום (או שלא הוגדרו להם ימים) */
  for (const phone of attendance.getCoachPhones()) {
    const days = await getCoachDays(phone, db);

    if (!days || days.includes(status.dayOfWeek)) {
      coaches.push(phone);
    }
  }

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

  const coachAt = timeSetting("COACH_REMINDER_TIME", 21 * 60 + 30);
  const managerAt = timeSetting("MANAGER_REMINDER_TIME", 22 * 60);
  const { dateString, minutes } = israelNow(now);
  const results = {};

  if (minutes >= coachAt) {
    const reason = await getNoTrainingReason(dateString, db);

    if (reason) {
      return { ran: false, reason: "no-training", day: reason };
    }
  }

  if (minutes >= coachAt) {
    const key = `coach-report-reminder-${dateString}`;

    if (await claimJob(key, db)) {
      const status = await getTodayStatus(now, db);

      if (status.sessions.some((s) => !s.done)) {
        const result = await sendCoachReminders(status, db);

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

  if (minutes >= managerAt) {
    const key = `manager-missing-report-${dateString}`;

    if (await claimJob(key, db)) {
      const status = await getTodayStatus(now, db);

      if (status.sessions.some((s) => !s.done)) {
        const delivered = await sendToOtherManagers(
          "",
          buildManagerSummary(status, formatTime(coachAt))
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
  israelNow,
  parseCoachDays,
  setCoachDays,
  getCoachDays,
  formatDays,
  setTrainingDay,
  getNoTrainingReason,
  getTodayStatus,
  buildCoachReminder,
  buildManagerSummary,
  runReportRemindersIfDue,
};
