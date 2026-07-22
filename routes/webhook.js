const express = require("express");
const { generateReply } = require("../services/openaiService");
const { sendWhatsAppMessage } = require("../services/whapiService");

const {
  getConversation,
  addMessage,
  clearConversation,
} = require("../services/conversationService");

const {
  getUser,
  saveUser,
  clearUser,
} = require("../prompts/memory/usermemory");

const router = express.Router();

function extractUserDetails(message, currentUser) {
  const updates = {};
  const cleanMessage = message.trim();

  // זיהוי גיל: "בן 9", "בת 12", "גיל 30"
  const ageMatch = cleanMessage.match(/(?:בן|בת|גיל)\s*(\d{1,2})/);

  if (ageMatch) {
    const age = Number(ageMatch[1]);

    if (age >= 4 && age <= 99) {
      updates.age = age;
    }
  }

  // זיהוי מספר טלפון ישראלי
  const phoneMatch = cleanMessage.match(
    /(?:\+972|972|0)?5\d[-\s]?\d{3}[-\s]?\d{4}/
  );

  if (phoneMatch) {
    updates.phone = phoneMatch[0].replace(/[-\s]/g, "");
  }

  // זיהוי סניף
  if (
    cleanMessage.includes("גלי הדר") ||
    cleanMessage.includes("ראשון לציון") ||
    cleanMessage.includes("רמז")
  ) {
    updates.branch = "גלי הדר – ראשון לציון";
  } else if (cleanMessage.includes("בית דגן")) {
    updates.branch = "בית דגן";
  } else if (
    cleanMessage.includes("בית חשמונאי") ||
    cleanMessage.includes("חשמונאי")
  ) {
    updates.branch = "בית חשמונאי";
  }

  // זיהוי מטרת הפנייה
  if (cleanMessage.includes("ניסיון")) {
    updates.goal = "שיעור ניסיון";
  } else if (cleanMessage.includes("חוג")) {
    updates.goal = "חוג טניס";
  } else if (
    cleanMessage.includes("אימון אישי") ||
    cleanMessage.includes("שיעור פרטי")
  ) {
    updates.goal = "אימון אישי";
  }

  // זיהוי שם ממשפטים נפוצים
  const namePatterns = [
    /קוראים לי\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לו\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לה\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלי\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלו\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלה\s+([א-תA-Za-z"-]{2,20})/,
  ];

  for (const pattern of namePatterns) {
    const nameMatch = cleanMessage.match(pattern);

    if (nameMatch) {
      updates.name = nameMatch[1];
      break;
    }
  }

  // אם חסר שם והמשתמש שלח רק מילה אחת, היא עשויה להיות שם
  const singleWordName = cleanMessage.match(/^[א-תA-Za-z"-]{2,20}$/);

  const wordsThatAreNotNames = [
    "שלום",
    "היי",
    "כן",
    "לא",
    "תודה",
    "ניסיון",
    "מחיר",
    "מחירים",
    "גלי",
    "הדר",
  ];

  if (
    !currentUser.name &&
    singleWordName &&
    !wordsThatAreNotNames.includes(cleanMessage)
  ) {
    updates.name = cleanMessage;
  }

  return updates;
}

router.post("/", async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Webhook received",
  });

  try {
    if (req.body?.event?.type !== "messages") {
      return;
    }

    const messages = req.body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      if (message.from_me === true) {
        continue;
      }

      if (message.type !== "text") {
        continue;
      }

      const userMessage = message.text?.body?.trim();
      const userId = message.from;

      if (!userMessage || !userId) {
        continue;
      }

      console.log(`📨 הודעה מ-${userId}: ${userMessage}`);

      if (userMessage === "איפוס שיחה") {
        clearConversation(userId);
        await clearUser(userId);

        await sendWhatsAppMessage(
          userId,
          "השיחה והפרטים שנשמרו אופסו בהצלחה 😊"
        );

        continue;
      }

      const currentUser = await getUser(userId);
      const extractedDetails = extractUserDetails(
        userMessage,
        currentUser
      );

      const updatedUser = await saveUser(userId, extractedDetails);

      console.log("👤 פרטי המשתמש שנשמרו:", updatedUser);

      addMessage(userId, "user", userMessage);

      const conversationHistory = getConversation(userId);

      const reply = await generateReply(
        conversationHistory,
        updatedUser
      );

      addMessage(userId, "assistant", reply);

      console.log(`🤖 תשובת הבוט: ${reply}`);

      await sendWhatsAppMessage(userId, reply);

      console.log(`✅ התשובה נשלחה ל-${userId}`);
    }
  } catch (error) {
    console.error(
      "❌ שגיאה בטיפול ב-Webhook:",
      error.response?.data || error.message
    );
  }
});

module.exports = router;