const {
  getLeadContinuation,
} = require("./leadConversationService");

const {
  detectConversationIntent,
  shouldStartLeadFlow,
} = require(
  "./conversationIntentService"
);

const {
  getEquipmentContinuation,
} = require(
  "./equipmentConversationService"
);

const {
  getAutomatedResponse,
} = require("./responseService");

const {
  generateReply,
} = require("./openaiService");

function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

/*
 * בודק האם כבר התחיל תהליך הרשמה
 * בהודעות האחרונות.
 *
 * זה מונע משאלת מידע רגילה כמו:
 * "איזה סניף נוח לכם?"
 * להיחשב בטעות לתהליך ליד.
 */
function hasRecentLeadIntent(
  conversationHistory = []
) {
  const recentMessages =
    conversationHistory.slice(-20);

  for (
    let index =
      recentMessages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message =
      recentMessages[index];

    if (
      message?.role !== "user" ||
      typeof message.content !==
        "string"
    ) {
      continue;
    }

    const detected =
      detectConversationIntent(
        message.content,
        {}
      );

    if (
      shouldStartLeadFlow(
        detected
      )
    ) {
      return true;
    }
  }

  return false;
}

/*
 * מתחיל הרשמה לפי הפרטים
 * שכבר קיימים בפרופיל.
 */
function buildLeadStartResponse(
  userProfile = {}
) {
  if (!hasValue(userProfile.name)) {
    return {
      source: "lead-start",
      reply:
        "בשמחה 😊\n\nמה שם המתאמן או המתאמנת?",
      updates: {},
      completed: false,
    };
  }

  if (!hasValue(userProfile.age)) {
    return {
      source: "lead-start",
      reply:
        "בשמחה 😊\n\nמה גיל המתאמן או המתאמנת?",
      updates: {},
      completed: false,
    };
  }

  if (!hasValue(userProfile.branch)) {
    return {
      source: "lead-start",
      reply: [
        "בשמחה 😊",
        "",
        "באיזה סניף אתם מעוניינים?",
        "• גלי הדר – ראשון לציון",
        "• בית דגן",
        "• בית חשמונאי",
      ].join("\n"),
      updates: {},
      completed: false,
    };
  }

  return {
    source: "lead-start",
    reply:
      "בשמחה 😊\n\nכבר יש לי את הפרטים הדרושים. אעביר אותם להמשך טיפול של צוות האקדמיה.",
    updates: {},
    completed: true,
  };
}

async function buildReply({
  userMessage,
  userProfile = {},
  conversationHistory = [],
  forceLeadSummary = false,
  leadSummary = "",
}) {
  /*
   * ליד שכבר הושלם.
   */
  if (forceLeadSummary) {
    return {
      source: "lead-summary",
      reply: leadSummary,
      updates: {},
      completed: true,
    };
  }

  const conversationIntent =
    detectConversationIntent(
      userMessage,
      userProfile
    );

  console.log(
    "🧠 Conversation Intent:",
    conversationIntent
  );

  /*
   * האם ההודעה הנוכחית מתחילה
   * הרשמה באופן מפורש?
   */
  const startingLeadNow =
    shouldStartLeadFlow(
      conversationIntent
    );

  /*
   * האם כבר הייתה בקשת הרשמה
   * ברורה בשיחה האחרונה?
   */
  const existingLeadFlow =
    userProfile.summary_sent !==
      true &&
    hasRecentLeadIntent(
      conversationHistory
    );

  const leadFlowActive =
    startingLeadNow ||
    existingLeadFlow;

  console.log(
    "🎯 Lead Flow:",
    {
      startingLeadNow,
      existingLeadFlow,
      leadFlowActive,
    }
  );

  /*
   * המשך תהליך הרשמה מופעל
   * רק אם באמת התחיל תהליך ליד.
   *
   * זו הנקודה שמונעת משיחת
   * מידע רגילה להפוך להרשמה.
   */
  if (
    leadFlowActive &&
    !startingLeadNow
  ) {
    const leadContinuation =
      getLeadContinuation({
        userMessage,
        conversationHistory,
        userProfile,
      });

    if (leadContinuation) {
      return {
        source:
          "lead-continuation",
        reply:
          leadContinuation.reply,
        updates:
          leadContinuation.updates ||
          {},
        completed:
          leadContinuation.completed ===
          true,
      };
    }
  }

  /*
   * המשתמש ביקש עכשיו להירשם
   * או שנציג יחזור אליו.
   */
  if (startingLeadNow) {
    return buildLeadStartResponse(
      userProfile
    );
  }

  /*
   * המשך שיחת ציוד.
   */
  const equipmentContinuation =
    getEquipmentContinuation({
      userMessage,
      conversationHistory,
      userProfile,
    });

  if (equipmentContinuation) {
    return {
      source:
        "equipment-continuation",
      reply:
        equipmentContinuation,
      updates: {},
      completed: false,
    };
  }

  /*
   * FAQ:
   * מחירים, סניפים, גילאים,
   * ניסיון, ציוד וכו'.
   */
  const automated =
    getAutomatedResponse(
      userMessage,
      userProfile
    );

  if (automated.handled) {
    console.log(
      `⚡ FAQ (${automated.intent})`
    );

    return {
      source: "faq",
      reply:
        automated.response,
      updates: {},
      completed: false,
    };
  }

  /*
   * OpenAI רק כשאין
   * מסלול מובנה מתאים.
   */
  const reply =
    await generateReply(
      conversationHistory,
      userProfile
    );

  return {
    source: "openai",
    reply,
    updates: {},
    completed: false,
  };
}

module.exports = {
  buildReply,
};