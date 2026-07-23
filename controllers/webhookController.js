const { generateReply } = require("../services/openaiService");

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
  getMissingLeadFields,
  formatLeadSummary,
} = require("../utils/leadUtils");

const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGE_IDS = 2000;

const userQueues = new Map();

const CLUB_MANAGER_PHONE =
  process.env.CLUB_MANAGER_PHONE;

function formatManagerLeadMessage(
  user,
  conversationHistory = []
) {
  const cleanPhone = String(user.phone || "")
    .replace(/\D/g, "");

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
        (message) =>
          message?.content &&
          ["user", "assistant"].includes(
            message.role
          )
      )
      .map((message) => {
        const speaker =
          message.role === "user"
            ? "👤 לקוח"
            : "🤖 בוט";

        return `${speaker}:\n${message.content}`;
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
    `👤 שם: ${user.name || "לא נמסר"}`,
    `🎂 גיל: ${user.age || "לא נמסר"}`,
    `📍 סניף: ${user.branch || "לא נמסר"}`,
    `📞 טלפון: ${user.phone || "לא נמסר"}`,
    `🎯 מטרה: ${user.goal || "לא נמסרה"}`,
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
      processedMessageIds.values().next().value;

    processedMessageIds.delete(
      oldestMessageId
    );
  }
}

function enqueueUserMessage(userId, task) {
  const previousTask =
    userQueues.get(userId) ||
    Promise.resolve();

  const currentTask = previousTask
    .catch(() => {
      // שגיאה בהודעה קודמת לא תעצור את התור.
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
        managerPhone: CLUB_MANAGER_PHONE,
        customerPhone: updatedUser.phone,
        messageLength: managerMessage.length,
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
        managerPhone: CLUB_MANAGER_PHONE,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
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
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      }
    );

    await sendWhatsAppMessage(
      userId,
      `❌ הבדיקה נכשלה: ${
        error.response?.data?.message ||
        error.message
      }`
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

  const missingFields =
    getMissingLeadFields(updatedUser);

 const leadGoals = [
  "שיעור ניסיון",
  "חוג טניס",
  "אימון אישי",
  "אימון זוגי",
  "אימוני מבוגרים",
  "אימוני ילדים",
];

const shouldSendLeadSummary =
  leadGoals.includes(updatedUser.goal) &&
  missingFields.length === 0 &&
  updatedUser.summary_sent !== true;
  let reply;

  if (shouldSendLeadSummary) {
    reply =
      formatLeadSummary(updatedUser);
  } else {
    reply = await generateReply(
      conversationHistory,
      updatedUser
    );
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
        `⚠️ הליד לא סומן כנשלח, כדי שיהיה אפשר לנסות שוב עבור ${userId}`
      );
    }
  }

  console.log(
    `✅ התשובה נשלחה ל-${userId}`
  );
}

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