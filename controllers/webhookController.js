const crypto = require("crypto");

const {
  buildProfileUpdates,
} = require("../services/profileMemoryService");

const {
  createReply,
} = require("../services/replyService");

const {
  sendWhatsAppMessage,
  isBotEcho,
} = require("../services/whapiService");

const {
  getConversation,
  getFullConversation,
  addMessage,
  clearConversation,
  wasRecentlySentByBot,
} = require("../services/conversationService");

const {
  getUser,
  saveUser,
  markSummarySent,
  clearUser,
} = require("../prompts/memory/usermemory");

const {
  whatsappIdToPhone,
  extractUserDetails,
  formatLeadSummary,
} = require("../utils/leadUtils");

const {
  isPrivateChat,
  maskId,
} = require("../utils/whatsappIds");

const {
  looksLikeQuestion,
  isGreetingOnly,
} = require("../utils/text");

const {
  QUESTIONS,
} = require("../prompts/questionTexts");

const {
  getEntryWelcomeMessage,
  shouldAskSource,
  resolveSource,
  detectSpecialSource,
} = require("../services/sourceRoutingService");

const {
  detectConversationIntent,
} = require("../services/conversationIntentService");

const {
  isSpecialSource,
  isRegularProgramInterest,
  buildSpecialWelcome,
  getMissingSpecialField,
  getQuestionForField,
  buildSpecialRulesMessage,
  getSpecialFaqReply,
} = require(
  "../services/specialSourceConversationService"
);

const {
  normalizePhone,
  getManagerPhones,
  isManagerPhone,
  isCoachPhone,
  getStaffName,
  getActiveGroups,
  resolveActiveGroup,
  parseSlotsTarget,

  getGroupRoster,
  buildGroupRosterMessage,
  addTrainee,
  removeTrainee,
  moveTrainee,
  createGroup,
  closeGroup,
  renameGroup,
  renameTrainee,
  addCoach,
  removeCoach,
  findCoach,
  buildCoachListMessage,

  submitAttendance,
  buildAttendanceSummary,
} = require(
  "../services/attendanceService"
);

const {
  parseAttendanceCommand,
  parseManagerCommand,
} = require("../utils/staffCommandParser");

const {
  isLeadReadyToSend,
  createLead,
} = require("../services/leadService");

const {
  isBotPaused,
  pauseBot,
  resumeBot,
  getPauseHours,
} = require("../services/handoffService");

const {
  claimMessage,
  checkRateLimit,
  notifyManagersOfError,
} = require("../services/reliabilityService");

const academy = require("../knowledge/academyKnowledge");

const {
  sendAttendanceExport,
} = require("../services/attendanceReportService");

const {
  getViewLink,
  rotateViewToken,
  getPublicBaseUrl,
} = require("../services/attendanceViewService");

const {
  getOrCreateAdminToken: getLeagueAdminToken,
  rotateAdminToken: rotateLeagueAdminToken,
} = require("../services/leagueService");

const {
  sendToOtherManagers,
  buildManagerAttendanceMessage,
} = require("../services/staffNotifyService");

const {
  getStaffReportLink,
  rotateStaffToken,
} = require("../services/coachReportService");

const {
  parseSupportNote,
  createSupportNote,
  listOpenSupportNotes,
  buildOpenNotesMessage,
} = require("../services/supportNotesService");

const {
  parsePendingReply,
  handlePendingReply,
} = require("../services/pendingTraineeService");

const {
  COACH_SHORT_GUIDE,
} = require("../knowledge/coachGuide");

const {
  buildTraineeAttendanceReport,
} = require("../services/traineeReportService");

/*
 * הכתובת הציבורית של השרת, כפי שנראתה בבקשת ה-Webhook האחרונה
 * (גיבוי למקרה ש-PUBLIC_BASE_URL / RAILWAY_PUBLIC_DOMAIN לא קיימים).
 */
let lastKnownHost = null;

const userQueues =
  new Map();

const SPECIAL_BRANCH =
  "גלי הדר – ראשון לציון";

const MAX_INCOMING_TEXT_LENGTH = 2000;

/*
 * =========================================================
 * מספרים מיוחדים מתוך משתני הסביבה
 * =========================================================
 */

function parsePhoneEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((phone) => normalizePhone(phone))
    .filter(Boolean);
}

/*
 * TEST_PHONES — מספרים שמקבלים את בוט הלקוחות גם אם הם
 * מנהלים, ויכולים להשתמש ב"איפוס שיחה". לבדיקות בלבד.
 */
function isTestPhone(phone) {
  const normalized = normalizePhone(phone);

  return Boolean(
    normalized &&
      parsePhoneEnv("TEST_PHONES").includes(
        normalized
      )
  );
}

function isHandoffEnabled() {
  return (
    String(
      process.env.HUMAN_HANDOFF_ENABLED ||
        "true"
    ).toLowerCase() !== "false"
  );
}

/*
 * =========================================================
 * עזרי פקודות מנהל
 * =========================================================
 */

function buildManagerCommandsHelp() {
  return [
    "🔐 ניהול קבוצות",
    "",
    "אפשר לדבר איתי בצורה רגילה.",
    "",
    "➕ הוספה:",
    "תוסיף את ישראל ישראלי לקבוצה א+ד 16:00",
    "",
    "➖ הסרה:",
    "תוריד את ישראל ישראלי מקבוצה א+ד 16:00",
    "",
    "🔄 העברה:",
    "תעביר את ישראל ישראלי מקבוצה א+ד 16:00 לקבוצה ב+ה 18:00",
    "",
    "👥 רשימת קבוצה:",
    "תראה לי את הרשימה של קבוצה א+ד 16:00",
    "",
    "📋 דיווח נוכחות:",
    "18:00",
    "ישראל ישראלי",
    "דני כהן",
    "",
    "מספיק לכתוב את השעה — הקבוצה מזוהה לפי היום והשעה.",
    'אפשר גם "נוכחות צעירה שלישי" או "נוכחות צעירה אתמול".',
    "",
    "✅ דף דיווח נוכחות (סימון ✔ / ✘ לכל ילד):",
    "קישור דיווח",
    "",
    "🌐 דף נוכחות חי (מתעדכן כל דקה):",
    "קישור נוכחות",
    "",
    "👟 מאמנים (מי יכול לקבל קישור דיווח):",
    "מאמנים — הרשימה",
    "הוסף מאמן 0541234567 דנה",
    "הסר מאמן 0541234567",
    "קישור דיווח של דנה — הקישור שלה, כדי להעביר לה",
    "שלח לי מדריך למדריכים — הסבר קצר להעתקה לקבוצת המאמנים",
    "",
    "👥 קבוצות:",
    "קבוצות — כל הקבוצות הפעילות",
    "פתח קבוצה א+ד 18:00 – ותיקים",
    "פתח קבוצה בית חשמונאי ב+ה 16:45 – מתחילים",
    "סגור קבוצה א+ד 18:00 – ותיקים",
    "שינוי שם קבוצה (שלוש שורות):",
    "שנה שם קבוצה",
    "<השם הישן>",
    "<השם החדש>",
    "",
    "✏️ שינוי שם של ילד:",
    "שנה שם אדל לאדל שלומון",
    "",
    "🆕 ילדים שמדריכים דיווחו ושלא ברשימה:",
    "ממתינים — הרשימה",
    "הוסף 12 / לא 12 — אישור או דחייה",
    "",
    "🧒 נוכחות של ילד אחד:",
    "נוכחות של נועם לוי החודש",
    "נוכחות של נועם לוי חודש קודם",
    "",
    "📊 היסטוריית נוכחות לאקסל:",
    "ייצוא נוכחות",
    "ייצוא נוכחות חודש קודם",
    "ייצוא נוכחות אוקטובר",
    "",
    "🤖 שליטה בבוט מול לקוח:",
    "עצור בוט 0501234567",
    "הפעל בוט 0501234567",
    "",
    "📝 הערה או בקשה לשיפור הבוט:",
    "הערה: מה שרוצים לשנות או לתקן",
    "הערות פתוחות — רשימת ההערות שעוד לא טופלו",
  ].join("\n");
}

async function groupNameExists(name) {
  if (parseSlotsTarget(name)) {
    return true;
  }

  const resolution =
    await resolveActiveGroup(name);

  return (
    resolution.success ||
    resolution.code === "AMBIGUOUS_GROUP"
  );
}

/*
 * כששם המשפחה מתחיל ב-ל / מ יש כמה חלוקות אפשריות.
 * בוחרים את הראשונה שכל הקבוצות שלה קיימות.
 */
async function pickCommandCandidate(command) {
  if (
    !Array.isArray(command.candidates) ||
    command.candidates.length <= 1
  ) {
    return command;
  }

  for (const candidate of command.candidates) {
    const groupNames =
      command.type === "MOVE_TRAINEE"
        ? [
            candidate.fromGroupName,
            candidate.toGroupName,
          ]
        : [candidate.groupName];

    let allExist = true;

    for (const groupName of groupNames) {
      if (!(await groupNameExists(groupName))) {
        allExist = false;
        break;
      }
    }

    if (allExist) {
      return {
        ...command,
        ...candidate,
      };
    }
  }

  return command;
}

function phoneToChatId(phone = "") {
  let digits = String(phone).replace(
    /\D/g,
    ""
  );

  if (digits.startsWith("0")) {
    digits = `972${digits.slice(1)}`;
  }

  return digits
    ? `${digits}@s.whatsapp.net`
    : null;
}

/*
 * =========================================================
 * התראות שינויי מנהל
 * =========================================================
 */

function buildManagerAdminNotification({
  action,
  result,
  managerPhone,
}) {
  const managerName =
    getStaffName(managerPhone);

  const header = [
    "🔐 עדכון רשימת מתאמנים",
    "",
    `👤 בוצע על ידי: ${managerName}`,
    "",
  ];

  if (action === "ADD_TRAINEE") {
    const notes = result.trainee?.notes
      ? `\n📝 הערה: ${result.trainee.notes}`
      : "";

    return [
      ...header,
      "➕ נוסף מתאמן",
      `🎾 שם: ${result.trainee.name}`,
      `👥 קבוצה: ${result.group.name}${notes}`,
    ].join("\n");
  }

  if (action === "REMOVE_TRAINEE") {
    return [
      ...header,
      "➖ הוסר מתאמן",
      `🎾 שם: ${result.trainee.name}`,
      `👥 קבוצה: ${result.group.name}`,
    ].join("\n");
  }

  if (action === "MOVE_TRAINEE") {
    return [
      ...header,
      "🔄 מתאמן הועבר קבוצה",
      `🎾 שם: ${result.trainee.name}`,
      `⬅️ מקבוצה: ${result.fromGroup.name}`,
      `➡️ לקבוצה: ${result.toGroup.name}`,
    ].join("\n");
  }

  return null;
}

/*
 * =========================================================
 * ביצוע פקודות מנהל
 * =========================================================
 */

const ROSTER_ACTIONS = {
  ADD_TRAINEE: (command) =>
    addTrainee({
      groupName: command.groupName,
      traineeName: command.traineeName,
      notes: command.notes,
    }),

  REMOVE_TRAINEE: (command) =>
    removeTrainee({
      groupName: command.groupName,
      traineeName: command.traineeName,
    }),

  MOVE_TRAINEE: (command) =>
    moveTrainee({
      fromGroupName: command.fromGroupName,
      toGroupName: command.toGroupName,
      traineeName: command.traineeName,
    }),
};

async function handleManagerCommand({
  userId,
  command,
  managerPhone,
}) {
  try {
    if (command.type === "LIST_GROUP") {
      await sendWhatsAppMessage(
        userId,
        buildGroupRosterMessage(
          await getGroupRoster(
            command.groupName
          )
        )
      );

      return true;
    }

    if (
      command.type === "PAUSE_BOT" ||
      command.type === "RESUME_BOT"
    ) {
      const chatId =
        phoneToChatId(command.phone);

      if (command.type === "PAUSE_BOT") {
        await pauseBot(chatId);

        await sendWhatsAppMessage(
          userId,
          `⏸️ הבוט הושתק מול ${command.phone} ל-${getPauseHours()} שעות.`
        );
      } else {
        await resumeBot(chatId);

        await sendWhatsAppMessage(
          userId,
          `▶️ הבוט חזר לענות ל-${command.phone}.`
        );
      }

      return true;
    }

    if (
      command.type === "ATTENDANCE_LINK" ||
      command.type === "ROTATE_ATTENDANCE_LINK"
    ) {
      if (command.type === "ROTATE_ATTENDANCE_LINK") {
        await rotateViewToken();
      }

      const link = await getViewLink(lastKnownHost);

      await sendWhatsAppMessage(
        userId,
        link
          ? [
              command.type === "ROTATE_ATTENDANCE_LINK"
                ? "🔄 נוצר קישור חדש. הקישור הקודם כבר לא עובד."
                : "📋 דף הנוכחות החי:",
              "",
              link,
              "",
              "• הדף מתעדכן לבד כל דקה",
              "• אפשר לעבור בין חודשים ולהוריד אקסל",
              "• אפשר להעביר את הקישור למנהלים נוספים",
              "",
              "⚠️ בדף יש שמות של ילדים — לא להעביר מחוץ לצוות.",
              'אם הקישור הגיע למישהו שלא צריך — שלחו "החלף קישור נוכחות".',
            ].join("\n")
          : "❌ לא הצלחתי ליצור קישור כרגע. נסו שוב בעוד כמה דקות."
      );

      return true;
    }

    if (
      command.type === "LEAGUE_LINK" ||
      command.type === "ROTATE_LEAGUE_LINK"
    ) {
      const token =
        command.type === "ROTATE_LEAGUE_LINK"
          ? await rotateLeagueAdminToken()
          : await getLeagueAdminToken();

      const baseUrl = getPublicBaseUrl(lastKnownHost);

      await sendWhatsAppMessage(
        userId,
        baseUrl
          ? [
              command.type === "ROTATE_LEAGUE_LINK"
                ? "🔄 נוצר קישור ניהול חדש. הקישור הקודם כבר לא עובד."
                : "🎾 ניהול הליגה:",
              "",
              `${baseUrl}/league/admin/${token}`,
              "",
              "הקישור לשחקנים (לתיאור קבוצת הוואטסאפ):",
              `${baseUrl}/league`,
              "",
              "⚠️ קישור הניהול סודי — לא להעביר לשחקנים.",
              'אם הוא הגיע למישהו שלא צריך — שלחו "החלף קישור ליגה".',
            ].join("\n")
          : "❌ לא הצלחתי ליצור קישור כרגע. נסו שוב בעוד כמה דקות."
      );

      return true;
    }

    if (command.type === "TRAINEE_ATTENDANCE") {
      await sendWhatsAppMessage(
        userId,
        await buildTraineeAttendanceReport(command)
      );

      return true;
    }

    if (command.type === "LIST_GROUPS") {
      await sendWhatsAppMessage(userId, await buildGroupsHelpMessage());

      return true;
    }

    if (
      command.type === "RENAME_GROUP" ||
      command.type === "RENAME_TRAINEE"
    ) {
      const result =
        command.type === "RENAME_GROUP"
          ? await renameGroup(command)
          : await renameTrainee(command);

      await sendWhatsAppMessage(userId, result.message);

      if (result.success) {
        await sendToOtherManagers(
          managerPhone,
          command.type === "RENAME_GROUP"
            ? `✏️ ${getStaffName(managerPhone)} שינה שם קבוצה:\n${result.oldName}\n← ${result.group.name}`
            : `✏️ ${getStaffName(managerPhone)} שינה שם: ${result.oldName} ← ${result.newName}`
        );
      }

      return true;
    }

    if (command.type === "LIST_COACHES") {
      await sendWhatsAppMessage(userId, buildCoachListMessage());

      return true;
    }

    if (
      command.type === "ADD_COACH" ||
      command.type === "REMOVE_COACH"
    ) {
      const result =
        command.type === "ADD_COACH"
          ? await addCoach({
              phone: command.phone,
              name: command.name,
              managerPhone,
            })
          : await removeCoach({
              phoneOrName: command.phoneOrName,
              managerPhone,
            });

      await sendWhatsAppMessage(userId, result.message);

      if (result.success) {
        await sendToOtherManagers(
          managerPhone,
          `👟 ${getStaffName(managerPhone)} ${
            command.type === "ADD_COACH" ? "הוסיף מאמן" : "הסיר את המאמן"
          }: ${result.name ? `${result.name} (${result.phone})` : result.phone}`
        );
      }

      return true;
    }

    if (
      command.type === "CREATE_GROUP" ||
      command.type === "CLOSE_GROUP"
    ) {
      const result =
        command.type === "CREATE_GROUP"
          ? await createGroup({ groupName: command.groupName })
          : await closeGroup({ groupName: command.groupName });

      await sendWhatsAppMessage(userId, result.message);

      if (result.success) {
        await sendToOtherManagers(
          managerPhone,
          `👥 ${getStaffName(managerPhone)} ${
            command.type === "CREATE_GROUP" ? "פתח" : "סגר"
          } את הקבוצה ${result.group.name}.`
        );
      }

      return true;
    }

    if (command.type === "EXPORT_ATTENDANCE") {
      await sendAttendanceExport({
        recipient: userId,
        yearMonth: command.yearMonth,
      });

      return true;
    }

    if (command.type === "INVALID_EXPORT_COMMAND") {
      await sendWhatsAppMessage(
        userId,
        [
          "⚠️ לא הבנתי לאיזה חודש.",
          "",
          "אפשר לכתוב למשל:",
          "ייצוא נוכחות",
          "ייצוא נוכחות חודש קודם",
          "ייצוא נוכחות אוקטובר",
          "ייצוא נוכחות 10/2026",
        ].join("\n")
      );

      return true;
    }

    if (ROSTER_ACTIONS[command.type]) {
      const resolvedCommand =
        await pickCommandCandidate(command);

      const result =
        await ROSTER_ACTIONS[command.type](
          resolvedCommand
        );

      await sendWhatsAppMessage(
        userId,
        result.message
      );

      if (result.success) {
        const notification =
          buildManagerAdminNotification({
            action: command.type,
            result,
            managerPhone,
          });

        const notified = notification
          ? await sendToOtherManagers(
              managerPhone,
              notification
            )
          : true;

        if (!notified) {
          await sendWhatsAppMessage(
            userId,
            [
              "⚠️ השינוי נשמר בהצלחה,",
              "אך לא הצלחתי לעדכן את כל המנהלים.",
            ].join("\n")
          );
        }
      }

      return true;
    }

    if (
      command.type ===
      "INVALID_MANAGER_COMMAND"
    ) {
      await sendWhatsAppMessage(
        userId,
        [
          "⚠️ לא הצלחתי להבין את פקודת הניהול.",
          "",
          buildManagerCommandsHelp(),
        ].join("\n")
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ שגיאה בפקודת מנהל:", {
      type: command.type,
      message: error.message,
      stack: error.stack,
    });

    await sendWhatsAppMessage(
      userId,
      "❌ אירעה שגיאה בביצוע פעולת הניהול."
    );

    return true;
  }
}

/*
 * =========================================================
 * עזרי קבוצות ונוכחות
 * =========================================================
 */

async function buildGroupsHelpMessage() {
  try {
    const groups = await getActiveGroups();

    if (
      !Array.isArray(groups) ||
      groups.length === 0
    ) {
      return "כרגע אין קבוצות פעילות במערכת.";
    }

    const grouped = new Map();

    for (const group of groups) {
      const branch =
        group.branch || "ללא סניף";

      if (!grouped.has(branch)) {
        grouped.set(branch, []);
      }

      grouped.get(branch).push(group);
    }

    const lines = ["🎾 הקבוצות הפעילות:"];

    for (const [
      branch,
      branchGroups,
    ] of grouped.entries()) {
      lines.push("", `📍 ${branch}`);

      for (const group of branchGroups) {
        lines.push(`• ${group.name}`);
      }
    }

    return lines.join("\n");
  } catch (error) {
    console.error(
      "❌ שגיאה בשליפת קבוצות:",
      error.message
    );

    return "לא ניתן היה לשלוף כרגע את רשימת הקבוצות.";
  }
}

/*
 * =========================================================
 * טיפול באנשי צוות
 * =========================================================
 */

async function handleStaffMessage({
  userId,
  userMessage,
  staffPhone,
  manager,
}) {
  /*
   * הערה / בעיה / בקשה מהצוות — נשמרת ומועברת למנהלים.
   */
  const supportNote =
    parseSupportNote(userMessage);

  if (supportNote) {
    const staffName = getStaffName(staffPhone);

    const note = await createSupportNote({
      fromPhone: normalizePhone(staffPhone),
      fromName: staffName,
      chatId: userId,
      kind: supportNote.kind,
      body: supportNote.body,
    });

    await sendWhatsAppMessage(
      userId,
      [
        `✅ ה${supportNote.kind} נשמרה (#${note.id}).`,
        "",
        "נעדכן אותך כאן כשזה יטופל. תודה! 🙏",
      ].join("\n")
    );

    await sendToOtherManagers(
      staffPhone,
      [
        `📝 ${supportNote.kind} חדשה #${note.id} מ${staffName}:`,
        "",
        supportNote.body,
      ].join("\n")
    );

    return true;
  }

  /*
   * מנהל עונה על ילד שמדריך דיווח ושלא ברשימה: "הוסף 12" / "לא 12" / "ממתינים".
   */
  const pendingReply = manager
    ? parsePendingReply(userMessage)
    : null;

  if (pendingReply) {
    const handled = await handlePendingReply({
      reply: pendingReply,
      managerPhone: staffPhone,
    });

    if (handled) {
      await sendWhatsAppMessage(userId, handled.message);

      return true;
    }
  }

  /*
   * קישור אישי לדף דיווח הנוכחות.
   * מאמן: "קישור" / "קישור דיווח" / "קישור נוכחות"
   * מנהל: "קישור דיווח" ("קישור נוכחות" אצל מנהל = הדף החי)
   */
  const linkText = String(userMessage)
    .trim()
    .replace(/[!.?]+$/, "");

  /*
   * אצל מנהל "נוכחות" שמור לדף החי, ולכן מנהל כותב "דיווח".
   */
  const linkTopics = manager
    ? "דיווח"
    : "דיווח|נוכחות";

  const wantsReportLink = new RegExp(
    manager
      ? `^(?:קישור|לינק|דף)\\s+(?:ל)?(?:ה)?(?:${linkTopics})$`
      : `^(?:קישור|לינק|דף)(?:\\s+(?:ל)?(?:ה)?(?:${linkTopics}))?$`
  ).test(linkText);

  const wantsNewReportLink = new RegExp(
    manager
      ? `^(?:החלף|תחליף)\\s+(?:את\\s+)?(?:ה)?קישור\\s+(?:ל)?(?:ה)?(?:${linkTopics})$`
      : `^(?:החלף|תחליף)\\s+(?:את\\s+)?(?:ה)?קישור(?:\\s+(?:ל)?(?:ה)?(?:${linkTopics}))?$`
  ).test(linkText);

  if (wantsReportLink || wantsNewReportLink) {
    if (wantsNewReportLink) {
      await rotateStaffToken(staffPhone);
    }

    const link = await getStaffReportLink(
      staffPhone,
      lastKnownHost
    );

    await sendWhatsAppMessage(
      userId,
      link
        ? [
            "📋 הקישור האישי שלך לדיווח נוכחות:",
            "",
            link,
            "",
            "1. פותחים את הקישור",
            "2. בוחרים את האימון",
            "3. מסמנים ✔ הגיע / ✘ לא הגיע ליד כל ילד",
            "4. לוחצים 💾 שמירה",
            "",
            "💡 שמרו את ההודעה (⭐ סימון בכוכב) — הקישור לא משתנה.",
            "⚠️ הקישור אישי — לא להעביר לאחרים.",
          ].join("\n")
        : "❌ לא הצלחתי ליצור קישור כרגע. נסו שוב בעוד כמה דקות."
    );

    return true;
  }

  /*
   * "שלח לי מדריך למדריכים" — המדריך הקצר, מוכן להעתקה לקבוצת המאמנים.
   */
  if (
    /^(?:(?:שלח|תשלח|תן)\s+(?:לי\s+)?(?:את\s+)?)?(?:ה)?מדריך\s+(?:ה)?(?:קצר\s+)?(?:ל|של\s+)?(?:ה)?(?:מדריכים|מאמנים)(?:\s+(?:ה)?קצר)?$/.test(
      linkText
    )
  ) {
    await sendWhatsAppMessage(userId, COACH_SHORT_GUIDE);

    return true;
  }

  /*
   * מנהל מבקש את הקישור של מאמן כדי להעביר לו:
   * "קישור דיווח של אלונה" / "קישור דיווח ל-0541234567" / "קישור של אלונה"
   */
  const coachLinkMatch = manager
    ? linkText.match(/^(?:קישור|לינק)\s+(?:ה)?דיווח\s+(?:של\s+|ל-?\s*)(.+)$/) ||
      linkText.match(/^(?:קישור|לינק)\s+של\s+(.+)$/)
    : null;

  if (coachLinkMatch) {
    const found = findCoach(coachLinkMatch[1]);

    if (!found.success || !isCoachPhone(found.phone)) {
      await sendWhatsAppMessage(
        userId,
        found.success
          ? [
              `❌ ${found.phone} לא מוגדר כמאמן.`,
              `קודם מוסיפים: הוסף מאמן ${found.phone} <שם>`,
            ].join("\n")
          : found.message
      );

      return true;
    }

    const coachLink = await getStaffReportLink(
      found.phone,
      lastKnownHost
    );

    const coachName = getStaffName(found.phone);

    await sendWhatsAppMessage(
      userId,
      coachLink
        ? [
            `📋 הקישור האישי של ${coachName} לדיווח נוכחות:`,
            "",
            coachLink,
            "",
            `העבירו אותו רק ל${coachName}, בהודעה פרטית.`,
            "הדיווחים שנשלחים ממנו נרשמים על שמו/ה.",
          ].join("\n")
        : "❌ לא הצלחתי ליצור קישור כרגע. נסו שוב בעוד כמה דקות."
    );

    return true;
  }

  if (
    manager &&
    /^(?:הערות|הערות פתוחות|רשימת הערות)$/.test(
      String(userMessage).trim()
    )
  ) {
    await sendWhatsAppMessage(
      userId,
      buildOpenNotesMessage(
        await listOpenSupportNotes()
      )
    );

    return true;
  }

  const managerCommand =
    parseManagerCommand(userMessage);

  if (managerCommand) {
    if (!manager) {
      await sendWhatsAppMessage(
        userId,
        [
          "❌ אין לך הרשאה לבצע את הפעולה הזו.",
          "",
          "מאמנים יכולים לדווח נוכחות בלבד.",
          "הוספה, הסרה או העברה של מתאמנים מתבצעת רק על ידי מנהל.",
        ].join("\n")
      );

      return true;
    }

    return handleManagerCommand({
      userId,
      command: managerCommand,
      managerPhone: staffPhone,
    });
  }

  const attendanceCommand =
    parseAttendanceCommand(userMessage);

  if (!attendanceCommand.isAttendanceCommand) {
    const groupsHelp =
      await buildGroupsHelpMessage();

    const staffReply = manager
      ? [
          buildManagerCommandsHelp(),
          "",
          groupsHelp,
        ].join("\n")
      : [
          "🎾 זוהית כמאמן מורשה.",
          "",
          "📋 הכי נוח: שלחו את המילה  קישור",
          "ותקבלו דף שבו מסמנים ✔ / ✘ ליד כל ילד.",
          "",
          "או בהודעה:",
          "",
          "18:00",
          "שם מתאמן",
          "שם מתאמן",
          "",
          "מספיק לכתוב את השעה — הקבוצה מזוהה לפי היום והשעה.",
          'אפשר גם "נוכחות א+ד 16:00" או "נוכחות צעירה אתמול".',
          "",
          groupsHelp,
          "",
          "📝 משהו לא עובד או רעיון לשיפור? כתבו:",
          "הערה: ...",
          "",
          "ℹ️ מאמנים יכולים לדווח נוכחות בלבד.",
        ].join("\n");

    await sendWhatsAppMessage(
      userId,
      staffReply
    );

    return true;
  }

  if (!attendanceCommand.groupName) {
    await sendWhatsAppMessage(
      userId,
      [
        "⚠️ חסר שם הקבוצה.",
        "",
        "יש לשלוח למשל:",
        "",
        "נוכחות א+ד 16:00",
        "שם מתאמן",
        "שם מתאמן",
        "",
        await buildGroupsHelpMessage(),
      ].join("\n")
    );

    return true;
  }

  if (
    attendanceCommand.presentNames.length === 0
  ) {
    await sendWhatsAppMessage(
      userId,
      [
        "⚠️ לא נשלחו שמות של מתאמנים שהגיעו.",
        "",
        "הנוכחות לא נשמרה.",
        "",
        "יש לשלוח למשל:",
        "",
        `נוכחות ${attendanceCommand.groupName}`,
        "שם מתאמן",
        "שם מתאמן",
      ].join("\n")
    );

    return true;
  }

  try {
    const result = await submitAttendance({
      groupName: attendanceCommand.groupName,
      presentNames:
        attendanceCommand.presentNames,
      submittedByPhone: staffPhone,
      dateOffsetDays:
        attendanceCommand.dateOffsetDays,
    });

    if (!result.success) {
      let reply =
        result.message ||
        "❌ לא ניתן היה לשמור את הנוכחות.";

      if (result.code === "GROUP_NOT_FOUND") {
        reply = [
          reply,
          "",
          await buildGroupsHelpMessage(),
        ].join("\n");
      }

      await sendWhatsAppMessage(userId, reply);

      return true;
    }

    await sendWhatsAppMessage(
      userId,
      buildAttendanceSummary(result)
    );

    const managersSent =
      await sendToOtherManagers(
        staffPhone,
        buildManagerAttendanceMessage(result)
      );

    if (!managersSent) {
      await sendWhatsAppMessage(
        userId,
        [
          "⚠️ הנוכחות נשמרה בהצלחה,",
          "אך לא הצלחתי להעביר את הדיווח לכל המנהלים.",
        ].join("\n")
      );
    }

    return true;
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול בדיווח נוכחות:",
      {
        staff: maskId(staffPhone),
        message: error.message,
        stack: error.stack,
      }
    );

    await sendWhatsAppMessage(
      userId,
      [
        "❌ אירעה שגיאה בשמירת הנוכחות.",
        "הדיווח לא נשמר.",
      ].join("\n")
    );

    return true;
  }
}

/*
 * =========================================================
 * בוט לקוחות — עזרים
 * =========================================================
 */

function hasExistingProfileData(user = {}) {
  return Boolean(
    user.name ||
      user.age ||
      user.city ||
      user.height ||
      user.audience ||
      user.equipment_topic ||
      user.experience ||
      user.branch ||
      user.goal ||
      user.regular_flow_active === true ||
      user.summary_sent === true
  );
}

function getLastAssistantMessage(
  conversationHistory = []
) {
  return (
    [...conversationHistory]
      .reverse()
      .find(
        (item) =>
          item?.role === "assistant" &&
          typeof item?.content === "string"
      )?.content || ""
  );
}

function isWaitingForSource(
  conversationHistory = []
) {
  return getLastAssistantMessage(
    conversationHistory
  ).includes(
    QUESTIONS.source.replace(/\?$/, "")
  );
}

/*
 * הלקוח לא ענה "איך שמעתם עלינו",
 * אלא כתב שאלה / בקשה אמיתית.
 */
function isSubstantiveMessage(message = "") {
  if (looksLikeQuestion(message)) {
    return true;
  }

  return (
    detectConversationIntent(message, {})
      .stage !== "unknown"
  );
}

async function replyToCustomer(
  userId,
  reply
) {
  await addMessage(userId, "assistant", reply);
  await sendWhatsAppMessage(userId, reply);
}

function extractCustomerDetails(
  userMessage,
  currentUser
) {
  return {
    ...extractUserDetails(
      userMessage,
      currentUser
    ),
    ...buildProfileUpdates(
      userMessage,
      currentUser
    ),
  };
}

/*
 * =========================================================
 * מסלול מיוחד (MOVE / עמית / FreeFit)
 * =========================================================
 */

function extractSpecialAge(message = "") {
  const match = String(message).match(
    /(?:בן|בת|גיל)?\s*(\d{1,3})/
  );

  if (!match) {
    return null;
  }

  const age = Number(match[1]);

  if (
    !Number.isInteger(age) ||
    age < 4 ||
    age > 100
  ) {
    return null;
  }

  return age;
}

function buildSpecialFieldUpdate(
  field,
  userMessage
) {
  const text = String(userMessage)
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  switch (field) {
    case "name":
      if (
        looksLikeQuestion(text) ||
        text.length < 2 ||
        text.length > 80 ||
        /\d/.test(text)
      ) {
        return null;
      }

      return { name: text };

    case "age": {
      const age = extractSpecialAge(text);

      if (!age) {
        return null;
      }

      return {
        age,
        audience:
          age >= 18 ? "adult" : "child",
      };
    }

    case "city":
      if (
        looksLikeQuestion(text) ||
        text.length < 2 ||
        text.length > 80
      ) {
        return null;
      }

      return { city: text };

    case "experience":
      if (
        looksLikeQuestion(text) ||
        text.length < 2 ||
        text.length > 500
      ) {
        return null;
      }

      return { experience: text };

    case "phone": {
      const phone =
        extractUserDetails(text).phone;

      return phone ? { phone } : null;
    }

    default:
      return null;
  }
}

function buildInvalidSpecialFieldReply(
  field
) {
  switch (field) {
    case "name":
      return [
        "בשמחה 😊",
        "כדי שאוכל להמשיך, צריך קודם את השם המלא של המתאמן או המתאמנת.",
      ].join("\n");

    case "age":
      return [
        "כדי שאוכל להתאים את הקבוצה, צריך את גיל המתאמן או המתאמנת 😊",
        "אפשר לכתוב למשל: 12",
      ].join("\n");

    case "city":
      return [
        "כדי שאוכל להמשיך, צריך את עיר המגורים 😊",
        "אפשר לכתוב רק את שם העיר.",
      ].join("\n");

    case "experience":
      return [
        "כדי להשלים את ההתאמה, אשמח לדעת מה הניסיון בטניס עד היום 😊",
        'אם אין ניסיון קודם, אפשר לכתוב "ללא ניסיון".',
      ].join("\n");

    case "phone":
      return "אפשר לכתוב מספר טלפון בפורמט 05XXXXXXXX 😊";

    default:
      return "אשמח לקבל את הפרט שביקשתי כדי שנוכל להמשיך 😊";
  }
}

async function sendLeadIfReady({
  userId,
  user,
  kind,
}) {
  if (user.summary_sent === true) {
    return null;
  }

  /*
   * מסמנים קודם, כדי שלא יישלח ליד כפול.
   * הליד עצמו נשמר בטבלת leads ונשלח שוב אם נכשל.
   */
  await markSummarySent(userId);

  return createLead({
    userId,
    user,
    kind,
    conversationHistory:
      await getFullConversation(userId),
  });
}

async function handleSpecialSourceConversation({
  userId,
  userMessage,
  currentUser,
}) {
  if (
    !currentUser.source_confirmed ||
    !isSpecialSource(currentUser.source)
  ) {
    return false;
  }

  if (currentUser.regular_flow_active === true) {
    const returnsToSpecial =
      detectSpecialSource(userMessage) ===
      currentUser.source;

    if (!returnsToSpecial) {
      return false;
    }

    currentUser = await saveUser(userId, {
      regular_flow_active: false,
      branch: SPECIAL_BRANCH,
    });
  }

  if (
    isRegularProgramInterest(
      userMessage,
      currentUser.source
    )
  ) {
    await saveUser(userId, {
      regular_flow_active: true,
      branch: null,
    });

    return false;
  }

  if (currentUser.branch !== SPECIAL_BRANCH) {
    currentUser = await saveUser(userId, {
      branch: SPECIAL_BRANCH,
    });
  }

  await addMessage(userId, "user", userMessage);

  const missingField =
    getMissingSpecialField(currentUser);

  if (!missingField) {
    await replyToCustomer(
      userId,
      getSpecialFaqReply(
        userMessage,
        currentUser.source
      )
    );

    return true;
  }

  if (looksLikeQuestion(userMessage)) {
    await replyToCustomer(
      userId,
      [
        getSpecialFaqReply(
          userMessage,
          currentUser.source
        ),
        "",
        "וכדי שנוכל להמשיך בהרשמה:",
        getQuestionForField(missingField),
      ].join("\n")
    );

    return true;
  }

  const fieldUpdate =
    buildSpecialFieldUpdate(
      missingField,
      userMessage
    );

  if (!fieldUpdate) {
    await replyToCustomer(
      userId,
      buildInvalidSpecialFieldReply(
        missingField
      )
    );

    return true;
  }

  currentUser = await saveUser(userId, {
    ...fieldUpdate,
    branch: SPECIAL_BRANCH,
  });

  const nextMissingField =
    getMissingSpecialField(currentUser);

  if (nextMissingField) {
    await replyToCustomer(
      userId,
      getQuestionForField(nextMissingField)
    );

    return true;
  }

  await replyToCustomer(
    userId,
    buildSpecialRulesMessage(
      currentUser.source
    )
  );

  /*
   * ההרשמה במסלול המיוחד הושלמה — מעדכנים את המנהל.
   */
  await sendLeadIfReady({
    userId,
    user: currentUser,
    kind: "special",
  });

  return true;
}

/*
 * =========================================================
 * מסלול לקוח רגיל
 * =========================================================
 */

async function handleRegularFlow({
  userId,
  userMessage,
  currentUser,
  detectedPhone,
  replyPrefix = "",
}) {
  const extractedDetails =
    extractCustomerDetails(
      userMessage,
      currentUser
    );

  if (
    !currentUser.phone &&
    !extractedDetails.phone &&
    detectedPhone
  ) {
    extractedDetails.phone = detectedPhone;
  }

  const updatedUser = await saveUser(
    userId,
    extractedDetails
  );

  await addMessage(userId, "user", userMessage);

  const conversationHistory =
    await getConversation(userId);

  const shouldSendLeadSummary =
    isLeadReadyToSend(updatedUser) &&
    updatedUser.summary_sent !== true;

  const reply = await createReply({
    userId,
    userMessage,
    updatedUser,
    conversationHistory,
    shouldSendLeadSummary,
    formatLeadSummary,
  });

  if (!reply || typeof reply !== "string") {
    throw new Error(
      "The bot generated an empty reply"
    );
  }

  await replyToCustomer(
    userId,
    replyPrefix
      ? `${replyPrefix}\n\n${reply}`
      : reply
  );

  const finalUser = await getUser(userId);

  if (isLeadReadyToSend(finalUser)) {
    await sendLeadIfReady({
      userId,
      user: finalUser,
      kind: "regular",
    });
  }
}

/*
 * =========================================================
 * לקוח — נקודת כניסה
 * =========================================================
 */

async function handleCustomerMessage({
  userId,
  userMessage,
  detectedPhone,
}) {
  let currentUser = await getUser(userId);

  /*
   * נציג אנושי מטפל בלקוח — הבוט שותק,
   * אבל שומר את ההודעה כדי שההקשר לא יאבד.
   */
  if (isBotPaused(currentUser)) {
    await addMessage(userId, "user", userMessage);

    console.log(
      `⏸️ הבוט מושתק מול ${maskId(userId)} — ההודעה נשמרה בלבד.`
    );

    return;
  }

  const previousConversationHistory =
    await getConversation(userId);

  const waitingForSource = isWaitingForSource(
    previousConversationHistory
  );

  /*
   * לקוחות ותיקים מלפני שער הכניסה — מסלול רגיל.
   */
  if (
    shouldAskSource(currentUser) &&
    !waitingForSource &&
    (
      previousConversationHistory.length > 0 ||
      hasExistingProfileData(currentUser)
    )
  ) {
    currentUser = await saveUser(userId, {
      source: "regular",
      source_confirmed: true,
      regular_flow_active: false,
    });
  }

  /*
   * לקוח חדש — שואלים "איך שמעתם עלינו",
   * אבל שומרים את ההודעה הראשונה כדי לענות עליה אחר כך.
   */
  if (
    shouldAskSource(currentUser) &&
    !waitingForSource
  ) {
    const directSource =
      detectSpecialSource(userMessage);

    await addMessage(userId, "user", userMessage);

    if (directSource) {
      await saveUser(userId, {
        phone:
          currentUser.phone || detectedPhone,
        source: directSource,
        source_confirmed: true,
        regular_flow_active: false,
        branch: SPECIAL_BRANCH,
      });

      await replyToCustomer(
        userId,
        buildSpecialWelcome(directSource)
      );

      return;
    }

    await saveUser(userId, {
      ...extractCustomerDetails(
        userMessage,
        currentUser
      ),
      phone:
        currentUser.phone || detectedPhone,
      pending_message: isGreetingOnly(
        userMessage
      )
        ? null
        : userMessage,
    });

    await replyToCustomer(
      userId,
      getEntryWelcomeMessage()
    );

    return;
  }

  /*
   * תשובה לשאלת "איך שמעתם עלינו".
   */
  if (
    shouldAskSource(currentUser) &&
    waitingForSource
  ) {
    const sourceResult =
      resolveSource(userMessage);

    if (sourceResult.isSpecial) {
      await saveUser(userId, {
        source: sourceResult.source,
        source_confirmed: true,
        regular_flow_active: false,
        branch: SPECIAL_BRANCH,
        pending_message: null,
      });

      await addMessage(userId, "user", userMessage);

      await replyToCustomer(
        userId,
        buildSpecialWelcome(sourceResult.source)
      );

      return;
    }

    const pendingMessage =
      currentUser.pending_message;

    currentUser = await saveUser(userId, {
      source: "regular",
      source_confirmed: true,
      regular_flow_active: false,
      pending_message: null,
    });

    /*
     * הלקוח לא ענה על המקור אלא שאל משהו — עונים לו.
     */
    if (isSubstantiveMessage(userMessage)) {
      await handleRegularFlow({
        userId,
        userMessage,
        currentUser,
        detectedPhone,
      });

      return;
    }

    /*
     * הייתה שאלה בהודעה הראשונה — עונים עליה עכשיו.
     */
    if (pendingMessage) {
      await addMessage(userId, "user", userMessage);

      await handleRegularFlow({
        userId,
        userMessage: pendingMessage,
        currentUser,
        detectedPhone,
        replyPrefix: "תודה 😊",
      });

      return;
    }

    await addMessage(userId, "user", userMessage);

    await replyToCustomer(
      userId,
      [
        "מעולה, תודה 😊",
        "",
        "איך אפשר לעזור לכם היום?",
      ].join("\n")
    );

    return;
  }

  if (
    currentUser.source_confirmed === true &&
    isSpecialSource(currentUser.source)
  ) {
    const handledSpecial =
      await handleSpecialSourceConversation({
        userId,
        userMessage,
        currentUser,
      });

    if (handledSpecial) {
      return;
    }

    currentUser = await getUser(userId);
  }

  await handleRegularFlow({
    userId,
    userMessage,
    currentUser,
    detectedPhone,
  });
}

/*
 * =========================================================
 * הודעות שאינן טקסט
 * =========================================================
 */

const MEDIA_TYPES = new Set([
  "image",
  "video",
  "gif",
  "audio",
  "voice",
  "document",
  "location",
  "live_location",
  "contact",
  "contact_list",
]);

const UNSUPPORTED_REPLY_INTERVAL_MS =
  10 * 60 * 1000;

const lastUnsupportedReplyAt = new Map();

function buildUnsupportedMediaReply() {
  return [
    "קיבלתי 😊",
    "כרגע אני יכול לקרוא רק הודעות כתובות.",
    "אפשר לכתוב לי כאן את השאלה, ואשמח לעזור.",
    "",
    `לשיחה עם הצוות: ${academy.officialPhone}`,
  ].join("\n");
}

/*
 * מחלץ טקסט מהודעה: טקסט רגיל, תצוגה מקדימה של קישור,
 * תשובה לכפתור, או כיתוב של תמונה / סרטון.
 */
function getMessageText(message = {}) {
  const text =
    message.text?.body ||
    message.link_preview?.body ||
    message.reply?.buttons_reply?.title ||
    message.reply?.list_reply?.title ||
    message.image?.caption ||
    message.video?.caption ||
    message.document?.caption ||
    "";

  return String(text).trim();
}

/*
 * =========================================================
 * הודעות שהמספר העסקי שלח (from_me)
 * =========================================================
 *
 * אם זו לא הודעה של הבוט — מישהו מהצוות ענה ידנית.
 * הבוט שותק מול הלקוח הזה לזמן מוגדר.
 */
async function handleOutgoingMessage(message) {
  if (!isHandoffEnabled()) {
    return;
  }

  const chatId = message.chat_id;

  if (!chatId || !isPrivateChat(chatId)) {
    return;
  }

  if (isBotEcho(message)) {
    return;
  }

  /*
   * בדיקה נוספת במסד הנתונים — עובדת גם אחרי הפעלה מחדש,
   * כשהזיכרון של השרת כבר לא כולל את ההודעות ששלח קודם.
   */
  const body = getMessageText(message);

  if (
    body &&
    (await wasRecentlySentByBot(chatId, body))
  ) {
    return;
  }

  const chatPhone = whatsappIdToPhone(chatId);

  if (
    isManagerPhone(chatPhone) ||
    isCoachPhone(chatPhone)
  ) {
    return;
  }

  await pauseBot(chatId);

  console.log(
    `🙋 נציג ענה ידנית ל-${maskId(chatId)} — הבוט מושתק ל-${getPauseHours()} שעות.`,
    {
      source: message.source || null,
      type: message.type || null,
      length: body.length,
    }
  );
}

/*
 * =========================================================
 * עיבוד הודעה נכנסת
 * =========================================================
 */

async function processIncomingMessage(message) {
  if (!message) {
    return;
  }

  const userId = message.chat_id || message.from;

  /*
   * הבוט עונה רק בשיחות פרטיות —
   * לא בקבוצות, בערוצים או בסטטוסים.
   */
  if (!userId || !isPrivateChat(userId)) {
    return;
  }

  if (message.from_me === true) {
    await handleOutgoingMessage(message);

    return;
  }

  const detectedPhone =
    whatsappIdToPhone(userId);

  const testPhone = isTestPhone(detectedPhone);

  const manager =
    !testPhone && isManagerPhone(detectedPhone);

  const coach =
    !testPhone && isCoachPhone(detectedPhone);

  const rawText = getMessageText(message);

  /*
   * הודעה קולית / תמונה בלי טקסט.
   */
  if (!rawText) {
    if (
      manager ||
      coach ||
      !MEDIA_TYPES.has(message.type)
    ) {
      return;
    }

    const user = await getUser(userId);

    if (isBotPaused(user)) {
      return;
    }

    const lastReply =
      lastUnsupportedReplyAt.get(userId) || 0;

    if (
      Date.now() - lastReply <
      UNSUPPORTED_REPLY_INTERVAL_MS
    ) {
      return;
    }

    lastUnsupportedReplyAt.set(
      userId,
      Date.now()
    );

    await sendWhatsAppMessage(
      userId,
      buildUnsupportedMediaReply()
    );

    return;
  }

  const userMessage = rawText.slice(
    0,
    MAX_INCOMING_TEXT_LENGTH
  );

  console.log(
    `📨 הודעה מ-${maskId(userId)} (${userMessage.length} תווים, ${
      manager ? "מנהל" : coach ? "מאמן" : "לקוח"
    })`
  );

  /*
   * הגבלת קצב ללקוחות.
   */
  if (!manager && !coach) {
    const rate = checkRateLimit(userId);

    if (!rate.allowed) {
      if (rate.shouldWarn) {
        await sendWhatsAppMessage(
          userId,
          `קיבלתי הרבה הודעות ברצף 😊 אחזור לענות בעוד כמה דקות. לשיחה עם הצוות: ${academy.officialPhone}`
        );
      }

      return;
    }
  }

  /*
   * איפוס שיחה — רק למספרי בדיקה (TEST_PHONES).
   */
  if (userMessage === "איפוס שיחה") {
    if (testPhone) {
      await clearConversation(userId);
      await clearUser(userId);

      await sendWhatsAppMessage(
        userId,
        "השיחה והפרטים שנשמרו אופסו בהצלחה 😊"
      );

      return;
    }

    if (manager || coach) {
      await sendWhatsAppMessage(
        userId,
        "❌ איפוס שיחה זמין רק למספרי בדיקה (TEST_PHONES)."
      );

      return;
    }
  }

  /*
   * בדיקת מנהל
   */
  if (userMessage === "בדיקת מנהל") {
    if (!manager) {
      await sendWhatsAppMessage(
        userId,
        "❌ הפקודה אינה זמינה."
      );

      return;
    }

    const others = getManagerPhones().filter(
      (phone) =>
        normalizePhone(phone) !==
        normalizePhone(detectedPhone)
    );

    for (const managerPhone of others) {
      await sendWhatsAppMessage(
        managerPhone,
        "🧪 הודעת בדיקה ממערכת הניהול של האקדמיה"
      );
    }

    await sendWhatsAppMessage(
      userId,
      others.length > 0
        ? `✅ הודעת הבדיקה נשלחה ל-${others.length} מנהלים נוספים.`
        : "✅ אתה המנהל היחיד שמוגדר כרגע במערכת."
    );

    return;
  }

  /*
   * אנשי צוות נעצרים כאן ולא נכנסים לבוט הלקוחות.
   */
  if (manager || coach) {
    await handleStaffMessage({
      userId,
      userMessage,
      staffPhone: detectedPhone,
      manager,
    });

    return;
  }

  /*
   * לקוחות — אם משהו נכשל, הלקוח לא נשאר בלי תשובה.
   */
  try {
    await handleCustomerMessage({
      userId,
      userMessage,
      detectedPhone,
    });
  } catch (error) {
    console.error(
      `❌ שגיאה בטיפול בהודעת לקוח ${maskId(userId)}:`,
      {
        message: error.message,
        stack: error.stack,
      }
    );

    try {
      await sendWhatsAppMessage(
        userId,
        [
          "מצטערים, הייתה תקלה רגעית אצלנו 🙏",
          "צוות האקדמיה יחזור אליכם בהקדם.",
          "",
          `לשאלות דחופות: ${academy.officialPhone}`,
        ].join("\n")
      );
    } catch (sendError) {
      console.error(
        "❌ גם הודעת הגיבוי ללקוח נכשלה:",
        sendError.message
      );
    }

    await notifyManagersOfError(
      [
        `לקוח: ${detectedPhone || "מספר מוסתר"}`,
        `שגיאה: ${String(error.message).slice(0, 200)}`,
      ].join("\n")
    );
  }
}

function enqueueUserMessage(userId, task) {
  const previousTask =
    userQueues.get(userId) ||
    Promise.resolve();

  const currentTask = previousTask
    .catch(() => {})
    .then(task);

  userQueues.set(userId, currentTask);

  currentTask.finally(() => {
    if (userQueues.get(userId) === currentTask) {
      userQueues.delete(userId);
    }
  });

  return currentTask;
}

function getMessageId(message) {
  return (
    message?.id ||
    message?.message_id ||
    message?.key?.id ||
    null
  );
}

/*
 * =========================================================
 * אימות ה-Webhook
 * =========================================================
 *
 * אם הוגדר WEBHOOK_SECRET, כל בקשה חייבת לכלול אותו:
 * https://<server>/webhook?token=<WEBHOOK_SECRET>
 * או בכותרת x-webhook-token / Authorization: Bearer.
 */
function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

function isAuthorizedWebhook(req) {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const authorization =
    req.get?.("authorization") || "";

  const provided =
    req.query?.token ||
    req.get?.("x-webhook-token") ||
    authorization.replace(/^Bearer\s+/i, "");

  return Boolean(
    provided && safeEqual(provided, secret)
  );
}

/*
 * =========================================================
 * Webhook
 * =========================================================
 */

async function handleWebhook(req, res) {
  if (!isAuthorizedWebhook(req)) {
    console.warn(
      "🚫 בקשת Webhook ללא טוקן תקין נדחתה."
    );

    res.status(401).json({
      success: false,
    });

    return;
  }

  res.status(200).json({
    success: true,
    message: "Webhook received",
  });

  const host = req.get?.("host");

  if (host && /^[a-z0-9.-]+$/i.test(host)) {
    lastKnownHost = host;
  }

  try {
    if (req.body?.event?.type !== "messages") {
      return;
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      const userId =
        message?.chat_id || message?.from;

      if (!userId || !isPrivateChat(userId)) {
        continue;
      }

      enqueueUserMessage(userId, async () => {
        try {
          if (
            !(await claimMessage(
              getMessageId(message)
            ))
          ) {
            return;
          }

          await processIncomingMessage(message);
        } catch (error) {
          console.error(
            `❌ שגיאה בעיבוד הודעה עבור ${maskId(userId)}:`,
            error.message
          );
        }
      });
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול ב-Webhook:",
      error.message
    );
  }
}

/*
 * מחכה שכל ההודעות בתור יסתיימו (לכיבוי מסודר ולבדיקות).
 */
async function waitForQueues() {
  await Promise.allSettled([
    ...userQueues.values(),
  ]);
}

module.exports = {
  handleWebhook,
  processIncomingMessage,
  waitForQueues,
  isAuthorizedWebhook,
};
