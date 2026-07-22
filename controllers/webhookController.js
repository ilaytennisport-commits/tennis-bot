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
  clearUser,
} = require("../prompts/memory/usermemory");

const {
  whatsappIdToPhone,
  extractUserDetails,
  getMissingLeadFields,
  formatLeadSummary,
} = require("../utils/leadUtils");

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
  console.log(`📨 הודעה מ-${userId}: ${userMessage}`);

  if (userMessage === "איפוס שיחה") {
    clearConversation(userId);
    await clearUser(userId);

    await sendWhatsAppMessage(
      userId,
      "השיחה והפרטים שנשמרו אופסו בהצלחה 😊"
    );

    return;
  }

  const currentUser = await getUser(userId);

  const extractedDetails = extractUserDetails(
    userMessage,
    currentUser
  );

  if (!currentUser.phone && !extractedDetails.phone) {
    extractedDetails.phone = whatsappIdToPhone(userId);
  }

  const updatedUser = await saveUser(
    userId,
    extractedDetails
  );

  console.log("👤 פרטי המשתמש שנשמרו:", updatedUser);

  addMessage(userId, "user", userMessage);

  const conversationHistory = getConversation(userId);
  const missingFields = getMissingLeadFields(updatedUser);

  let reply;

  if (
    updatedUser.goal === "שיעור ניסיון" &&
    missingFields.length === 0
  ) {
    reply = formatLeadSummary(updatedUser);
  } else {
    reply = await generateReply(
      conversationHistory,
      updatedUser
    );
  }

  addMessage(userId, "assistant", reply);

  console.log(`🤖 תשובת הבוט: ${reply}`);

  await sendWhatsAppMessage(userId, reply);

  console.log(`✅ התשובה נשלחה ל-${userId}`);
}

async function handleWebhook(req, res) {
  res.status(200).json({
    success: true,
    message: "Webhook received",
  });

  try {
    if (req.body?.event?.type !== "messages") {
      return;
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      await processIncomingMessage(message);
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול ב-Webhook:",
      error.response?.data || error.message
    );
  }
}

module.exports = {
  handleWebhook,
};