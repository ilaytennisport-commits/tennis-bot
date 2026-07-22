const OpenAI = require("openai");
const systemPrompt = require("../prompts/systemPrompt");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateReply(conversationHistory, userProfile) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    throw new Error("Conversation history is empty");
  }

  const profileText = `
מידע שנשמר על המשתמש:
- שם: ${userProfile.name || "לא נמסר"}
- גיל: ${userProfile.age || "לא נמסר"}
- סניף מועדף: ${userProfile.branch || "לא נמסר"}
- טלפון: ${userProfile.phone || "לא נמסר"}
- מטרת הפנייה: ${userProfile.goal || "לא נמסרה"}

השתמש במידע הזה ואל תשאל שוב על פרט שכבר נשמר.
`;

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    instructions: `${systemPrompt}\n${profileText}`,
    input: conversationHistory,
  });

  const reply = response.output_text?.trim();

  if (!reply) {
    throw new Error("OpenAI returned an empty reply");
  }

  return reply;
}

module.exports = {
  generateReply,
};