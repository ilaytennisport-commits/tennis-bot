const { pool } = require("./databaseService");

const {
  sendWhatsAppMessage,
  sendWhatsAppDocument,
} = require("./whapiService");

const {
  getManagerPhones,
} = require("./attendanceService");

const {
  createMonthlyAttendanceFile,
  getAttendanceStartDate,
} = require("./attendanceExportService");

const {
  getIsraelYearMonth,
  getIsraelDayAndHour,
  shiftMonth,
  formatMonthLabel,
} = require("../utils/months");

const { maskId } = require("../utils/whatsappIds");

/*
 * =========================================================
 * שליחת דוח נוכחות (אקסל) ב-WhatsApp
 * =========================================================
 */

function buildCaption(file) {
  return [
    `📊 דוח נוכחות – ${file.monthLabel}`,
    `${file.sessionCount} מפגשים ב-${file.groupCount} קבוצות`,
  ].join("\n");
}

/*
 * בקשה של מנהל ("ייצוא נוכחות ...").
 */
async function sendAttendanceExport({
  recipient,
  yearMonth,
}) {
  const monthLabel = formatMonthLabel(yearMonth);

  await sendWhatsAppMessage(
    recipient,
    `⏳ מכין את דוח הנוכחות של ${monthLabel}...`
  );

  const file =
    await createMonthlyAttendanceFile(yearMonth);

  if (file.empty) {
    const [year, month, day] =
      getAttendanceStartDate().split("-");

    await sendWhatsAppMessage(
      recipient,
      [
        `ℹ️ לא נמצאו דיווחי נוכחות ב${monthLabel}.`,
        `(הדוחות כוללים דיווחים מ-${day}/${month}/${year} והלאה)`,
      ].join("\n")
    );

    return { sent: false, empty: true };
  }

  try {
    await sendWhatsAppDocument(recipient, {
      buffer: file.buffer,
      filename: file.filename,
      mimeType: file.mimeType,
      caption: buildCaption(file),
    });
  } catch (error) {
    await sendWhatsAppMessage(
      recipient,
      "❌ לא הצלחתי לשלוח את קובץ האקסל. נסו שוב בעוד כמה דקות."
    );

    throw error;
  }

  return { sent: true, empty: false };
}

/*
 * =========================================================
 * דוח חודשי אוטומטי
 * =========================================================
 *
 * ב-1 לכל חודש, החל מ-08:00 בשעון ישראל, נשלח לכל המנהלים
 * הדוח של החודש הקודם. טבלת scheduled_jobs מבטיחה שהדוח
 * יישלח פעם אחת בלבד, גם אם השרת מופעל מחדש.
 *
 * כיבוי: ATTENDANCE_MONTHLY_REPORT=false
 */

const MONTHLY_REPORT_HOUR = 8;

function isMonthlyReportEnabled() {
  return (
    String(
      process.env.ATTENDANCE_MONTHLY_REPORT ||
        "true"
    ).toLowerCase() !== "false"
  );
}

async function claimJob(jobKey, db = pool) {
  const result = await db.query(
    `
      INSERT INTO scheduled_jobs (job_key)
      VALUES ($1)
      ON CONFLICT (job_key) DO NOTHING
      RETURNING job_key
    `,
    [jobKey]
  );

  return result.rows.length > 0;
}

async function releaseJob(jobKey, db = pool) {
  await db.query(
    `
      DELETE FROM scheduled_jobs
      WHERE job_key = $1
    `,
    [jobKey]
  );
}

async function runMonthlyReportIfDue(
  now = new Date()
) {
  if (!isMonthlyReportEnabled()) {
    return { ran: false, reason: "disabled" };
  }

  const { day, hour } = getIsraelDayAndHour(now);

  if (day !== 1 || hour < MONTHLY_REPORT_HOUR) {
    return { ran: false, reason: "not-due" };
  }

  const previousMonth = shiftMonth(
    getIsraelYearMonth(now),
    -1
  );

  const jobKey = `monthly-attendance-${previousMonth.year}-${String(
    previousMonth.month
  ).padStart(2, "0")}`;

  if (!(await claimJob(jobKey))) {
    return { ran: false, reason: "already-sent" };
  }

  const managers = getManagerPhones();

  try {
    const file =
      await createMonthlyAttendanceFile(previousMonth);

    if (file.empty) {
      return { ran: true, sent: 0, empty: true };
    }

    let sent = 0;

    for (const manager of managers) {
      try {
        await sendWhatsAppDocument(manager, {
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
          caption: `${buildCaption(file)}\n\n(נשלח אוטומטית בתחילת כל חודש)`,
        });

        sent += 1;
      } catch (error) {
        console.error(
          "❌ שליחת דוח נוכחות חודשי נכשלה:",
          {
            manager: maskId(manager),
            message: error.message,
          }
        );
      }
    }

    /*
     * אם אף מנהל לא קיבל — משחררים כדי לנסות שוב בשעה הבאה.
     */
    if (sent === 0 && managers.length > 0) {
      await releaseJob(jobKey);
    }

    return { ran: true, sent, empty: false };
  } catch (error) {
    await releaseJob(jobKey);
    throw error;
  }
}

module.exports = {
  sendAttendanceExport,
  runMonthlyReportIfDue,
  isMonthlyReportEnabled,
};
