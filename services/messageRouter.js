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
  getRecommendationResponse,
} = require(
  "./recommendationService"
);

const {
  getInterestResponse,
} = require(
  "./interestConversationService"
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
      typeof message.content !== "string"
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

function isRecommendationContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  const lastAssistantMessage =
    [...conversationHistory]
      .reverse()
      .find(
        (message) =>
          message?.role === "assistant" &&
          typeof message.content === "string"
      )?.content || "";

  const isExperienceAnswer =
    /מתחיל|מתחילה|חדש|חדשה|פעם ראשונה|לא שיחק|לא שיחקה|שיחק בעבר|שיחקה בעבר|כבר משחק|כבר משחקת|מתקדם|מתקדמת|מנוסה/.test(
      text
    );

  const assistantAskedExperience =
    lastAssistantMessage.includes(
      "מתחיל לגמרי"
    ) ||
    lastAssistantMessage.includes(
      "כבר שיחק בעבר"
    ) ||
    lastAssistantMessage.includes(
      "רמת הניסיון"
    );

  return (
    isExperienceAnswer &&
    assistantAskedExperience
  );
}

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

function buildReadyResponse(
  userProfile = {}
) {
  const parts = [
    "מעולה 😊",
    "",
  ];

  if (
    hasValue(userProfile.age) &&
    hasValue(userProfile.experience)
  ) {
    const experienceText =
      userProfile.experience === "beginner"
        ? "מתחיל"
        : "עם ניסיון קודם";

    parts.push(
      `לפי מה שכבר סיפרת לי — גיל ${userProfile.age}, ${experienceText} — אפשר להתקדם בצורה מסודרת.`
    );
    parts.push("");
  }

  if (hasValue(userProfile.branch)) {
    parts.push(
      `גם הסניף ${userProfile.branch} כבר שמור לי.`
    );
    parts.push("");
  }

  parts.push(
    "אם תרצו, אפשר להתקדם לאימון ניסיון ולבדוק התאמה לקבוצה קיימת."
  );

  parts.push("");
  parts.push(
    "תרצו שאעזור להתקדם עם אימון ניסיון?"
  );

  return {
    source: "ready",
    reply: parts.join("\n"),
    updates: {},
    completed: false,
  };
}

async function buildReply({
  userMessage,
  userProfile = {},
  conversationHistory = [],
  forceLeadSummary = false,
  leadSummary = "",
}) {
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

  const startingLeadNow =
    shouldStartLeadFlow(
      conversationIntent
    );

  const existingLeadFlow =
    userProfile.summary_sent !== true &&
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
   * המשך תהליך הרשמה.
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
   * התחלת הרשמה מפורשת.
   */
  if (startingLeadNow) {
    return buildLeadStartResponse(
      userProfile
    );
  }

  /*
   * הלקוח נשמע מוכן להתקדם,
   * אבל לא ביקש עדיין הרשמה מפורשת.
   */
  if (
    conversationIntent.stage ===
    "ready"
  ) {
    return buildReadyResponse(
      userProfile
    );
  }

  /*
   * המשך של שיחת המלצה.
   */
  const recommendationContinuation =
    isRecommendationContinuation({
      userMessage,
      conversationHistory,
    });

  if (recommendationContinuation) {
    const continuationResponse =
      getRecommendationResponse({
        userMessage,
        userProfile,
        conversationIntent: {
          stage: "recommendation",
          confidence: 1,
        },
      });

    if (continuationResponse) {
      return {
        source: "recommendation",
        reply:
          continuationResponse,
        updates: {},
        completed: false,
      };
    }
  }

  /*
   * המלצה חכמה חדשה.
   */
  const recommendationResponse =
    getRecommendationResponse({
      userMessage,
      userProfile,
      conversationIntent,
    });

  if (recommendationResponse) {
    return {
      source: "recommendation",
      reply:
        recommendationResponse,
      updates: {},
      completed: false,
    };
  }

  /*
   * שיחת התעניינות כללית.
   */
  const interestResponse =
    getInterestResponse({
      userMessage,
      userProfile,
      conversationIntent,
    });

  if (interestResponse) {
    return {
      source: "interest",
      reply:
        interestResponse,
      updates: {},
      completed: false,
    };
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
   * FAQ.
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
   * OpenAI הוא המוצא האחרון.
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