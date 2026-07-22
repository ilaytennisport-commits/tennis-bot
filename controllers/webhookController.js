const { generateReply } = require("../services/openaiService");
const { sendWhatsAppMessage } = require("../services/whapiService");

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

  if (processedMessageIds.size > MAX_PROCESSED_MESSAGE_IDS) {
    const oldestMessageId =
      processedMessageIds.values().next().value;

    processedMessageIds.delete(oldestMessageId);
  }
}

function enqueueUserMessage(userId, task) {
  const previousTask =
    userQueues.get(userId) || Promise.resolve();

  const currentTask = previousTask
    .catch(() => {
      // שגיאה בהודעה קודמת לא תעצור את התור.
    })
    .then(task);

  userQueues.set(userId, currentTask);

  currentTask.finally(() => {
    if (userQueues.get(userId) === currentTask) {
      userQueues.delete(userId);
    }
  });

  return currentTask;
}

async function processIncomingMessage(message) {
  if (!message || message.from_me === true) {
    return;
  }

  if (message.type !== "text") {
    return;
  }

  const userMessage = message.text?.body?.trim();

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
    detectedPhone: whatsappIdToPhone(userId),
  });

  console.log(`📨 הודעה מ-${userId}: ${userMessage}`);

  if (userMessage === "איפוס שיחה") {
    await clearConversation(userId);
    await clearUser(userId);

    const resetReply =
      "השיחה והפרטים שנשמרו אופסו בהצלחה 😊";

    await sendWhatsAppMessage(
      userId,
      resetReply
    );

    console.log(`✅ השיחה אופסה עבור ${userId}`);

    return;
  }

  const currentUser = await getUser(userId);

  const extractedDetails = extractUserDetails(
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

  const updatedUser = await saveUser(
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

  const shouldSendLeadSummary =
    updatedUser.goal === "שיעור ניסיון" &&
    missingFields.length === 0 &&
    updatedUser.summary_sent !== true;

  let reply;

  if (shouldSendLeadSummary) {
    reply = formatLeadSummary(updatedUser);
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

  console.log(`🤖 תשובת הבוט: ${reply}`);

  await sendWhatsAppMessage(
    userId,
    reply
  );

  if (shouldSendLeadSummary) {
    await markSummarySent(userId);

    console.log(
      `📋 סיכום הליד סומן כנשלח עבור ${userId}`
    );
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
      req.body?.event?.type !== "messages"
    ) {
      return;
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      const messageId =
        getMessageId(message);

      if (
        messageId &&
        processedMessageIds.has(messageId)
      ) {
        console.log(
          `♻️ הודעה כפולה דולגה: ${messageId}`
        );

        continue;
      }

      rememberProcessedMessage(messageId);

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