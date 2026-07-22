const OpenAI = require("openai");
const systemPrompt = require("../prompts/systemPrompt");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateReply(userMessage) {
  if (!userMessage || typeof userMessage !== "string") {
    throw new Error("Missing user message");
  }

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    instructions: systemPrompt,
    input: userMessage,
  });

  return response.output_text;
}

module.exports = {
  generateReply,
};