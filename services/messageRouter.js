const {
  getLeadContinuation,
} = require("./leadConversationService");

const {
  detectConversationIntent,
  shouldStartLeadFlow,
} = require("./conversationIntentService");

const {
  getRecommendationResponse,
} = require("./recommendationService");

const {
  getInterestResponse,
} = require("./interestConversationService");

const {
  getEquipmentContinuation,
} = require("./equipmentConversationService");

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
 * מחזיר את שאלת הליד שכרגע ממתינה לתשובה.
 */
function getPendingLeadQuestion(
  conversationHistory = []
) {
  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  if (
    lastAssistantMessage.includes(
      "מה שם המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה שם הילד או הילדה?"
    )
  ) {
    return {
      type: "name",
      reply:
        "מה שם המתאמן או המתאמנת?",
    };
  }

  if (
    lastAssistantMessage.includes(
      "מה גיל המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה גיל הילד או הילדה?"
    )
  ) {
    return {
      type: "age",
      reply:
        "מה גיל המתאמן או המתאמנת?",
    };
  }

  if (
    lastAssistantMessage.includes(
      "באיזה סניף אתם מעוניינים?"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף תרצו להתאמן?"
    )
  ) {
    return {
      type: "branch",
      reply: [
        "באיזה סניף תרצו להתאמן?",
        "• גלי הדר – ראשון לציון",
        "• בית חשמונאי",
      ].join("\n"),
    };
  }

  return null;
}


/*
 * האם הבוט הציע אימון ניסיון לאחרונה.
 */
function hasRecentTrialOffer(
  conversationHistory = []
) {
  const recentMessages =
    conversationHistory.slice(-16);

  return recentMessages.some(
    (message) => {
      if (
        message?.role !== "assistant" ||
        typeof message.content !== "string"
      ) {
        return false;
      }

      const text =
        message.content.toLowerCase();

      return (
        text.includes(
          "תרצו שאעזור להתקדם עם אימון ניסיון"
        ) ||
        text.includes(
          "תרצה שאעזור להתקדם עם אימון ניסיון"
        ) ||
        (
          text.includes("אימון ניסיון") &&
          (
            text.includes("להתקדם") ||
            text.includes("תרצו") ||
            text.includes("תרצה")
          )
        )
      );
    }
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


function hasActiveLeadQuestion(
  conversationHistory = []
) {
  return Boolean(
    getPendingLeadQuestion(
      conversationHistory
    )
  );
}


/*
 * בקשה מפורשת להתקדם עם ניסיון.
 */
function isExplicitTrialProgression(
  userMessage = ""
) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  if (!text) {
    return false;
  }

  const mentionsTrial =
    /אימון ניסיון|אימון נסיון|שיעור ניסיון|שיעור נסיון/.test(
      text
    );

  if (!mentionsTrial) {
    return false;
  }

  /*
   * שאלה על אימון ניסיון אינה
   * אישור להתקדמות.
   */
  const asksOnlyInformation =
    /כמה עולה|מה המחיר|מחיר|עלות|מתי|באיזה שעה|איפה|כמה זמן/.test(
      text
    ) &&
    !/רוצה|מעוניין|מעוניינת|נתקדם|להתקדם|לקבוע|לקבוע לי|בוא נתקדם|יאללה|קדימה|כן|אשמח/.test(
      text
    );

  if (asksOnlyInformation) {
    return false;
  }

  return (
    /רוצה|מעוניין|מעוניינת|נתקדם|להתקדם|לקבוע|בוא נתקדם|יאללה|קדימה|כן|אשמח/.test(
      text
    )
  );
}


/*
 * חזרה למסלול הניסיון לאחר סטייה.
 */
function isRecentTrialProgression({
  userMessage = "",
  conversationHistory = [],
}) {
  if (
    !hasRecentTrialOffer(
      conversationHistory
    )
  ) {
    return false;
  }

  const text = String(userMessage)
    .toLowerCase()
    .trim();

  return (
    /בוא נתקדם|בואו נתקדם|אפשר להתקדם|רוצה להתקדם|רוצים להתקדם|נתקדם|יאללה נתקדם|קדימה נתקדם|כן.*נתקדם|אוקיי.*נתקדם|אז.*נתקדם/.test(
      text
    )
  );
}


function isTrialConfirmation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  if (
    isExplicitTrialProgression(
      userMessage
    )
  ) {
    return true;
  }

  if (
    isRecentTrialProgression({
      userMessage,
      conversationHistory,
    })
  ) {
    return true;
  }

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


/*
 * תשובה לשאלת גיל במסלול המלצה.
 */
function isRecommendationAgeContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .trim();

  const ageMatch =
    text.match(/^\d{1,2}$/);

  if (!ageMatch) {
    return false;
  }

  const age =
    Number(ageMatch[0]);

  if (
    !Number.isInteger(age) ||
    age < 4 ||
    age > 99
  ) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "בן או בת כמה המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה גיל המתאמן או המתאמנת?"
    ) ||
    lastAssistantMessage.includes(
      "מה גיל הילד או הילדה?"
    )
  );
}


/*
 * תשובה לשאלה האם מתחיל או מנוסה.
 */
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
    /מתחיל|מתחילה|חדש|חדשה|פעם ראשונה|לא שיחק|לא שיחקה|לא שיחקתי|אף פעם לא|מעולם לא|בלי ניסיון|אין לי ניסיון|אין לו ניסיון|אין לה ניסיון|שיחק בעבר|שיחקה בעבר|שיחקתי בעבר|כבר שיחק|כבר שיחקה|כבר שיחקתי|כבר משחק|כבר משחקת|משחק טניס|משחקת טניס|משחק כבר|משחקת כבר|שיחק טניס|שיחקה טניס|שיחקתי טניס|יש לי ניסיון|יש לו ניסיון|יש לה ניסיון|ניסיון קודם|שנה|שנתיים|שנים|חודשים|חודש|רמה טובה|ברמה טובה|ברמה די טובה|מתקדם|מתקדמת|מנוסה/.test(
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
      "כבר שיחקה בעבר"
    ) ||
    lastAssistantMessage.includes(
      "רמת הניסיון"
    ) ||
    (
      lastAssistantMessage.includes(
        "מתחיל"
      ) &&
      lastAssistantMessage.includes(
        "שיחק"
      )
    );

  return (
    isExperienceAnswer &&
    assistantAskedExperience
  );
}


function hasChildExperienceDetails(
  userMessage = ""
) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  if (!text) {
    return false;
  }

  const hasDuration =
    /שנה|שנתיים|שנים|חודש|חודשיים|חודשים|כמה שנים|כמה חודשים|חצי שנה/.test(
      text
    );

  const hasLevel =
    /רמה|טובה|טוב|בינוני|בינונית|מתקדם|מתקדמת|גבוהה|גבוה|תחרותי|תחרותית/.test(
      text
    );

  return (
    hasDuration &&
    hasLevel
  );
}


function isAdultFormatContinuation({
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

  const isFormatAnswer =
    /קבוצה|קבוצתי|קבוצתית|חוג|אישי|אישית|פרטי|פרטית|מאמן אישי/.test(
      text
    );

  const assistantAskedFormat =
    lastAssistantMessage.includes(
      "אתה מעדיף קבוצה או מסגרת אישית יותר"
    );

  return (
    isFormatAnswer &&
    assistantAskedFormat
  );
}


function isChildExperienceDetailsContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const text = String(userMessage)
    .trim();

  if (!text) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "כמה זמן הוא שיחק בעבר ובאיזו רמה בערך"
    ) ||
    (
      lastAssistantMessage.includes(
        "כמה זמן"
      ) &&
      lastAssistantMessage.includes(
        "באיזו רמה"
      )
    )
  );
}


function buildChildExperienceDetailsResponse() {
  return [
    "מעולה 😊",
    "",
    "זה עוזר להבין טוב יותר את הרקע שלו. ההתאמה הסופית לקבוצה תיעשה לפי הרמה בפועל.",
    "",
    "באיזה סניף יהיה לכם הכי נוח להתאמן?",
    "• גלי הדר – ראשון לציון",
    "• בית חשמונאי",
  ].join("\n");
}


function normalizeGoal(
  message = ""
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    text.includes("טכניקה") ||
    text.includes("שיפור טכניקה")
  ) {
    return "שיפור טכניקה";
  }

  if (
    text.includes("כושר") ||
    text.includes("כושר גופני")
  ) {
    return "כושר";
  }

  if (
    text.includes("משחקים") ||
    text.includes("יותר משחק") ||
    text.includes("לשחק יותר")
  ) {
    return "משחקים";
  }

  return null;
}


function isRecommendationGoalContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const goal =
    normalizeGoal(userMessage);

  if (!goal) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "מה חשוב לך יותר כרגע"
    ) &&
    (
      lastAssistantMessage.includes(
        "טכניקה"
      ) ||
      lastAssistantMessage.includes(
        "כושר"
      ) ||
      lastAssistantMessage.includes(
        "משחקים"
      )
    )
  );
}


function buildGoalResponse(
  goal
) {
  if (goal === "שיפור טכניקה") {
    return [
      "מעולה 😊",
      "",
      "אם המטרה היא שיפור טכניקה, כדאי להתאים מסגרת שתאפשר עבודה מסודרת על החבטות, התנועה במגרש והדיוק.",
      "",
      "באיזה סניף יהיה לך הכי נוח להתאמן?",
      "• גלי הדר – ראשון לציון",
      "• בית חשמונאי",
    ].join("\n");
  }

  if (goal === "כושר") {
    return [
      "מעולה 😊",
      "",
      "אם המטרה היא גם לשפר כושר, אפשר להתאים אימונים שמשלבים טניס עם הרבה תנועה, עבודת רגליים וקצב משחק.",
      "",
      "באיזה סניף יהיה לך הכי נוח להתאמן?",
      "• גלי הדר – ראשון לציון",
      "• בית חשמונאי",
    ].join("\n");
  }

  return [
    "מעולה 😊",
    "",
    "אם המטרה היא יותר משחקים, כדאי להתאים מסגרת שתאפשר הרבה זמן משחק מול שחקנים ברמה מתאימה.",
    "",
    "באיזה סניף יהיה לך הכי נוח להתאמן?",
    "• גלי הדר – ראשון לציון",
    "• בית חשמונאי",
  ].join("\n");
}


function normalizeBranch(
  message = ""
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    text.includes("גלי הדר") ||
    text.includes("ראשון לציון") ||
    text === "ראשון"
  ) {
    return "גלי הדר – ראשון לציון";
  }

  if (
    text.includes("בית חשמונאי") ||
    text.includes("חשמונאי")
  ) {
    return "בית חשמונאי";
  }

  return null;
}


function isRecommendationBranchContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const branch =
    normalizeBranch(userMessage);

  if (!branch) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "באיזה סניף יהיה לך הכי נוח להתאמן"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף יהיה לכם הכי נוח להתאמן"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף יהיה לכם הכי נוח"
    ) ||
    lastAssistantMessage.includes(
      "באיזה סניף יהיה לך הכי נוח"
    )
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
   * אישור להתקדם לאימון ניסיון.
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
   * הרשמה מפורשת.
   */
  if (startingLeadNow) {
    return buildLeadStartResponse(
      userProfile
    );
  }


  /*
   * FAQ באמצע איסוף ליד.
   *
   * למשל:
   * בוט: מה שם המתאמן?
   * לקוח: באיזה ימים יש אימונים?
   *
   * עונים לשאלה,
   * ואז חוזרים לשאלת הליד.
   */
  if (activeLeadQuestion) {
    const automatedDuringLead =
      getAutomatedResponse(
        userMessage,
        userProfile
      );

    if (
      automatedDuringLead.handled
    ) {
      const pendingLeadQuestion =
        getPendingLeadQuestion(
          conversationHistory
        );

      const parts = [
        automatedDuringLead.response,
      ];

      if (pendingLeadQuestion) {
        parts.push("");
        parts.push(
          "ולגבי ההמשך 😊"
        );
        parts.push("");
        parts.push(
          pendingLeadQuestion.reply
        );
      }

      console.log(
        `⚡ FAQ DURING LEAD (${automatedDuringLead.intent})`
      );

      return {
        source:
          "faq-during-lead",
        reply:
          parts.join("\n"),
        updates: {},
        completed: false,
      };
    }
  }


  /*
   * המשך ליד שכבר התחיל.
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
   * תשובה לשאלת גיל במסלול recommendation.
   */
  const recommendationAgeContinuation =
    isRecommendationAgeContinuation({
      userMessage,
      conversationHistory,
    });

  if (
    recommendationAgeContinuation
  ) {
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
        source:
          "recommendation-age",
        reply:
          continuationResponse,
        updates: {},
        completed: false,
      };
    }
  }


  /*
   * הלקוח מוכן להתקדם,
   * אך עדיין לא אישר אימון ניסיון.
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
   * תשובה לשאלה האם מתחיל או מנוסה.
   */
  const recommendationContinuation =
    isRecommendationContinuation({
      userMessage,
      conversationHistory,
    });

  if (recommendationContinuation) {
    const isChild =
      userProfile.audience === "child" ||
      (
        Number(userProfile.age) > 0 &&
        Number(userProfile.age) < 18
      );

    if (
      isChild &&
      hasChildExperienceDetails(
        userMessage
      )
    ) {
      return {
        source:
          "recommendation-child-experience-complete",
        reply:
          buildChildExperienceDetailsResponse(),
        updates: {},
        completed: false,
      };
    }

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
   * ילד עם ניסיון:
   * תשובה לכמה זמן שיחק ובאיזו רמה.
   */
  const childExperienceDetailsContinuation =
    isChildExperienceDetailsContinuation({
      userMessage,
      conversationHistory,
    });

  if (
    childExperienceDetailsContinuation
  ) {
    return {
      source:
        "recommendation-child-experience",
      reply:
        buildChildExperienceDetailsResponse(),
      updates: {},
      completed: false,
    };
  }


  /*
   * מבוגר:
   * קבוצה או אישי.
   */
  const adultFormatContinuation =
    isAdultFormatContinuation({
      userMessage,
      conversationHistory,
    });

  if (adultFormatContinuation) {
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
   * מטרה:
   * טכניקה / כושר / משחקים.
   */
  const recommendationGoalContinuation =
    isRecommendationGoalContinuation({
      userMessage,
      conversationHistory,
    });

  if (
    recommendationGoalContinuation
  ) {
    const goal =
      normalizeGoal(
        userMessage
      );

    return {
      source:
        "recommendation-goal",
      reply:
        buildGoalResponse(
          goal
        ),
      updates: {
        goal,
      },
      completed: false,
    };
  }


  /*
   * בחירת סניף בתוך מסלול המלצה.
   */
  const recommendationBranchContinuation =
    isRecommendationBranchContinuation({
      userMessage,
      conversationHistory,
    });

  if (
    recommendationBranchContinuation
  ) {
    const branch =
      normalizeBranch(
        userMessage
      );

    const audience =
      userProfile.audience;

    const isAdult =
      audience === "adult" ||
      Number(userProfile.age) >= 18;

    const trialText =
      isAdult
        ? "אימון ניסיון למבוגר מתקיים כחלק מקבוצה קיימת ובעלות של 50 ש״ח."
        : "אימון ניסיון לילדים מתקיים כחלק מקבוצה קיימת וללא עלות.";

    return {
      source:
        "recommendation-branch",
      reply: [
        "מעולה 😊",
        "",
        `רשמתי את הסניף: ${branch}.`,
        "",
        trialText,
        "",
        isAdult
          ? "תרצה שאעזור להתקדם עם אימון ניסיון?"
          : "תרצו שאעזור להתקדם עם אימון ניסיון?",
      ].join("\n"),
      updates: {
        branch,
      },
      completed: false,
    };
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
   * FAQ רגיל.
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