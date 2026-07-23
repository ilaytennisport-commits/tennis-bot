const { classifyIntent } = require("../utils/intentClassifier");
const { getFaqResponse } = require("./faqService");

function detectAudience(message = "", profile = {}) {
  if (profile.age && Number(profile.age) >= 18) return "adult";
  if (profile.age && Number(profile.age) < 18) return "child";

  const text = message.toLowerCase();

  if (/(ילד|ילדה|בן שלי|בת שלי|הבן|הבת|נוער)/.test(text)) return "child";
  if (/(מבוגר|מבוגרת|אני רוצה|בשבילי|לעצמי)/.test(text)) return "adult";

  return null;
}

function getAutomatedResponse(message, profile = {}) {
  const { intent, confidence } = classifyIntent(message);
  const audience = detectAudience(message, profile);

  const response = getFaqResponse(intent, {
    audience,
    profile
  });

  return {
    handled: Boolean(response),
    intent,
    confidence,
    response
  };
}

module.exports = { getAutomatedResponse, detectAudience };
