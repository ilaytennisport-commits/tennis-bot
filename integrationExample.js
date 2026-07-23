// דוגמת שילוב בתוך webhookController.js
//
// יש להתאים את שמות הפונקציות לקוד הקיים שלך.

const { getAutomatedResponse } = require("../services/responseService");
const openaiService = require("../services/openaiService");

async function createBotReply({ messageText, userProfile, conversationHistory }) {
  // 1. קודם מנסים תשובה בטוחה ומהירה מתוך בסיס הידע.
  const automated = getAutomatedResponse(messageText, userProfile);

  if (automated.handled) {
    return automated.response;
  }

  // 2. רק שאלות מורכבות נשלחות ל-OpenAI.
  return openaiService.generateResponse({
    conversationHistory,
    userProfile
  });
}

module.exports = { createBotReply };
