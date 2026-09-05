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
  getActiveGroups,
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
 * המנהל הראשי נשאר עבור
 * מערכת הלידים הקיימת.
 */
const CLUB_MANAGER_PHONE =
  process.env.CLUB_MANAGER_PHONE;

const SPECIAL_BRANCH =
  "גלי הדר – ראשון לציון";

/*
 * =========================================================
 * מערכת נוכחות
 * =========================================================
 */

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

function parseAttendanceCommand(
  message = ""
) {
  const rawText =
    String(message).trim();

  if (!rawText) {
    return {
      isAttendanceCommand:
        false,
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
      isAttendanceCommand:
        false,
    };
  }

  const firstLine =
    lines[0]
      .replace(/\*/g, "")
      .trim();

  let groupName = "";

  /*
   * אפשרות:
   *
   * נוכחות צעירה
   */
  const attendanceMatch =
    firstLine.match(
      /^נוכחות\s*[:\-–—]?\s*(.*)$/i
    );

  if (attendanceMatch) {
    groupName =
      cleanAttendanceName(
        attendanceMatch[1]
      );
  } else {
    /*
     * אפשר גם:
     *
     * צעירה
     * סתיו
     * רז
     */
    const possibleGroupName =
      cleanAttendanceName(
        firstLine
      );

    const normalizedGroupName =
      possibleGroupName
        .toLowerCase();

    if (
      normalizedGroupName ===
        "צעירה" ||
      normalizedGroupName ===
        "בוגרת"
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
    isAttendanceCommand:
      true,
    groupName,
    presentNames,
  };
}

async function buildGroupsHelpMessage() {
  try {
    const groups =
      await getActiveGroups();

    if (
      !Array.isArray(groups) ||
      groups.length === 0
    ) {
      return "כרגע אין קבוצות פעילות במערכת.";
    }

    return [
      "הקבוצות הפעילות:",
      ...groups.map(
        (group) =>
          `• ${group.name}`
      ),
    ].join("\n");
  } catch (error) {
    console.error(
      "❌ שגיאה בשליפת קבוצות:",
      error.message
    );

    return "לא ניתן היה לשלוף כרגע את רשימת הקבוצות.";
  }
}

function buildManagerAttendanceMessage(
  result
) {
  const dateText =
    result?.session
      ?.session_date ||
    "";

  const absentLines =
    result.absent.length > 0
      ? result.absent.map(
          (trainee) =>
            `❌ ${trainee.name}`
        )
      : [
          "✅ אין נעדרים",
        ];

  return [
    `📋 דיווח נוכחות – ${result.group.name}`,
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

/*
 * שולח דיווח נוכחות לכל המנהלים.
 *
 * אם אחד המנהלים הוא זה שדיווח,
 * לא שולחים אליו שוב את אותו הדיווח.
 */
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

  /*
   * למשל אם מוגדר רק מנהל אחד
   * והוא עצמו דיווח.
   */
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
    const managerPhone of recipients
  ) {
    try {
      console.log(
        "📨 שולח דיווח נוכחות למנהל:",
        {
          group:
            result.group.name,
          managerPhone,
          submittedBy:
            result.submittedBy,
          present:
            result.presentCount,
          absent:
            result.absentCount,
        }
      );

      const managerResult =
        await sendWhatsAppMessage(
          managerPhone,
          managerMessage
        );

      console.log(
        "✅ דיווח הנוכחות נשלח למנהל:",
        {
          managerPhone,
          result:
            managerResult,
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
            "🔐 זוהית כמנהל המערכת.",
            "",
            "כרגע מערכת הנוכחות תומכת בדיווח נוכחות.",
            "",
            "אפשר לשלוח:",
            "",
            "נוכחות צעירה",
            "סתיו",
            "רז",
            "יונתן לוי",
            "",
            "או פשוט:",
            "",
            "צעירה",
            "סתיו",
            "רז",
            "יונתן לוי",
            "",
            groupsHelp,
          ].join("\n")
        : [
            "🎾 זוהית כמאמן מורשה.",
            "",
            "כדי לדווח נוכחות אפשר לשלוח:",
            "",
            "נוכחות צעירה",
            "סתיו",
            "רז",
            "יונתן לוי",
            "",
            "או פשוט:",
            "",
            "צעירה",
            "סתיו",
            "רז",
            "יונתן לוי",
            "",
            groupsHelp,
            "",
            "ℹ️ מאמנים יכולים לדווח נוכחות בלבד. הוספה או שינוי של מתאמנים מתבצעים רק על ידי מנהל.",
          ].join("\n");

    await sendWhatsAppMessage(
      userId,
      staffReply
    );

    return true;
  }

  if (
    !attendanceCommand.groupName
  ) {
    const groupsHelp =
      await buildGroupsHelpMessage();

    const reply = [
      "⚠️ חסר שם הקבוצה.",
      "",
      "יש לשלוח למשל:",
      "",
      "נוכחות צעירה",
      "סתיו",
      "רז",
      "יונתן לוי",
      "",
      groupsHelp,
    ].join("\n");

    await sendWhatsAppMessage(
      userId,
      reply
    );

    return true;
  }

  /*
   * לא שומרים דיווח ריק,
   * כדי לא לסמן בטעות
   * קבוצה שלמה כנעדרת.
   */
  if (
    attendanceCommand
      .presentNames
      .length === 0
  ) {
    const reply = [
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
    ].join("\n");

    await sendWhatsAppMessage(
      userId,
      reply
    );

    return true;
  }

  try {
    console.log(
      "📋 מתקבל דיווח נוכחות:",
      {
        userId,
        staffPhone,
        manager,
        group:
          attendanceCommand
            .groupName,
        presentNames:
          attendanceCommand
            .presentNames,
      }
    );

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

    if (!result.success) {
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

      console.warn(
        "⚠️ דיווח נוכחות לא נשמר:",
        {
          code:
            result.code,
          group:
            attendanceCommand
              .groupName,
          unknownNames:
            result.unknownNames,
        }
      );

      return true;
    }

    /*
     * שולחים למי שדיווח
     * את הסיכום המלא.
     */
    const staffReply =
      buildAttendanceSummary(
        result
      );

    await sendWhatsAppMessage(
      userId,
      staffReply
    );

    console.log(
      "✅ הנוכחות נשמרה:",
      {
        group:
          result.group.name,
        submittedBy:
          result.submittedBy,
        total:
          result.total,
        present:
          result.presentCount,
        absent:
          result.absentCount,
      }
    );

    /*
     * דיווח מאמן:
     * נשלח לכל המנהלים.
     *
     * דיווח מנהל:
     * נשלח רק למנהל/ים האחרים.
     */
    const managersSent =
      await sendAttendanceToManagers(
        result,
        staffPhone
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

function hasCompleteLeadDetails(user) {
  const hasName =
    typeof user.name === "string" &&
    user.name.trim().length > 0;

  const hasAge =
    user.age !== null &&
    user.age !== undefined &&
    String(user.age)
      .trim()
      .length > 0;

  const hasBranch =
    typeof user.branch === "string" &&
    user.branch.trim().length > 0;

  const hasPhone =
    typeof user.phone === "string" &&
    user.phone.trim().length > 0;

  const hasGoal =
    typeof user.goal === "string" &&
    user.goal.trim().length > 0;

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

  if (!lastAssistantMessage) {
    return false;
  }

  return lastAssistantMessage
    .content
    .includes(
      "איך שמעתם עלינו"
    );
}

function cleanText(value = "") {
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
    cleanText(message);

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
        name:
          text,
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
        city:
          text,
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
    currentUser.regular_flow_active ===
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

      console.log(
        "🔙 לקוח חזר מהמסלול הרגיל למסלול המיוחד:",
        {
          userId,
          source:
            currentUser.source,
          userMessage,
        }
      );
    } else {
      console.log(
        "➡️ ממשיך בשיחה על המסלול הרגיל:",
        {
          userId,
          source:
            currentUser.source,
          userMessage,
        }
      );

      return false;
    }
  }

  if (
    isRegularProgramInterest(
      userMessage,
      currentUser.source
    )
  ) {
    currentUser =
      await saveUser(
        userId,
        {
          regular_flow_active:
            true,
          branch:
            null,
        }
      );

    console.log(
      "💰 לקוח ממסלול מיוחד עבר להתעניין במסלול הרגיל:",
      {
        userId,
        source:
          currentUser.source,
        regularFlowActive:
          currentUser
            .regular_flow_active,
        userMessage,
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

    console.log(
      "💬 FAQ במסלול מיוחד:",
      {
        userId,
        source:
          currentUser.source,
        userMessage,
      }
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

    console.log(
      "💬 FAQ במהלך איסוף פרטים במסלול מיוחד:",
      {
        userId,
        source:
          currentUser.source,
        missingField,
        userMessage,
      }
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

    console.log(
      "⚠️ תשובה לא תקינה במסלול מיוחד:",
      {
        userId,
        source:
          currentUser.source,
        missingField,
        userMessage,
      }
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

  console.log(
    "💾 פרט נשמר במסלול מיוחד:",
    {
      userId,
      source:
        currentUser.source,
      field:
        missingField,
      value:
        fieldUpdate[
          missingField
        ],
    }
  );

  const nextMissingField =
    getMissingSpecialField(
      currentUser
    );

  if (nextMissingField) {
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

  console.log(
    "✅ מסלול מיוחד הושלם:",
    {
      userId,
      source:
        currentUser.source,
      name:
        currentUser.name,
      age:
        currentUser.age,
      city:
        currentUser.city,
      experience:
        currentUser.experience,
      branch:
        currentUser.branch,
    }
  );

  return true;
}

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

function getMessageId(message) {
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
    userQueues.get(userId) ||
    Promise.resolve();

  const currentTask =
    previousTask
      .catch(() => {
        // שגיאה קודמת לא תעצור את התור.
      })
      .then(task);

  userQueues.set(
    userId,
    currentTask
  );

  currentTask.finally(() => {
    if (
      userQueues.get(
        userId
      ) === currentTask
    ) {
      userQueues.delete(
        userId
      );
    }
  });

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

    console.log(
      "📨 מנסה לשלוח ליד למנהל:",
      {
        customerPhone:
          updatedUser.phone,
        customerName:
          updatedUser.name,
        customerAge:
          updatedUser.age,
        goal:
          updatedUser.goal,
        messageLength:
          managerMessage.length,
      }
    );

    const managerResult =
      await sendWhatsAppMessage(
        CLUB_MANAGER_PHONE,
        managerMessage
      );

    console.log(
      "✅ תשובת Whapi בשליחת הליד למנהל:",
      managerResult
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

async function processIncomingMessage(
  message
) {
  if (
    !message ||
    message.from_me === true
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
    "🔍 מזהי Whapi:",
    {
      from:
        message.from,
      chat_id:
        message.chat_id,
      selectedUserId:
        userId,
      detectedPhone,
    }
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

    const resetReply =
      "השיחה והפרטים שנשמרו אופסו בהצלחה 😊";

    await sendWhatsAppMessage(
      userId,
      resetReply
    );

    console.log(
      `✅ השיחה אופסה עבור ${userId}`
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
   * בדיקת מנהל זמינה
   * למנהלים בלבד.
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

    if (
      managerPhones.length === 0
    ) {
      await sendWhatsAppMessage(
        userId,
        "❌ לא הוגדרו מנהלים במערכת."
      );

      return;
    }

    try {
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
    } catch (error) {
      console.error(
        "❌ בדיקת מנהלים נכשלה:",
        {
          status:
            error.response?.status,
          data:
            error.response?.data,
          message:
            error.message,
        }
      );

      await sendWhatsAppMessage(
        userId,
        "❌ בדיקת המנהלים נכשלה."
      );
    }

    return;
  }

  /*
   * =========================================================
   * ניתוב אנשי צוות
   * =========================================================
   */
  if (
    manager ||
    coach
  ) {
    console.log(
      "🔐 הודעת איש צוות זוהתה:",
      {
        userId,
        phone:
          detectedPhone,
        role:
          manager
            ? "manager"
            : "coach",
      }
    );

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
   * מכאן והלאה - לקוחות
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

    console.log(
      "🧭 לקוח קיים סומן אוטומטית כ-regular:",
      {
        userId,
        source:
          currentUser.source,
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

    console.log(
      "🚪 שער הכניסה נשלח ללקוח חדש:",
      {
        userId,
      }
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

    console.log(
      "🧭 מקור הגעה זוהה:",
      {
        userId,
        source:
          sourceResult.source,
        isSpecial:
          sourceResult.isSpecial,
      }
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

      console.log(
        "🔐 הלקוח נותב למסלול מיוחד:",
        {
          userId,
          source:
            sourceResult.source,
          branch:
            SPECIAL_BRANCH,
        }
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

    console.log(
      "➡️ הלקוח נותב למסלול הרגיל:",
      {
        userId,
      }
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

    if (handledSpecial) {
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

  console.log(
    "🧩 פרטים שחולצו מההודעה:",
    {
      userMessage,
      currentUser,
      extractedDetails,
    }
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

  console.log(
    "👤 פרטי המשתמש שנשמרו:",
    updatedUser
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

  console.log(
    "🔍 בדיקת שדות ליד:",
    {
      name:
        updatedUser.name,
      age:
        updatedUser.age,
      branch:
        updatedUser.branch,
      phone:
        updatedUser.phone,
      goal:
        updatedUser.goal,
      source:
        updatedUser.source,
      regularFlowActive:
        updatedUser
          .regular_flow_active,
    }
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

  console.log(
    `🤖 תשובת הבוט: ${reply}`
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

  console.log(
    "📋 בדיקה סופית לשליחת ליד:",
    {
      name:
        finalUser.name,
      age:
        finalUser.age,
      branch:
        finalUser.branch,
      phone:
        finalUser.phone,
      goal:
        finalUser.goal,
      source:
        finalUser.source,
      regularFlowActive:
        finalUser
          .regular_flow_active,
      summarySent:
        finalUser.summary_sent,
      completeLead:
        finalCompleteLead,
      shouldSendManagerLead,
    }
  );

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

      console.log(
        `📋 הליד נשלח למנהל וסומן כנשלח עבור ${userId}`
      );
    } else {
      console.warn(
        `⚠️ שליחת הליד למנהל נכשלה עבור ${userId}`
      );
    }
  }

  console.log(
    `✅ התשובה נשלחה ל-${userId}`
  );
}

async function handleWebhook(
  req,
  res
) {
  res.status(200).json({
    success:
      true,
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
      const message of messages
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
        console.log(
          `♻️ הודעה כפולה דולגה: ${messageId}`
        );

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