const OpenAI = require("openai");
const systemPrompt = require("../prompts/systemPrompt");
const academy = require("../knowledge/academyKnowledge");

const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-4o-mini";

/*
 * הגבלות כדי שלקוח אחד לא יתקע את הבוט
 * ולא יצרוך הרבה כסף.
 */
const OPENAI_TIMEOUT_MS = 20000;
const MAX_OUTPUT_TOKENS = 500;
const MAX_INPUT_MESSAGE_LENGTH = 1500;

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  return client;
}

/*
 * תשובה בטוחה כאשר OpenAI לא זמין.
 * הלקוח לא נשאר בלי מענה.
 */
const OPENAI_FALLBACK_REPLY = [
  academy.fallbackResponse,
  "",
  `לשאלות דחופות אפשר להתקשר ל-${academy.officialPhone}.`,
].join("\n");

function trimHistory(conversationHistory = []) {
  return conversationHistory
    .filter(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim()
    )
    .map((message) => ({
      role: message.role,
      content: message.content.slice(
        0,
        MAX_INPUT_MESSAGE_LENGTH
      ),
    }));
}

async function generateReply(conversationHistory, userProfile = {}) {
  const input = trimHistory(conversationHistory);

  if (input.length === 0) {
    throw new Error("Conversation history is empty");
  }

  const profileText = `
מידע שנשמר על המשתמש:
- שם: ${userProfile.name || "לא נמסר"}
- גיל: ${userProfile.age || "לא נמסר"}
- סניף מועדף: ${userProfile.branch || "לא נמסר"}
- טלפון: ${userProfile.phone ? "קיים" : "לא נמסר"}
- מטרת הפנייה: ${userProfile.goal || "לא נמסרה"}

השתמש במידע הזה ואל תשאל שוב על פרט שכבר נשמר.
`;

  try {
    const response = await getClient().responses.create({
      model: OPENAI_MODEL,
      instructions: `${systemPrompt}\n${profileText}`,
      input,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });

    const reply = response.output_text?.trim();

    if (!reply) {
      throw new Error("OpenAI returned an empty reply");
    }

    return reply;
  } catch (error) {
    console.error("❌ שגיאת OpenAI — נשלחת תשובת גיבוי:", {
      status: error.status,
      message: error.message,
    });

    return OPENAI_FALLBACK_REPLY;
  }
}

module.exports = {
  generateReply,
  OPENAI_FALLBACK_REPLY,
};
