const {
  getLeadContinuation,
} = require("./leadConversationService");

const {
  detectConversationIntent,
} = require(
  "./conversationIntentService"
);

const {
  getEquipmentContinuation,
} = require(
  "./equipmentConversationService"
);

const {
  getAutomatedResponse,
} = require("./responseService");

const {
  generateReply,
} = require("./openaiService");

async function buildReply({
  userMessage,
  userProfile,
  conversationHistory,
  forceLeadSummary = false,
  leadSummary = "",
}) {
  // אם צריך להציג סיכום ליד, הוא מקבל עדיפות מלאה.
  if (forceLeadSummary) {
    return {
      source: "lead-summary",
      reply: leadSummary,
      updates: {},
      completed: true,
    };
  }
  
  const conversationIntent =
    detectConversationIntent(
      userMessage,
      userProfile
    );

  console.log(
    "🧠 Conversation Intent:",
    conversationIntent
  );

  // קודם בודקים אם זו תשובת המשך לתהליך הרשמה.
  const leadContinuation =
    getLeadContinuation({
      userMessage,
      conversationHistory,
      userProfile,
    });

  if (leadContinuation) {
    return {
      source: "lead-continuation",
      reply: leadContinuation.reply,
      updates:
        leadContinuation.updates || {},
      completed:
        leadContinuation.completed ===
        true,
    };
  }

  // אחר כך בודקים אם זו תשובת המשך לשיחת ציוד.
  const equipmentContinuation =
    getEquipmentContinuation({
      userMessage,
      conversationHistory,
      userProfile,
    });

  if (equipmentContinuation) {
    return {
      source:
        "equipment-continuation",
      reply:
        equipmentContinuation,
      updates: {},
      completed: false,
    };
  }

  // מנסים לענות מתוך בסיס הידע וה־FAQ.
  const automated =
    getAutomatedResponse(
      userMessage,
      userProfile
    );

  if (automated.handled) {
    console.log(
      `⚡ FAQ (${automated.intent})`
    );

    return {
      source: "faq",
      reply: automated.response,
      updates: {},
      completed: false,
    };
  }

  // אם אין תשובה מוכנה, עוברים ל־OpenAI.
  const reply =
    await generateReply(
      conversationHistory,
      userProfile
    );

  return {
    source: "openai",
    reply,
    updates: {},
    completed: false,
  };
}

module.exports = {
  buildReply,
};