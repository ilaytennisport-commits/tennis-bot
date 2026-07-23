const {
  generateReply,
} = require("../services/openaiService");

const {
  sendWhatsAppMessage,
} = require("../services/whapiService");

const {
  getAutomatedResponse,
} = require("../services/responseService");

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

const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 2000;

const userQueues = new Map();

const CLUB_MANAGER_PHONE =
  process.env.CLUB_MANAGER_PHONE;

/**
 * בודק האם כל פרטי הליד הנדרשים נאספו.
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

/**
 * יוצר הודעה מסודרת למנהל המועדון.
 */
function formatManagerLeadMessage(
  user,
  conversationHistory = []
) {
  const cleanPhone = String(
    user.phone || ""
  ).replace(/\D/g, "");

  let internationalPhone = cleanPhone;

  if (cleanPhone.startsWith("0")) {
    internationalPhone =
      `972${cleanPhone.substring(1)}`;
  }

  const whatsappLink = internationalPhone
    ? `https://wa.me/${internationalPhone}`
    : "לא זמין";

  const formattedConversation =
    conversationHistory
      .filter(
        (conversationMessage) =>
          conversationMessage?.content &&
          ["user", "assistant"].includes(
            conversationMessage.role
          )
      )
      .map((conversationMessage) => {
        const speaker =
          conversationMessage.role === "user"
            ? "👤 לקוח"
            : "🤖 בוט";

        return (
          `${speaker}:\n` +
          conversationMessage.content
        );
      })
      .join("\n\n");

  const receivedAt =
    new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date());

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

/**
 * מחלץ את מזהה ההודעה שהגיע מ־Whapi.
 */
function getMessageId(message) {
  return (
    message?.id ||
    message?.message_id ||
    message?.key?.id ||
    null
  );
}

/**
 * שומר מזהי הודעות שכבר עובדו,
 * כדי למנוע טיפול כפול באותו Webhook.
 */
function rememberProcessedMessage(messageId) {
  if (!messageId) {
    return;
  }

  processedMessageIds.add(messageId);

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

/**
 * מפעיל תור נפרד לכל משתמש,
 * כדי שהודעות מאותו משתמש יעובדו לפי הסדר.
 */
function enqueueUserMessage(userId, task) {
  const previousTask =
    userQueues.get(userId) ||
    Promise.resolve();

  const currentTask = previousTask
    .catch(() => {
      // שגיאה קודמת לא תעצור את התור.
    })
    .then(task);

  userQueues.set(userId, currentTask);

  currentTask.finally(() => {
    if (
      userQueues.get(userId) === currentTask
    ) {
      userQueues.delete(userId);
    }
  });

  return currentTask;
}

/**
 * שולח את פרטי הליד למנהל המועדון.
 */
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
      await getConversation(userId);

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

/**
 * מעבד הודעת WhatsApp נכנסת.
 */
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

  console.log("🔍 מזהי Whapi:", {
    from: message.from,
    chat_id: message.chat_id,
    selectedUserId: userId,
    detectedPhone:
      whatsappIdToPhone(userId),
  });

  console.log(
    `📨 הודעה מ-${userId}: ${userMessage}`
  );

  /**
   * איפוס פרטי המשתמש והשיחה.
   */
  if (userMessage === "איפוס שיחה") {
    await clearConversation(userId);
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

  /**
   * בדיקה ישירה של שליחה למנהל.
   */
  if (userMessage === "בדיקת מנהל") {
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
        error.response?.data?.message ||
        error.message;

      await sendWhatsAppMessage(
        userId,
        `❌ הבדיקה נכשלה: ${errorMessage}`
      );
    }

    return;
  }

  const currentUser =
    await getUser(userId);

  const extractedDetails =
    extractUserDetails(
      userMessage,
      currentUser
    );

  console.log(
    "🧩 פרטים שחולצו מההודעה:",
    {
      userMessage,
      currentUser,
      extractedDetails,
    }
  );

  /**
   * אם לא התקבל מספר טלפון מפורש,
   * משתמשים במספר שממנו נשלחה ההודעה.
   */
  if (
    !currentUser.phone &&
    !extractedDetails.phone
  ) {
    extractedDetails.phone =
      whatsappIdToPhone(userId);
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
    await getConversation(userId);

  const completeLead =
    hasCompleteLeadDetails(
      updatedUser
    );

  console.log(
    "🔍 בדיקת שדות ליד:",
    {
      name: updatedUser.name,
      hasName: !!updatedUser.name,

      age: updatedUser.age,
      hasAge:
        updatedUser.age !== null &&
        updatedUser.age !== undefined,

      branch: updatedUser.branch,
      hasBranch: !!updatedUser.branch,

      phone: updatedUser.phone,
      hasPhone: !!updatedUser.phone,

      goal: updatedUser.goal,
      hasGoal: !!updatedUser.goal,
    }
  );

  const shouldSendLeadSummary =
    completeLead &&
    updatedUser.summary_sent !== true;

  console.log(
    "📋 בדיקת מוכנות הליד:",
    {
      name: updatedUser.name,
      age: updatedUser.age,
      branch: updatedUser.branch,
      phone: updatedUser.phone,
      goal: updatedUser.goal,
      summarySent:
        updatedUser.summary_sent,
      completeLead,
      shouldSendLeadSummary,
    }
  );

  let reply;

  if (shouldSendLeadSummary) {
    reply =
      formatLeadSummary(updatedUser);
  } else {
    const automatedResponse =
      getAutomatedResponse(
        userMessage,
        updatedUser
      );

    if (automatedResponse.handled) {
      console.log(
        "⚡ תשובת FAQ אוטומטית:",
        {
          intent:
            automatedResponse.intent,
          confidence:
            automatedResponse.confidence,
        }
      );

      reply =
        automatedResponse.response;
    } else {
      reply = await generateReply(
        conversationHistory,
        updatedUser
      );
    }
  }

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

  /**
   * לאחר שהלקוח קיבל את הסיכום,
   * שולחים את הליד למנהל.
   */
  if (shouldSendLeadSummary) {
    const managerMessageSent =
      await sendLeadToManager(
        userId,
        updatedUser
      );

    if (managerMessageSent) {
      await markSummarySent(userId);

      console.log(
        `📋 הליד סומן כנשלח עבור ${userId}`
      );
    } else {
      console.warn(
        `⚠️ הליד לא סומן כנשלח משום שהשליחה למנהל נכשלה: ${userId}`
      );
    }
  }

  console.log(
    `✅ התשובה נשלחה ל-${userId}`
  );
}

/**
 * מקבל את ה־Webhook מ־Whapi.
 */
async function handleWebhook(req, res) {
  res.status(200).json({
    success: true,
    message: "Webhook received",
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

    if (!Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      const messageId =
        getMessageId(message);

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