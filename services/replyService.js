const { buildReply } = require("./messageRouter");

async function createReply({
  userMessage,
  updatedUser,
  conversationHistory,
  shouldSendLeadSummary,
  formatLeadSummary,
}) {
  const result = await buildReply({
    userMessage,
    userProfile: updatedUser,
    conversationHistory,
    forceLeadSummary: shouldSendLeadSummary,
    leadSummary: formatLeadSummary(updatedUser),
  });

  console.log(
    `🧠 Reply Source: ${result.source}`
  );

  return result.reply;
}

module.exports = {
  createReply,
};