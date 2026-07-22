const express = require("express");
const { generateReply } = require("../services/openaiService");
const { sendWhatsAppMessage } = require("../services/whapiService");

const router = express.Router();

router.post("/", async (req, res) => {
  // מחזירים אישור מיד ל-Whapi כדי שלא יחכה
  res.status(200).json({
    success: true,
    message: "Webhook received",
  });

  try {
    // אירועי statuses אינם הודעות משתמש
    if (req.body?.event?.type !== "messages") {
      return;
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      // לא עונים להודעות שהבוט עצמו שלח
      if (message.from_me === true) {
        continue;
      }

      // בשלב הזה מטפלים רק בהודעות טקסט
      if (message.type !== "text") {
        continue;
      }

      const userMessage = message.text?.body?.trim();
      const recipient = message.from;

      if (!userMessage || !recipient) {
        continue;
      }

      console.log(`📨 הודעה מ-${recipient}: ${userMessage}`);

      const reply = await generateReply(userMessage);

      console.log(`🤖 תשובת הבוט: ${reply}`);

      await sendWhatsAppMessage(recipient, reply);

      console.log(`✅ התשובה נשלחה ל-${recipient}`);
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול ב-Webhook:",
      error.response?.data || error.message
    );
  }
});

module.exports = router;