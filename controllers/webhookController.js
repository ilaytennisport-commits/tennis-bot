const {
  buildProfileUpdates,
} = require(
  "../services/profileMemoryService"
);

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
} = require("../services/sourceRoutingService");

const {
  isSpecialSource,
  buildSpecialWelcome,
  getMissingSpecialField,
  getQuestionForField,
  buildSpecialRulesMessage,
} = require(
  "../services/specialSourceConversationService"
);

const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 2000;

const userQueues = new Map();

const CLUB_MANAGER_PHONE =
  process.env.CLUB_MANAGER_PHONE;

const SPECIAL_BRANCH =
  "גלי הדר – ראשון לציון";

/*
 * בודק האם כל פרטי הליד הרגיל נאספו.
 */
function hasCompleteLeadDetails(user) {
  const hasName =
    typeof user.name === "string" &&
    user.name.trim().length > 0;

  const hasAge =
    user.age !== null &&
    user.age !== undefined &&
    String(user.age).trim().length > 0;

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

/*
 * בודק האם כבר קיימים בפרופיל
 * פרטים משמעותיים מהמערכת הישנה.
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
      user.phone ||
      user.goal ||
      user.summary_sent === true
  );
}

/*
 * בודק האם ההודעה האחרונה של הבוט
 * הייתה שאלת שער הכניסה.
 */
function isWaitingForSource(
  conversationHistory = []
) {
  const lastAssistantMessage =
    [...conversationHistory]
      .reverse()
      .find(
        (item) =>
          item?.role === "assistant" &&
          typeof item?.content === "string"
      );

  if (!lastAssistantMessage) {
    return false;
  }

  return lastAssistantMessage.content.includes(
    "איך שמעתם עלינו"
  );
}

/*
 * מנקה טקסט קצר שמתקבל מהלקוח.
 */
function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * בודק אם ההודעה נראית כמו שאלה
 * ולא כמו תשובה לפרט שביקשנו.
 */
function looksLikeQuestion(message = "") {
  const text =
    cleanText(message).toLowerCase();

  if (!text) {
    return false;
  }

  if (text.includes("?")) {
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
  ];

  return questionPatterns.some(
    (pattern) => pattern.test(text)
  );
}

/*
 * חילוץ גיל מתוך תשובה למסלול המיוחד.
 */
function extractSpecialAge(message = "") {
  const text = cleanText(message);

  const match = text.match(
    /(?:בן|בת|גיל)?\s*(\d{1,2})/
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

/*
 * בונה את העדכון לפרט שהבוט
 * ביקש כרגע במסלול המיוחד.
 */
function buildSpecialFieldUpdate(
  field,
  userMessage
) {
  const text = cleanText(userMessage);

  if (!text) {
    return null;
  }

  switch (field) {
    case "name": {
      if (
        looksLikeQuestion(text) ||
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
        extractSpecialAge(text);

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
        looksLikeQuestion(text) ||
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
        looksLikeQuestion(text) ||
        text.length < 2 ||
        text.length > 500
      ) {
        return null;
      }

      return {
        experience: text,
      };
    }

    default:
      return null;
  }
}

/*
 * תשובה במקרה שהלקוח לא נתן
 * את הפרט שביקשנו.
 */
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

/*
 * מטפל בהמשך שיחה של לקוח
 * MOVE / עמית / FreeFit.
 *
 * מחזיר true אם ההודעה טופלה
 * במסלול המיוחד.
 */
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

  /*
   * מוודאים שגם לקוחות מיוחדים
   * תמיד משויכים לגלי הדר בלבד.
   */
  if (
    currentUser.branch !==
    SPECIAL_BRANCH
  ) {
    currentUser = await saveUser(
      userId,
      {
        branch: SPECIAL_BRANCH,
      }
    );
  }

  const missingField =
    getMissingSpecialField(
      currentUser
    );

  /*
   * אם כל הפרטים כבר נאספו,
   * לא מעבירים את הלקוח לבוט הרגיל.
   *
   * בשלב הבא נוכל להוסיף כאן
   * FAQ ייעודי למסלולים האלה.
   */
  if (!missingField) {
    await addMessage(
      userId,
      "user",
      userMessage
    );

    const completedReply = [
      "הפרטים שלך כבר שמורים אצלנו 😊",
      "",
      "להצטרפות לקבוצת עדכוני האימונים:",
      "https://chat.whatsapp.com/DiUCuKGCEQi93ziqMgqfzh",
      "",
      "אם יש שאלה לגבי האימונים דרך המסלול, אפשר לכתוב אותה כאן.",
    ].join("\n");

    await addMessage(
      userId,
      "assistant",
      completedReply
    );

    await sendWhatsAppMessage(
      userId,
      completedReply
    );

    console.log(
      "🔐 הודעה במסלול מיוחד לאחר השלמת פרטים:",
      {
        userId,
        source:
          currentUser.source,
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

  /*
   * לא מקבלים שאלה או תשובה לא תקינה
   * בתור שם / גיל / עיר / ניסיון.
   */
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

  currentUser = await saveUser(
    userId,
    {
      ...fieldUpdate,
      branch: SPECIAL_BRANCH,
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

  /*
   * יש עוד פרט שצריך לאסוף.
   */
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

  /*
   * כל הפרטים נאספו.
   */
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

/*
 * יוצר הודעה מסודרת למנהל המועדון.
 */
function formatManagerLeadMessage(
  user,
  conversationHistory = []
) {
  const cleanPhone = String(
    user.phone || ""
  ).replace(/\D/g, "");

  let internationalPhone =
    cleanPhone;

  if (cleanPhone.startsWith("0")) {
    internationalPhone =
      `972${cleanPhone.substring(1)}`;
  }

  const whatsappLink =
    internationalPhone
      ? `https://wa.me/${internationalPhone}`
      : "לא זמין";

  const formattedConversation =
    conversationHistory
      .filter(
        (conversationMessage) =>
          conversationMessage?.content &&
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
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(new Date());

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
      userQueues.get(userId) ===
      currentTask
    ) {
      userQueues.delete(userId);
    }
  });

  return currentTask;
}

async function sendLeadToManager(
  userId,
  updatedUser
) {
  if (!CLUB_MANAGER_PHONE) {
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
        managerPhone:
          CLUB_MANAGER_PHONE,
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
        managerPhone:
          CLUB_MANAGER_PHONE,
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

  if (message.type !== "text") {
    return;
  }

  const userMessage =
    message.text?.body?.trim();

  const userId =
    message.chat_id ||
    message.from;

  if (!userMessage || !userId) {
    return;
  }

  console.log(
    "🔍 מזהי Whapi:",
    {
      from: message.from,
      chat_id:
        message.chat_id,
      selectedUserId:
        userId,
      detectedPhone:
        whatsappIdToPhone(
          userId
        ),
    }
  );

  console.log(
    `📨 הודעה מ-${userId}: ${userMessage}`
  );

  /*
   * איפוס.
   */
  if (
    userMessage ===
    "איפוס שיחה"
  ) {
    await clearConversation(
      userId
    );

    await clearUser(userId);

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

  /*
   * בדיקת מנהל.
   */
  if (
    userMessage ===
    "בדיקת מנהל"
  ) {
    if (!CLUB_MANAGER_PHONE) {
      await sendWhatsAppMessage(
        userId,
        "❌ מספר מנהל המועדון לא מוגדר."
      );

      return;
    }

    try {
      console.log(
        `🧪 בדיקת שליחה ישירה למנהל: ${CLUB_MANAGER_PHONE}`
      );

      const testResult =
        await sendWhatsAppMessage(
          CLUB_MANAGER_PHONE,
          "🧪 הודעת בדיקה מהבוט של Tennis Sport"
        );

      console.log(
        "✅ הודעת הבדיקה למנהל נשלחה:",
        testResult
      );

      await sendWhatsAppMessage(
        userId,
        "✅ Whapi אישר את שליחת הודעת הבדיקה למנהל."
      );
    } catch (error) {
      console.error(
        "❌ הודעת הבדיקה למנהל נכשלה:",
        {
          status:
            error.response?.status,
          data:
            error.response?.data,
          message:
            error.message,
        }
      );

      const errorMessage =
        error.response?.data
          ?.message ||
        error.message;

      await sendWhatsAppMessage(
        userId,
        `❌ הבדיקה נכשלה: ${errorMessage}`
      );
    }

    return;
  }

  let currentUser =
    await getUser(userId);

  const previousConversationHistory =
    await getConversation(
      userId
    );

  const waitingForSource =
    isWaitingForSource(
      previousConversationHistory
    );

  /*
   * לקוח ותיק מהמערכת הישנה.
   */
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
          source: "regular",
          source_confirmed:
            true,
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

  /*
   * לקוח חדש לגמרי.
   */
  if (
    shouldAskSource(
      currentUser
    ) &&
    !waitingForSource
  ) {
    const detectedPhone =
      currentUser.phone ||
      whatsappIdToPhone(
        userId
      );

    await saveUser(
      userId,
      {
        phone:
          detectedPhone,
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

  /*
   * תשובה לשאלת
   * "איך שמעתם עלינו?"
   */
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
    };

    /*
     * שלושת המסלולים המיוחדים
     * קיימים בגלי הדר בלבד.
     */
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

    /*
     * MOVE / עמית / FreeFit.
     */
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

    /*
     * לקוח רגיל.
     */
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

  /*
   * אם מקור ההגעה כבר זוהה
   * כ-MOVE / עמית / FreeFit,
   * כל ההמשך נשאר במסלול הסגור.
   */
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
  }

  /*
   * מכאן הבוט הרגיל.
   */
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
      whatsappIdToPhone(
        userId
      );
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
      hasName:
        !!updatedUser.name,

      age:
        updatedUser.age,
      hasAge:
        updatedUser.age !==
          null &&
        updatedUser.age !==
          undefined,

      branch:
        updatedUser.branch,
      hasBranch:
        !!updatedUser.branch,

      phone:
        updatedUser.phone,
      hasPhone:
        !!updatedUser.phone,

      goal:
        updatedUser.goal,
      hasGoal:
        !!updatedUser.goal,
    }
  );

  const shouldSendLeadSummary =
    completeLead &&
    updatedUser.summary_sent !==
      true;

  console.log(
    "📋 בדיקת מוכנות הליד:",
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
      summarySent:
        updatedUser.summary_sent,
      completeLead,
      shouldSendLeadSummary,
    }
  );

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
    typeof reply !== "string"
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

  /*
   * createReply עשוי לשמור
   * את הפרט האחרון של הליד.
   */
  const finalUser =
    await getUser(userId);

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

/*
 * מקבל את ה־Webhook מ־Whapi.
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
      !Array.isArray(messages)
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
              error.response
                ?.data ||
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