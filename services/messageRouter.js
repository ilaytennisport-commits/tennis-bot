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

function getLastAssistantMessage(
  conversationHistory = []
) {
  return (
    [...conversationHistory]
      .reverse()
      .find(
        (message) =>
          message?.role === "assistant" &&
          typeof message.content === "string"
      )?.content || ""
  );
}

/*
 * בודק אם בעבר הייתה בקשת הרשמה מפורשת.
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

/*
 * בודק אם הבוט כרגע נמצא באמצע
 * איסוף פרטי ליד.
 */
function hasActiveLeadQuestion(
  conversationHistory = []
) {
  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "מה שם המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה שם הילד או הילדה?"
    ) ||
    lastAssistantMessage.includes(
      "מה גיל המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה גיל הילד או הילדה?"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף אתם מעוניינים?"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף תרצו להתאמן?"
    )
  );
}

/*
 * הלקוח ענה "כן" להצעה להתקדם
 * לאימון ניסיון.
 */
function isTrialConfirmation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  const confirmations = new Set([
    "כן",
    "כן בטח",
    "בטח",
    "בהחלט",
    "יאללה",
    "קדימה",
    "מעולה",
    "סבבה",
  ]);

  if (!confirmations.has(text)) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "תרצו שאעזור להתקדם עם אימון ניסיון"
    ) ||
    lastAssistantMessage.includes(
      "תרצה שאעזור להתקדם עם אימון ניסיון"
    )
  );
}

function isRecommendationContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

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
  userProfile = {},
  extraUpdates = {}
) {
  const profile = {
    ...userProfile,
    ...extraUpdates,
  };

  if (!hasValue(profile.name)) {
    return {
      source: "lead-start",
      reply:
        "בשמחה 😊\n\nמה שם המתאמן או המתאמנת?",
      updates: extraUpdates,
      completed: false,
    };
  }

  if (!hasValue(profile.age)) {
    return {
      source: "lead-start",
      reply:
        "תודה 😊\n\nמה גיל המתאמן או המתאמנת?",
      updates: extraUpdates,
      completed: false,
    };
  }

  if (!hasValue(profile.branch)) {
    return {
      source: "lead-start",
      reply: [
        "תודה 😊",
        "",
        "באיזה סניף תרצו להתאמן?",
        "• גלי הדר – ראשון לציון",
        "• בית חשמונאי",
      ].join("\n"),
      updates: extraUpdates,
      completed: false,
    };
  }

  return {
    source: "lead-start",
    reply:
      "תודה 😊\n\nהפרטים הדרושים כבר שמורים. אעביר אותם להמשך טיפול של צוות האקדמיה.",
    updates: extraUpdates,
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

  const trialConfirmation =
    isTrialConfirmation({
      userMessage,
      conversationHistory,
    });

  const activeLeadQuestion =
    hasActiveLeadQuestion(
      conversationHistory
    );

  const existingLeadFlow =
    userProfile.summary_sent !== true &&
    (
      hasRecentLeadIntent(
        conversationHistory
      ) ||
      activeLeadQuestion
    );

  console.log(
    "🎯 Lead Flow:",
    {
      startingLeadNow,
      trialConfirmation,
      activeLeadQuestion,
      existingLeadFlow,
    }
  );

  /*
   * הלקוח אישר שהוא רוצה להתקדם
   * עם אימון ניסיון.
   */
  if (trialConfirmation) {
    const goalUpdates =
      hasValue(userProfile.goal)
        ? {}
        : {
            goal: "שיעור ניסיון",
          };

    return buildLeadStartResponse(
      userProfile,
      goalUpdates
    );
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
   * המשך תהליך שכבר התחיל.
   */
  if (existingLeadFlow) {
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
   * הלקוח מוכן להתקדם,
   * אבל עוד לא אישר אימון ניסיון.
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
   * המשך שיחת המלצה.
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
   * המלצה חדשה.
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
   * התעניינות כללית.
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
   * OpenAI רק כשאין מסלול מובנה.
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