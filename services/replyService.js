const {
  buildReply,
} = require("./messageRouter");

const {
  saveUser,
} = require("../prompts/memory/usermemory");

const { hasValue } = require("../utils/text");

/*
 * מטרת פנייה ברירת מחדל כאשר הליד הושלם
 * בלי שנקבעה מטרה — כדי שהליד יישלח למנהל.
 */
const DEFAULT_LEAD_GOAL = "פנייה כללית";

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

  const updates = {
    ...(result.updates || {}),
  };

  if (
    result.completed &&
    !hasValue(updatedUser.goal) &&
    !hasValue(updates.goal)
  ) {
    updates.goal = DEFAULT_LEAD_GOAL;
  }

  if (
    userId &&
    Object.keys(updates).length > 0
  ) {
    await saveUser(userId, updates);

    console.log(
      "💾 פרטי הלקוח עודכנו:",
      Object.keys(updates)
    );
  }

  return result.reply;
}

module.exports = {
  createReply,
  DEFAULT_LEAD_GOAL,
};
