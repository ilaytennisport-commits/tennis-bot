const {
  buildReply,
} = require("./messageRouter");

const {
  saveUser,
} = require("../prompts/memory/usermemory");

async function createReply({
  userId,
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
    forceLeadSummary:
      shouldSendLeadSummary,
    leadSummary:
      formatLeadSummary(updatedUser),
  });

  console.log(
    `🧠 Reply Source: ${result.source}`
  );

  const updates =
    result.updates || {};

  if (
    userId &&
    Object.keys(updates).length > 0
  ) {
    const savedUser =
      await saveUser(
        userId,
        updates
      );

    console.log(
      "💾 פרטי ההרשמה נשמרו:",
      savedUser
    );
  }

  return result.reply;
}

module.exports = {
  createReply,
};