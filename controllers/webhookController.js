const {
  buildProfileUpdates,
} = require("../services/profileMemoryService");

const {
  createReply,
} = require("../services/replyService");

const {
  sendWhatsAppMessage,
} = require("../services/whapiService");

const {
  getConversation,
  addMessage,
  clearConversation,
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
  getEntryWelcomeMessage,
  shouldAskSource,
  resolveSource,
  detectSpecialSource,
} = require("../services/sourceRoutingService");

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

  getGroupRoster,
  buildGroupRosterMessage,
  addTrainee,
  removeTrainee,
  moveTrainee,

  submitAttendance,
  buildAttendanceSummary,
} = require(
  "../services/attendanceService"
);

const processedMessageIds =
  new Set();

const MAX_PROCESSED_MESSAGE_IDS =
  2000;

const userQueues =
  new Map();

/*
 * מערכת הלידים הקיימת
 * עדיין משתמשת במנהל הראשי.
 */
const CLUB_MANAGER_PHONE =
  process.env.CLUB_MANAGER_PHONE;

const SPECIAL_BRANCH =
  "גלי הדר – ראשון לציון";

/*
 * =========================================================
 * ניקוי טקסט לפקודות צוות
 * =========================================================
 */

function cleanStaffText(
  value = ""
) {
  return String(value)
    .replace(/\*/g, "")
    .replace(/[״"]/g, '"')
    .replace(/[׳']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAttendanceName(
  value = ""
) {
  return String(value)
    .replace(
      /^[\s*•\-–—✅☑️✔️]+/,
      ""
    )
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanManagerPart(
  value = ""
) {
  return cleanStaffText(value)
    .replace(
      /^(?:קבוצה|קבוצת)\s+/,
      ""
    )
    .replace(
      /^(?:ימים|יום)\s+/,
      ""
    )
    .trim();
}

/*
 * =========================================================
 * מערכת נוכחות
 * =========================================================
 */

function parseAttendanceCommand(
  message = ""
) {
  const rawText =
    String(message).trim();

  if (!rawText) {
    return {
      isAttendanceCommand: false,
    };
  }

  const lines =
    rawText
      .split(/\r?\n/)
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  if (
    lines.length === 0
  ) {
    return {
      isAttendanceCommand: false,
    };
  }

  const firstLine =
    cleanStaffText(
      lines[0]
    );

  let groupName = "";

  /*
   * פורמט מפורש:
   *
   * נוכחות א+ד 16:00
   * נוכחות נבחרת צעירה
   * נוכחות צעירה
   * נוכחות צעירה שלישי
   * נוכחות בוגרת חמישי
   */
  const attendanceMatch =
    firstLine.match(
      /^נוכחות\s*[:\-–—]?\s*(.+)$/i
    );

  if (attendanceMatch) {
    groupName =
      cleanManagerPart(
        attendanceMatch[1]
      );
  } else {
    /*
     * פורמט מקוצר:
     *
     * צעירה
     * צעירה שלישי
     * נבחרת צעירה שלישי
     * בוגרת
     * בוגרת חמישי
     * נבחרת בוגרת חמישי
     *
     * בלי יום מפורש:
     * attendanceService ישתמש ביום הנוכחי בישראל.
     */
    const possibleGroupName =
      cleanManagerPart(
        firstLine
      );

    const normalizedGroupName =
      possibleGroupName
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const teamCommandPattern =
      /^(?:נבחרת\s+)?(?:צעירה|בוגרת)(?:\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))?$/i;

    if (
      teamCommandPattern.test(
        normalizedGroupName
      )
    ) {
      groupName =
        possibleGroupName;
    } else {
      return {
        isAttendanceCommand:
          false,
      };
    }
  }

  const presentNames =
    lines
      .slice(1)
      .flatMap((line) =>
        line.split(/[,;]/)
      )
      .map(
        cleanAttendanceName
      )
      .filter(Boolean);

  return {
    isAttendanceCommand: true,
    groupName,
    presentNames,
  };
}

/*
 * =========================================================
 * פקודות ניהול טבעיות
 * =========================================================
 */

function parseNaturalManagerCommand(
  message = ""
) {
  const text =
    cleanStaffText(
      message
    );

  if (!text) {
    return null;
  }

  /*
   * =======================================================
   * רשימת קבוצה
   * =======================================================
   */

  const naturalRosterPatterns = [
    /^תראה\s+לי\s+את\s+הרשימה\s+של\s+(?:קבוצה\s+)?(.+)$/i,
    /^תראה\s+לי\s+רשימה\s+של\s+(?:קבוצה\s+)?(.+)$/i,
    /^תראה\s+את\s+הרשימה\s+של\s+(?:קבוצה\s+)?(.+)$/i,
    /^תציג\s+לי\s+את\s+הרשימה\s+של\s+(?:קבוצה\s+)?(.+)$/i,
    /^תציג\s+את\s+הרשימה\s+של\s+(?:קבוצה\s+)?(.+)$/i,
    /^מי\s+בקבוצה\s+(.+)$/i,
    /^מי\s+נמצא\s+בקבוצה\s+(.+)$/i,
    /^מי\s+נמצאים\s+בקבוצה\s+(.+)$/i,
  ];

  for (
    const pattern of
      naturalRosterPatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return {
        type: "LIST_GROUP",
        groupName:
          cleanManagerPart(
            match[1]
          ),
      };
    }
  }

  /*
   * =======================================================
   * העברה
   * =======================================================
   */

  const movePatterns = [
    /^(?:תעביר|העבר)\s+(?:את\s+)?(.+?)\s+מקבוצה\s+(.+?)\s+לקבוצה\s+(.+)$/i,
    /^(?:תעביר|העבר)\s+(?:את\s+)?(.+?)\s+מ(?:קבוצת\s+)?(.+?)\s+ל(?:קבוצת\s+)?(.+)$/i,
  ];

  for (
    const pattern of
      movePatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return {
        type:
          "MOVE_TRAINEE",

        traineeName:
          cleanManagerPart(
            match[1]
          ),

        fromGroupName:
          cleanManagerPart(
            match[2]
          ),

        toGroupName:
          cleanManagerPart(
            match[3]
          ),
      };
    }
  }

  /*
   * =======================================================
   * הוספה
   * =======================================================
   */

  const addPatterns = [
    /^(?:תוסיף|הוסף|תוסיפי|הוסיפי)\s+(?:את\s+)?(.+?)\s+לקבוצה\s+(.+)$/i,
    /^(?:תוסיף|הוסף|תוסיפי|הוסיפי)\s+(?:את\s+)?(.+?)\s+ל(?:קבוצת\s+)?(.+)$/i,
  ];

  for (
    const pattern of
      addPatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return {
        type:
          "ADD_TRAINEE",

        traineeName:
          cleanManagerPart(
            match[1]
          ),

        groupName:
          cleanManagerPart(
            match[2]
          ),

        notes: null,
      };
    }
  }

  /*
   * =======================================================
   * הסרה
   * =======================================================
   */

  const removePatterns = [
    /^(?:תוריד|תסיר|הסר|הורד|תורידי|תסירי)\s+(?:את\s+)?(.+?)\s+מקבוצה\s+(.+)$/i,
    /^(?:תוריד|תסיר|הסר|הורד|תורידי|תסירי)\s+(?:את\s+)?(.+?)\s+מ(?:קבוצת\s+)?(.+)$/i,
  ];

  for (
    const pattern of
      removePatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return {
        type:
          "REMOVE_TRAINEE",

        traineeName:
          cleanManagerPart(
            match[1]
          ),

        groupName:
          cleanManagerPart(
            match[2]
          ),
      };
    }
  }

  return null;
}

/*
 * =========================================================
 * פקודות ניהול – טבעיות + תאימות לפורמט הישן
 * =========================================================
 */

function parseManagerCommand(
  message = ""
) {
  const text =
    cleanStaffText(
      message
    );

  if (!text) {
    return null;
  }

  const naturalCommand =
    parseNaturalManagerCommand(
      text
    );

  if (naturalCommand) {
    return naturalCommand;
  }

  const rosterMatch =
    text.match(
      /^רשימת\s+קבוצה\s+(.+)$/i
    );

  if (rosterMatch) {
    return {
      type: "LIST_GROUP",

      groupName:
        cleanManagerPart(
          rosterMatch[1]
        ),
    };
  }

  const addMatch =
    text.match(
      /^הוסף\s+מתאמן\s+([^|]+)\|([^|]+)(?:\|(.+))?$/i
    );

  if (addMatch) {
    return {
      type:
        "ADD_TRAINEE",

      groupName:
        cleanManagerPart(
          addMatch[1]
        ),

      traineeName:
        cleanManagerPart(
          addMatch[2]
        ),

      notes:
        addMatch[3]
          ? cleanManagerPart(
              addMatch[3]
            )
          : null,
    };
  }

  const removeMatch =
    text.match(
      /^הסר\s+מתאמן\s+([^|]+)\|(.+)$/i
    );

  if (removeMatch) {
    return {
      type:
        "REMOVE_TRAINEE",

      groupName:
        cleanManagerPart(
          removeMatch[1]
        ),

      traineeName:
        cleanManagerPart(
          removeMatch[2]
        ),
    };
  }

  const moveMatch =
    text.match(
      /^העבר\s+מתאמן\s+([^|]+)\|([^|]+)\|(.+)$/i
    );

  if (moveMatch) {
    return {
      type:
        "MOVE_TRAINEE",

      fromGroupName:
        cleanManagerPart(
          moveMatch[1]
        ),

      toGroupName:
        cleanManagerPart(
          moveMatch[2]
        ),

      traineeName:
        cleanManagerPart(
          moveMatch[3]
        ),
    };
  }

  if (
    /^(?:תוסיף|הוסף|תוסיפי|הוסיפי|תוריד|תסיר|הסר|הורד|תעביר|העבר|רשימת\s+קבוצה|תראה\s+לי\s+(?:את\s+)?הרשימה|מי\s+בקבוצה)\b/i.test(
      text
    )
  ) {
    return {
      type:
        "INVALID_MANAGER_COMMAND",
    };
  }

  return null;
}

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
    "נוכחות צעירה שלישי",
    "ישראל ישראלי",
    "דני כהן",
    "נועה לוי",
  ].join("\n");
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
    getStaffName(
      managerPhone
    );

  if (
    action ===
    "ADD_TRAINEE"
  ) {
    const notes =
      result.trainee?.notes
        ? `\n📝 הערה: ${result.trainee.notes}`
        : "";

    return [
      "🔐 עדכון רשימת מתאמנים",
      "",
      `👤 בוצע על ידי: ${managerName}`,
      "",
      "➕ נוסף מתאמן",
      `🎾 שם: ${result.trainee.name}`,
      `👥 קבוצה: ${result.group.name}${notes}`,
    ].join("\n");
  }

  if (
    action ===
    "REMOVE_TRAINEE"
  ) {
    return [
      "🔐 עדכון רשימת מתאמנים",
      "",
      `👤 בוצע על ידי: ${managerName}`,
      "",
      "➖ הוסר מתאמן",
      `🎾 שם: ${result.trainee.name}`,
      `👥 קבוצה: ${result.group.name}`,
    ].join("\n");
  }

  if (
    action ===
    "MOVE_TRAINEE"
  ) {
    return [
      "🔐 עדכון רשימת מתאמנים",
      "",
      `👤 בוצע על ידי: ${managerName}`,
      "",
      "🔄 מתאמן הועבר קבוצה",
      `🎾 שם: ${result.trainee.name}`,
      `⬅️ מקבוצה: ${result.fromGroup.name}`,
      `➡️ לקבוצה: ${result.toGroup.name}`,
    ].join("\n");
  }

  return null;
}

async function sendManagerAdminNotification({
  action,
  result,
  managerPhone,
}) {
  const managerPhones =
    getManagerPhones();

  if (
    managerPhones.length === 0
  ) {
    console.warn(
      "⚠️ לא הוגדרו מנהלים לקבלת עדכון."
    );

    return false;
  }

  const normalizedReporter =
    normalizePhone(
      managerPhone
    );

  const recipients =
    managerPhones.filter(
      (phone) =>
        normalizePhone(phone) !==
        normalizedReporter
    );

  if (
    recipients.length === 0
  ) {
    return true;
  }

  const notification =
    buildManagerAdminNotification({
      action,
      result,
      managerPhone,
    });

  if (!notification) {
    return true;
  }

  let allSent =
    true;

  for (
    const recipient of recipients
  ) {
    try {
      await sendWhatsAppMessage(
        recipient,
        notification
      );

      console.log(
        "✅ עדכון שינוי ברשימת מתאמנים נשלח למנהל:",
        {
          recipient,
          action,
          trainee:
            result.trainee?.name,
        }
      );
    } catch (error) {
      allSent =
        false;

      console.error(
        "❌ שליחת עדכון שינוי למנהל נכשלה:",
        {
          recipient,
          action,
          status:
            error.response?.status,
          data:
            error.response?.data,
          message:
            error.message,
        }
      );
    }
  }

  return allSent;
}

/*
 * =========================================================
 * ביצוע פקודות מנהל
 * =========================================================
 */

async function handleManagerCommand({
  userId,
  command,
  managerPhone,
}) {
  try {
    let result;

    switch (
      command.type
    ) {
      case "LIST_GROUP": {
        result =
          await getGroupRoster(
            command.groupName
          );

        const reply =
          buildGroupRosterMessage(
            result
          );

        await sendWhatsAppMessage(
          userId,
          reply
        );

        return true;
      }

      case "ADD_TRAINEE": {
        result =
          await addTrainee({
            groupName:
              command.groupName,

            traineeName:
              command.traineeName,

            notes:
              command.notes,
          });

        await sendWhatsAppMessage(
          userId,
          result.message
        );

        if (
          result.success
        ) {
          const notificationSent =
            await sendManagerAdminNotification({
              action:
                "ADD_TRAINEE",
              result,
              managerPhone,
            });

          if (
            !notificationSent
          ) {
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

      case "REMOVE_TRAINEE": {
        result =
          await removeTrainee({
            groupName:
              command.groupName,

            traineeName:
              command.traineeName,
          });

        await sendWhatsAppMessage(
          userId,
          result.message
        );

        if (
          result.success
        ) {
          const notificationSent =
            await sendManagerAdminNotification({
              action:
                "REMOVE_TRAINEE",
              result,
              managerPhone,
            });

          if (
            !notificationSent
          ) {
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

      case "MOVE_TRAINEE": {
        result =
          await moveTrainee({
            fromGroupName:
              command.fromGroupName,

            toGroupName:
              command.toGroupName,

            traineeName:
              command.traineeName,
          });

        await sendWhatsAppMessage(
          userId,
          result.message
        );

        if (
          result.success
        ) {
          const notificationSent =
            await sendManagerAdminNotification({
              action:
                "MOVE_TRAINEE",
              result,
              managerPhone,
            });

          if (
            !notificationSent
          ) {
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

      case "INVALID_MANAGER_COMMAND": {
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

      default:
        return false;
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בפקודת מנהל:",
      {
        command,
        message:
          error.message,
        stack:
          error.stack,
      }
    );

    await sendWhatsAppMessage(
      userId,
      "❌ אירעה שגיאה בביצוע פעולת הניהול."
    );

    return true;
  }
}

/*
 * =========================================================
 * עזרי קבוצות
 * =========================================================
 */

async function buildGroupsHelpMessage() {
  try {
    const groups =
      await getActiveGroups();

    if (
      !Array.isArray(
        groups
      ) ||
      groups.length === 0
    ) {
      return "כרגע אין קבוצות פעילות במערכת.";
    }

    const grouped =
      new Map();

    for (
      const group of groups
    ) {
      const branch =
        group.branch ||
        "ללא סניף";

      if (
        !grouped.has(
          branch
        )
      ) {
        grouped.set(
          branch,
          []
        );
      }

      grouped
        .get(branch)
        .push(group);
    }

    const lines = [
      "🎾 הקבוצות הפעילות:",
    ];

    for (
      const [
        branch,
        branchGroups,
      ] of grouped.entries()
    ) {
      lines.push(
        "",
        `📍 ${branch}`
      );

      for (
        const group of
          branchGroups
      ) {
        lines.push(
          `• ${group.name}`
        );
      }
    }

    return lines.join(
      "\n"
    );
  } catch (error) {
    console.error(
      "❌ שגיאה בשליפת קבוצות:",
      error.message
    );

    return "לא ניתן היה לשלוף כרגע את רשימת הקבוצות.";
  }
}

function formatAttendanceDate(
  value
) {
  if (!value) {
    return "";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value.slice(
      0,
      10
    );
  }

  try {
    return new Intl.DateTimeFormat(
      "he-IL",
      {
        timeZone:
          "Asia/Jerusalem",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return String(
      value
    );
  }
}

function buildManagerAttendanceMessage(
  result
) {
  const dateText =
    formatAttendanceDate(
      result?.session
        ?.session_date
    );

  const absentLines =
    result.absent.length > 0
      ? result.absent.map(
          (trainee) =>
            `❌ ${trainee.name}`
        )
      : [
          "✅ אין נעדרים",
        ];

  const attendanceTitle =
    result.teamContext
      ? `${result.teamContext.teamLabel} (${result.teamContext.dayName})`
      : result.slot
        ? `${result.slot.dayName} ${result.slot.startTime}`
        : result.group.name;

  return [
    `📋 דיווח נוכחות – ${attendanceTitle}`,
    "",
    `📅 תאריך: ${dateText}`,
    `👤 דווח על ידי: ${result.submittedBy}`,
    "",
    `✅ הגיעו: ${result.presentCount} מתוך ${result.total}`,
    `❌ נעדרו: ${result.absentCount}`,
    "",
    "לא הגיעו:",
    ...absentLines,
  ].join("\n");
}

async function sendAttendanceToManagers(
  result,
  reporterPhone
) {
  const managerPhones =
    getManagerPhones();

  if (
    managerPhones.length === 0
  ) {
    console.warn(
      "⚠️ לא הוגדרו מספרי מנהלים."
    );

    return false;
  }

  const normalizedReporter =
    normalizePhone(
      reporterPhone
    );

  const recipients =
    managerPhones.filter(
      (phone) =>
        normalizePhone(phone) !==
        normalizedReporter
    );

  if (
    recipients.length === 0
  ) {
    console.log(
      "ℹ️ אין מנהל נוסף שאליו צריך לשלוח את הדיווח."
    );

    return true;
  }

  const managerMessage =
    buildManagerAttendanceMessage(
      result
    );

  let allSent =
    true;

  for (
    const managerPhone of
      recipients
  ) {
    try {
      await sendWhatsAppMessage(
        managerPhone,
        managerMessage
      );

      console.log(
        "✅ דיווח נוכחות נשלח למנהל:",
        {
          managerPhone,
          group:
            result.group.name,
        }
      );
    } catch (error) {
      allSent =
        false;

      console.error(
        "❌ שליחת דיווח נוכחות למנהל נכשלה:",
        {
          managerPhone,
          status:
            error.response?.status,
          data:
            error.response?.data,
          message:
            error.message,
        }
      );
    }
  }

  return allSent;
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
  const managerCommand =
    parseManagerCommand(
      userMessage
    );

  if (
    managerCommand
  ) {
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
      command:
        managerCommand,
      managerPhone:
        staffPhone,
    });
  }

  const attendanceCommand =
    parseAttendanceCommand(
      userMessage
    );

  if (
    !attendanceCommand
      .isAttendanceCommand
  ) {
    const groupsHelp =
      await buildGroupsHelpMessage();

    const staffReply =
      manager
        ? [
            buildManagerCommandsHelp(),
            "",
            groupsHelp,
          ].join("\n")
        : [
            "🎾 זוהית כמאמן מורשה.",
            "",
            "כדי לדווח נוכחות:",
            "",
            "נוכחות א+ד 16:00",
            "שם מתאמן",
            "שם מתאמן",
            "שם מתאמן",
            "",
            groupsHelp,
            "",
            "ℹ️ מאמנים יכולים לדווח נוכחות בלבד.",
          ].join("\n");

    await sendWhatsAppMessage(
      userId,
      staffReply
    );

    return true;
  }

  if (
    !attendanceCommand
      .groupName
  ) {
    const groupsHelp =
      await buildGroupsHelpMessage();

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
        groupsHelp,
      ].join("\n")
    );

    return true;
  }

  if (
    attendanceCommand
      .presentNames
      .length === 0
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
        "שם מתאמן",
      ].join("\n")
    );

    return true;
  }

  try {
    const result =
      await submitAttendance({
        groupName:
          attendanceCommand
            .groupName,

        presentNames:
          attendanceCommand
            .presentNames,

        submittedByPhone:
          staffPhone,
      });

    if (
      !result.success
    ) {
      let reply =
        result.message ||
        "❌ לא ניתן היה לשמור את הנוכחות.";

      if (
        result.code ===
        "GROUP_NOT_FOUND"
      ) {
        const groupsHelp =
          await buildGroupsHelpMessage();

        reply = [
          reply,
          "",
          groupsHelp,
        ].join("\n");
      }

      await sendWhatsAppMessage(
        userId,
        reply
      );

      return true;
    }

    const staffReply =
      buildAttendanceSummary(
        result
      );

    await sendWhatsAppMessage(
      userId,
      staffReply
    );

    const managersSent =
      await sendAttendanceToManagers(
        result,
        staffPhone
      );

    if (
      !managersSent
    ) {
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
        userId,
        staffPhone,
        message:
          error.message,
        stack:
          error.stack,
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
 * בוט לקוחות
 * =========================================================
 */

function hasCompleteLeadDetails(
  user
) {
  const hasName =
    typeof user.name ===
      "string" &&
    user.name.trim().length >
      0;

  const hasAge =
    user.age !== null &&
    user.age !== undefined &&
    String(user.age)
      .trim()
      .length > 0;

  const hasBranch =
    typeof user.branch ===
      "string" &&
    user.branch.trim().length >
      0;

  const hasPhone =
    typeof user.phone ===
      "string" &&
    user.phone.trim().length >
      0;

  const hasGoal =
    typeof user.goal ===
      "string" &&
    user.goal.trim().length >
      0;

  return (
    hasName &&
    hasAge &&
    hasBranch &&
    hasPhone &&
    hasGoal
  );
}

function hasExistingProfileData(
  user = {}
) {
  return Boolean(
    user.name ||
      user.age ||
      user.city ||
      user.height ||
      user.audience ||
      user.equipment_topic ||
      user.experience ||
      user.branch ||
      user.phone ||
      user.goal ||
      user.regular_flow_active ===
        true ||
      user.summary_sent ===
        true
  );
}

function isWaitingForSource(
  conversationHistory = []
) {
  const lastAssistantMessage =
    [...conversationHistory]
      .reverse()
      .find(
        (item) =>
          item?.role ===
            "assistant" &&
          typeof item?.content ===
            "string"
      );

  if (
    !lastAssistantMessage
  ) {
    return false;
  }

  return lastAssistantMessage
    .content
    .includes(
      "איך שמעתם עלינו"
    );
}

function cleanText(
  value = ""
) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeQuestion(
  message = ""
) {
  const text =
    cleanText(
      message
    ).toLowerCase();

  if (!text) {
    return false;
  }

  if (
    text.includes("?")
  ) {
    return true;
  }

  const questionPatterns = [
    /^מה\b/,
    /^מתי\b/,
    /^איך\b/,
    /^איפה\b/,
    /^האם\b/,
    /^כמה\b/,
    /^איזה\b/,
    /^איזו\b/,
    /^איזה ימים\b/,
    /^באיזה\b/,
    /^באילו\b/,
    /^אפשר\b/,
    /^יש\b/,
    /^עד מתי\b/,
  ];

  return questionPatterns.some(
    (pattern) =>
      pattern.test(text)
  );
}

function extractSpecialAge(
  message = ""
) {
  const text =
    cleanText(
      message
    );

  const match =
    text.match(
      /(?:בן|בת|גיל)?\s*(\d{1,3})/
    );

  if (!match) {
    return null;
  }

  const age =
    Number(
      match[1]
    );

  if (
    !Number.isInteger(
      age
    ) ||
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
  const text =
    cleanText(
      userMessage
    );

  if (!text) {
    return null;
  }

  switch (field) {
    case "name": {
      if (
        looksLikeQuestion(
          text
        ) ||
        text.length < 2 ||
        text.length > 80 ||
        /\d/.test(text)
      ) {
        return null;
      }

      return {
        name: text,
      };
    }

    case "age": {
      const age =
        extractSpecialAge(
          text
        );

      if (!age) {
        return null;
      }

      return {
        age,
        audience:
          age >= 18
            ? "adult"
            : "child",
      };
    }

    case "city": {
      if (
        looksLikeQuestion(
          text
        ) ||
        text.length < 2 ||
        text.length > 80
      ) {
        return null;
      }

      return {
        city: text,
      };
    }

    case "experience": {
      if (
        looksLikeQuestion(
          text
        ) ||
        text.length < 2 ||
        text.length > 500
      ) {
        return null;
      }

      return {
        experience:
          text,
      };
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

    default:
      return "אשמח לקבל את הפרט שביקשתי כדי שנוכל להמשיך 😊";
  }
}

function shouldHandleSpecialFaqDuringOnboarding(
  userMessage
) {
  return looksLikeQuestion(
    userMessage
  );
}

function shouldReturnToSpecialFlow(
  userMessage,
  currentSource
) {
  const detectedSource =
    detectSpecialSource(
      userMessage
    );

  return (
    detectedSource !== null &&
    detectedSource ===
      currentSource
  );
}

async function handleSpecialSourceConversation({
  userId,
  userMessage,
  currentUser,
}) {
  if (
    !currentUser.source_confirmed ||
    !isSpecialSource(
      currentUser.source
    )
  ) {
    return false;
  }

  if (
    currentUser
      .regular_flow_active ===
    true
  ) {
    if (
      shouldReturnToSpecialFlow(
        userMessage,
        currentUser.source
      )
    ) {
      currentUser =
        await saveUser(
          userId,
          {
            regular_flow_active:
              false,
            branch:
              SPECIAL_BRANCH,
          }
        );
    } else {
      return false;
    }
  }

  if (
    isRegularProgramInterest(
      userMessage,
      currentUser.source
    )
  ) {
    await saveUser(
      userId,
      {
        regular_flow_active:
          true,
        branch:
          null,
      }
    );

    return false;
  }

  if (
    currentUser.branch !==
    SPECIAL_BRANCH
  ) {
    currentUser =
      await saveUser(
        userId,
        {
          branch:
            SPECIAL_BRANCH,
        }
      );
  }

  const missingField =
    getMissingSpecialField(
      currentUser
    );

  if (!missingField) {
    await addMessage(
      userId,
      "user",
      userMessage
    );

    const faqReply =
      getSpecialFaqReply(
        userMessage,
        currentUser.source
      );

    await addMessage(
      userId,
      "assistant",
      faqReply
    );

    await sendWhatsAppMessage(
      userId,
      faqReply
    );

    return true;
  }

  if (
    shouldHandleSpecialFaqDuringOnboarding(
      userMessage
    )
  ) {
    await addMessage(
      userId,
      "user",
      userMessage
    );

    const faqReply =
      getSpecialFaqReply(
        userMessage,
        currentUser.source
      );

    const pendingQuestion =
      getQuestionForField(
        missingField
      );

    const combinedReply = [
      faqReply,
      "",
      "וכדי שנוכל להמשיך בהרשמה:",
      pendingQuestion,
    ].join("\n");

    await addMessage(
      userId,
      "assistant",
      combinedReply
    );

    await sendWhatsAppMessage(
      userId,
      combinedReply
    );

    return true;
  }

  const fieldUpdate =
    buildSpecialFieldUpdate(
      missingField,
      userMessage
    );

  await addMessage(
    userId,
    "user",
    userMessage
  );

  if (!fieldUpdate) {
    const invalidReply =
      buildInvalidSpecialFieldReply(
        missingField
      );

    await addMessage(
      userId,
      "assistant",
      invalidReply
    );

    await sendWhatsAppMessage(
      userId,
      invalidReply
    );

    return true;
  }

  currentUser =
    await saveUser(
      userId,
      {
        ...fieldUpdate,
        branch:
          SPECIAL_BRANCH,
      }
    );

  const nextMissingField =
    getMissingSpecialField(
      currentUser
    );

  if (
    nextMissingField
  ) {
    const nextQuestion =
      getQuestionForField(
        nextMissingField
      );

    await addMessage(
      userId,
      "assistant",
      nextQuestion
    );

    await sendWhatsAppMessage(
      userId,
      nextQuestion
    );

    return true;
  }

  const rulesReply =
    buildSpecialRulesMessage(
      currentUser.source
    );

  await addMessage(
    userId,
    "assistant",
    rulesReply
  );

  await sendWhatsAppMessage(
    userId,
    rulesReply
  );

  return true;
}

/*
 * =========================================================
 * מערכת לידים
 * =========================================================
 */

function formatManagerLeadMessage(
  user,
  conversationHistory = []
) {
  const cleanPhone =
    String(
      user.phone || ""
    ).replace(
      /\D/g,
      ""
    );

  let internationalPhone =
    cleanPhone;

  if (
    cleanPhone.startsWith(
      "0"
    )
  ) {
    internationalPhone =
      `972${cleanPhone.substring(
        1
      )}`;
  }

  const whatsappLink =
    internationalPhone
      ? `https://wa.me/${internationalPhone}`
      : "לא זמין";

  const formattedConversation =
    conversationHistory
      .filter(
        (
          conversationMessage
        ) =>
          conversationMessage
            ?.content &&
          [
            "user",
            "assistant",
          ].includes(
            conversationMessage.role
          )
      )
      .map(
        (
          conversationMessage
        ) => {
          const speaker =
            conversationMessage.role ===
            "user"
              ? "👤 לקוח"
              : "🤖 בוט";

          return (
            `${speaker}:\n` +
            conversationMessage.content
          );
        }
      )
      .join("\n\n");

  const receivedAt =
    new Intl.DateTimeFormat(
      "he-IL",
      {
        timeZone:
          "Asia/Jerusalem",
        dateStyle:
          "short",
        timeStyle:
          "short",
      }
    ).format(
      new Date()
    );

  return [
    "🎾 ליד חדש - Tennis Sport",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    `👤 שם: ${user.name}`,
    `🎂 גיל: ${user.age}`,
    `📍 סניף: ${user.branch}`,
    `📞 טלפון: ${user.phone}`,
    `🎯 תחום התעניינות: ${user.goal}`,
    `🕒 התקבל: ${receivedAt}`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "💬 השיחה עם הלקוח:",
    "",
    formattedConversation ||
      "לא קיימת היסטוריית שיחה.",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "📲 לפתיחת שיחה עם הלקוח:",
    whatsappLink,
  ].join("\n");
}

function getMessageId(
  message
) {
  return (
    message?.id ||
    message?.message_id ||
    message?.key?.id ||
    null
  );
}

function rememberProcessedMessage(
  messageId
) {
  if (!messageId) {
    return;
  }

  processedMessageIds.add(
    messageId
  );

  if (
    processedMessageIds.size >
    MAX_PROCESSED_MESSAGE_IDS
  ) {
    const oldestMessageId =
      processedMessageIds
        .values()
        .next().value;

    processedMessageIds.delete(
      oldestMessageId
    );
  }
}

function enqueueUserMessage(
  userId,
  task
) {
  const previousTask =
    userQueues.get(
      userId
    ) ||
    Promise.resolve();

  const currentTask =
    previousTask
      .catch(() => {})
      .then(task);

  userQueues.set(
    userId,
    currentTask
  );

  currentTask.finally(
    () => {
      if (
        userQueues.get(
          userId
        ) ===
        currentTask
      ) {
        userQueues.delete(
          userId
        );
      }
    }
  );

  return currentTask;
}

async function sendLeadToManager(
  userId,
  updatedUser
) {
  if (
    !CLUB_MANAGER_PHONE
  ) {
    console.warn(
      "⚠️ CLUB_MANAGER_PHONE לא הוגדר ב-Railway"
    );

    return false;
  }

  try {
    const updatedConversationHistory =
      await getConversation(
        userId
      );

    const managerMessage =
      formatManagerLeadMessage(
        updatedUser,
        updatedConversationHistory
      );

    await sendWhatsAppMessage(
      CLUB_MANAGER_PHONE,
      managerMessage
    );

    return true;
  } catch (error) {
    console.error(
      "❌ שליחת הליד למנהל נכשלה:",
      {
        status:
          error.response?.status,
        data:
          error.response?.data,
        message:
          error.message,
      }
    );

    return false;
  }
}

/*
 * =========================================================
 * עיבוד הודעה נכנסת
 * =========================================================
 */

async function processIncomingMessage(
  message
) {
  if (
    !message ||
    message.from_me ===
      true
  ) {
    return;
  }

  if (
    message.type !==
    "text"
  ) {
    return;
  }

  const userMessage =
    message.text
      ?.body
      ?.trim();

  const userId =
    message.chat_id ||
    message.from;

  if (
    !userMessage ||
    !userId
  ) {
    return;
  }

  const detectedPhone =
    whatsappIdToPhone(
      userId
    );

  console.log(
    `📨 הודעה מ-${userId}: ${userMessage}`
  );

  /*
   * איפוס
   */
  if (
    userMessage ===
    "איפוס שיחה"
  ) {
    await clearConversation(
      userId
    );

    await clearUser(
      userId
    );

    await sendWhatsAppMessage(
      userId,
      "השיחה והפרטים שנשמרו אופסו בהצלחה 😊"
    );

    return;
  }

  const manager =
    isManagerPhone(
      detectedPhone
    );

  const coach =
    isCoachPhone(
      detectedPhone
    );

  /*
   * בדיקת מנהל
   */
  if (
    userMessage ===
    "בדיקת מנהל"
  ) {
    if (!manager) {
      await sendWhatsAppMessage(
        userId,
        "❌ הפקודה אינה זמינה."
      );

      return;
    }

    const managerPhones =
      getManagerPhones();

    let sentCount =
      0;

    for (
      const managerPhone of
        managerPhones
    ) {
      if (
        normalizePhone(
          managerPhone
        ) ===
        normalizePhone(
          detectedPhone
        )
      ) {
        continue;
      }

      await sendWhatsAppMessage(
        managerPhone,
        "🧪 הודעת בדיקה ממערכת הניהול של Tennis Sport"
      );

      sentCount +=
        1;
    }

    await sendWhatsAppMessage(
      userId,
      sentCount > 0
        ? `✅ הודעת הבדיקה נשלחה ל-${sentCount} מנהלים נוספים.`
        : "✅ אתה המנהל היחיד שמוגדר כרגע במערכת."
    );

    return;
  }

  /*
   * אנשי צוות נעצרים כאן
   * ולא נכנסים לבוט הלקוחות.
   */
  if (
    manager ||
    coach
  ) {
    await handleStaffMessage({
      userId,
      userMessage,
      staffPhone:
        detectedPhone,
      manager,
    });

    return;
  }

  /*
   * =========================================================
   * לקוחות
   * =========================================================
   */

  let currentUser =
    await getUser(
      userId
    );

  const previousConversationHistory =
    await getConversation(
      userId
    );

  const waitingForSource =
    isWaitingForSource(
      previousConversationHistory
    );

  if (
    shouldAskSource(
      currentUser
    ) &&
    !waitingForSource &&
    (
      previousConversationHistory.length >
        0 ||
      hasExistingProfileData(
        currentUser
      )
    )
  ) {
    currentUser =
      await saveUser(
        userId,
        {
          source:
            "regular",
          source_confirmed:
            true,
          regular_flow_active:
            false,
        }
      );
  }

  if (
    shouldAskSource(
      currentUser
    ) &&
    !waitingForSource
  ) {
    const customerPhone =
      currentUser.phone ||
      detectedPhone;

    await saveUser(
      userId,
      {
        phone:
          customerPhone,
      }
    );

    await addMessage(
      userId,
      "user",
      userMessage
    );

    const welcomeReply =
      getEntryWelcomeMessage();

    await addMessage(
      userId,
      "assistant",
      welcomeReply
    );

    await sendWhatsAppMessage(
      userId,
      welcomeReply
    );

    return;
  }

  if (
    shouldAskSource(
      currentUser
    ) &&
    waitingForSource
  ) {
    const sourceResult =
      resolveSource(
        userMessage
      );

    const sourceUpdates = {
      source:
        sourceResult.source,
      source_confirmed:
        true,
      regular_flow_active:
        false,
    };

    if (
      sourceResult.isSpecial
    ) {
      sourceUpdates.branch =
        SPECIAL_BRANCH;
    }

    currentUser =
      await saveUser(
        userId,
        sourceUpdates
      );

    await addMessage(
      userId,
      "user",
      userMessage
    );

    if (
      sourceResult.isSpecial
    ) {
      const specialSourceReply =
        buildSpecialWelcome(
          sourceResult.source
        );

      await addMessage(
        userId,
        "assistant",
        specialSourceReply
      );

      await sendWhatsAppMessage(
        userId,
        specialSourceReply
      );

      return;
    }

    const regularEntryReply =
      [
        "מעולה, תודה 😊",
        "",
        "איך אפשר לעזור לכם היום?",
      ].join("\n");

    await addMessage(
      userId,
      "assistant",
      regularEntryReply
    );

    await sendWhatsAppMessage(
      userId,
      regularEntryReply
    );

    return;
  }

  if (
    currentUser.source_confirmed ===
      true &&
    isSpecialSource(
      currentUser.source
    )
  ) {
    const handledSpecial =
      await handleSpecialSourceConversation(
        {
          userId,
          userMessage,
          currentUser,
        }
      );

    if (
      handledSpecial
    ) {
      return;
    }

    currentUser =
      await getUser(
        userId
      );
  }

  const extractedDetails =
    extractUserDetails(
      userMessage,
      currentUser
    );

  const profileUpdates =
    buildProfileUpdates(
      userMessage,
      currentUser
    );

  Object.assign(
    extractedDetails,
    profileUpdates
  );

  if (
    !currentUser.phone &&
    !extractedDetails.phone
  ) {
    extractedDetails.phone =
      detectedPhone;
  }

  const updatedUser =
    await saveUser(
      userId,
      extractedDetails
    );

  await addMessage(
    userId,
    "user",
    userMessage
  );

  const conversationHistory =
    await getConversation(
      userId
    );

  const completeLead =
    hasCompleteLeadDetails(
      updatedUser
    );

  const shouldSendLeadSummary =
    completeLead &&
    updatedUser.summary_sent !==
      true;

  const reply =
    await createReply({
      userId,
      userMessage,
      updatedUser,
      conversationHistory,
      shouldSendLeadSummary,
      formatLeadSummary,
    });

  if (
    !reply ||
    typeof reply !==
      "string"
  ) {
    throw new Error(
      "The bot generated an empty reply"
    );
  }

  await addMessage(
    userId,
    "assistant",
    reply
  );

  await sendWhatsAppMessage(
    userId,
    reply
  );

  const finalUser =
    await getUser(
      userId
    );

  const finalCompleteLead =
    hasCompleteLeadDetails(
      finalUser
    );

  const shouldSendManagerLead =
    finalCompleteLead &&
    finalUser.summary_sent !==
      true;

  if (
    shouldSendManagerLead
  ) {
    const managerMessageSent =
      await sendLeadToManager(
        userId,
        finalUser
      );

    if (
      managerMessageSent
    ) {
      await markSummarySent(
        userId
      );
    }
  }
}

/*
 * =========================================================
 * Webhook
 * =========================================================
 */

async function handleWebhook(
  req,
  res
) {
  res.status(200).json({
    success: true,
    message:
      "Webhook received",
  });

  try {
    if (
      req.body?.event?.type !==
      "messages"
    ) {
      return;
    }

    const messages =
      req.body?.messages;

    if (
      !Array.isArray(
        messages
      )
    ) {
      return;
    }

    for (
      const message of
        messages
    ) {
      const messageId =
        getMessageId(
          message
        );

      if (
        messageId &&
        processedMessageIds.has(
          messageId
        )
      ) {
        continue;
      }

      rememberProcessedMessage(
        messageId
      );

      const userId =
        message?.chat_id ||
        message?.from;

      if (!userId) {
        continue;
      }

      enqueueUserMessage(
        userId,
        async () => {
          try {
            await processIncomingMessage(
              message
            );
          } catch (error) {
            console.error(
              `❌ שגיאה בעיבוד הודעה עבור ${userId}:`,
              error.response?.data ||
                error.message
            );
          }
        }
      );
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול ב-Webhook:",
      error.response?.data ||
        error.message
    );
  }
}

module.exports = {
  handleWebhook,
};