const {
  sendWhatsAppMessage,
} = require("./whapiService");

const {
  normalizePhone,
  getManagerPhones,
} = require("./attendanceService");

const { maskId } = require("../utils/whatsappIds");

/*
 * =========================================================
 * הודעות למנהלים (דיווחי נוכחות, שינויים, הערות)
 * =========================================================
 *
 * משותף ל-WhatsApp ולדף הדיווח של המדריכים.
 */

/*
 * שולח הודעה לכל המנהלים חוץ מהמדווח.
 * מחזיר true אם כולם קיבלו.
 */
async function sendToOtherManagers(
  reporterPhone,
  message
) {
  const managerPhones = getManagerPhones();

  if (managerPhones.length === 0) {
    console.warn("⚠️ לא הוגדרו מספרי מנהלים.");

    return false;
  }

  const normalizedReporter =
    normalizePhone(reporterPhone);

  const recipients = managerPhones.filter(
    (phone) =>
      normalizePhone(phone) !==
      normalizedReporter
  );

  let allSent = true;

  for (const recipient of recipients) {
    try {
      await sendWhatsAppMessage(
        recipient,
        message
      );
    } catch (error) {
      allSent = false;

      console.error(
        "❌ שליחת עדכון למנהל נכשלה:",
        {
          recipient: maskId(recipient),
          status: error.response?.status,
          message: error.message,
        }
      );
    }
  }

  return allSent;
}

function formatAttendanceDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  try {
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function buildManagerAttendanceMessage(
  result
) {
  const presentLines =
    result.present?.length > 0
      ? result.present.map(
          (trainee) => `✅ ${trainee.name}`
        )
      : ["אף אחד"];

  const absentLines =
    result.absent.length > 0
      ? result.absent.map(
          (trainee) => `❌ ${trainee.name}`
        )
      : ["✅ אין נעדרים"];

  const attendanceTitle =
    result.teamContext
      ? `${result.teamContext.teamLabel} (${result.teamContext.dayName})`
      : result.slot
        ? `${result.slot.dayName} ${result.slot.startTime}`
        : result.group.name;

  return [
    `📋 דיווח נוכחות – ${attendanceTitle}`,
    "",
    `📅 תאריך: ${formatAttendanceDate(
      result?.session?.session_date
    )}`,
    `👤 דווח על ידי: ${result.submittedBy}`,
    "",
    `✅ הגיעו: ${result.presentCount} מתוך ${result.total}`,
    `❌ נעדרו: ${result.absentCount}`,
    "",
    "הגיעו:",
    ...presentLines,
    "",
    "לא הגיעו:",
    ...absentLines,
  ].join("\n");
}

module.exports = {
  sendToOtherManagers,
  formatAttendanceDate,
  buildManagerAttendanceMessage,
};
