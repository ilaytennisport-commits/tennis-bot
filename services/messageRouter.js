const { getAutomatedResponse } = require("./responseService");
const { generateReply } = require("./openaiService");

async function buildReply({
  userMessage,
  userProfile,
  conversationHistory,
  forceLeadSummary = false,
  leadSummary = "",
}) {
  // אם צריך להציג סיכום ליד - תמיד מחזירים אותו.
  if (forceLeadSummary) {
    return {
      source: "lead-summary",
      reply: leadSummary,
    };
  }

  // מנסים לענות מתוך בסיס הידע.
  const automated = getAutomatedResponse(
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
    };
  }

  // אם אין תשובה מוכנה - עוברים ל-AI.
  const reply = await generateReply(
    conversationHistory,
    userProfile
  );

  return {
    source: "openai",
    reply,
  };
}

module.exports = {
  buildReply,
};