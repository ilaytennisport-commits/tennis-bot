const {
  getLeadContinuation,
  getAskedLeadStep,
  getQuestionForStep,
  buildNextQuestion,
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

const {
  hasValue,
  looksLikeQuestion,
} = require("../utils/text");

const {
  QUESTIONS,
  askedQuestion,
  buildBranchQuestion,
} = require("../prompts/questionTexts");

const academy = require("../knowledge/academyKnowledge");

/*
 * מטרת פנייה ברירת מחדל לפי סוג הכניסה לליד.
 * בלי מטרה הליד לא נשלח למנהל, ולכן כל כניסה
 * למסלול הליד חייבת לקבוע מטרה.
 */
const LEAD_GOALS = {
  callback: "בקשה לחזרה מנציג",
  lead: "הרשמה",
  trial: "שיעור ניסיון",
  anotherTrainee: "הרשמה – מתאמן נוסף",
};

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
  const step = getAskedLeadStep(
    getLastAssistantMessage(
      conversationHistory
    )
  );

  if (!step) {
    return null;
  }

  return {
    type: step,
    reply: getQuestionForStep(step),
  };
}

/*
 * האם הבוט הציע אימון ניסיון לאחרונה.
 */
function hasRecentTrialOffer(
  conversationHistory = []
) {
  return conversationHistory
    .slice(-16)
    .some((message) => {
      if (
        message?.role !== "assistant" ||
        typeof message.content !== "string"
      ) {
        return false;
      }

      const text = message.content;

      return (
        askedQuestion(text, "trialOffer") ||
        (
          text.includes("אימון ניסיון") &&
          (
            text.includes("להתקדם") ||
            text.includes("תרצו") ||
            text.includes("תרצה")
          )
        )
      );
    });
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

    if (
      shouldStartLeadFlow(
        detectConversationIntent(
          message.content,
          {}
        )
      )
    ) {
      return true;
    }
  }

  return false;
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

  const wantsToProceed =
    /רוצה|רוצים|מעוניין|מעוניינת|מעוניינים|נתקדם|להתקדם|לקבוע|בוא נתקדם|יאללה|קדימה|(?:^|\s)כן(?:\s|$|,)|אשמח|נשמח/;

  const asksOnlyInformation =
    /כמה עולה|מה המחיר|מחיר|עלות|מתי|באיזה שעה|איפה|כמה זמן/.test(
      text
    ) && !wantsToProceed.test(text);

  if (asksOnlyInformation) {
    return false;
  }

  return wantsToProceed.test(text);
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

const CONFIRMATIONS = new Set([
  "כן",
  "כן בטח",
  "כן בבקשה",
  "כן תודה",
  "בטח",
  "בהחלט",
  "יאללה",
  "קדימה",
  "מעולה",
  "סבבה",
  "אשמח",
  "נשמח",
  "בשמחה",
]);

function isTrialConfirmation({
  userMessage = "",
  conversationHistory = [],
}) {
  if (
    isExplicitTrialProgression(
      userMessage
    ) ||
    isRecentTrialProgression({
      userMessage,
      conversationHistory,
    })
  ) {
    return true;
  }

  const text = String(userMessage)
    .toLowerCase()
    .replace(/[!.,😊🙂👍🙏]+/gu, "")
    .trim();

  if (!CONFIRMATIONS.has(text)) {
    return false;
  }

  return askedQuestion(
    getLastAssistantMessage(
      conversationHistory
    ),
    "trialOffer"
  );
}

/*
 * תשובה לשאלת גיל במסלול המלצה.
 */
function isRecommendationAgeContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  const ageMatch =
    String(userMessage)
      .trim()
      .match(/^\d{1,2}$/);

  if (!ageMatch) {
    return false;
  }

  const age = Number(ageMatch[0]);

  if (age < 4 || age > 99) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    askedQuestion(
      lastAssistantMessage,
      "recommendAge"
    ) ||
    askedQuestion(
      lastAssistantMessage,
      "leadAge"
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

  const isExperienceAnswer =
    /מתחיל|מתחילה|מתחילים|מאפס|חדש|חדשה|פעם ראשונה|לא שיחק|לא שיחקה|לא שיחקתי|אף פעם לא|מעולם לא|בלי ניסיון|אין ניסיון|אין לי ניסיון|אין לו ניסיון|אין לה ניסיון|שיחק בעבר|שיחקה בעבר|שיחקתי בעבר|כבר שיחק|כבר שיחקה|כבר שיחקתי|כבר משחק|כבר משחקת|משחק טניס|משחקת טניס|משחק כבר|משחקת כבר|שיחק טניס|שיחקה טניס|שיחקתי טניס|יש ניסיון|יש לי ניסיון|יש לו ניסיון|יש לה ניסיון|ניסיון קודם|(?:^|\s)כן(?:\s|$)|(?:^|\s)לא(?:\s|$)|שנה|שנתיים|שנים|חודשים|חודש|רמה טובה|ברמה טובה|ברמה די טובה|מתקדם|מתקדמת|מנוסה/.test(
      text
    );

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  const assistantAskedExperience =
    askedQuestion(
      lastAssistantMessage,
      "experience"
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

function getYesNoExperience(
  userMessage = ""
) {
  const text = String(userMessage)
    .replace(/[!.,😊🙂👍]+/gu, "")
    .trim();

  if (/^(כן|כן יש|יש|יש ניסיון|כן קצת|קצת)$/.test(text)) {
    return {
      text: "יש ניסיון קודם",
      experience: "experienced",
    };
  }

  if (/^(לא|אין|אין ניסיון|לא ממש|מאפס|מתחילים מאפס)$/.test(text)) {
    return {
      text: "מתחיל מאפס",
      experience: "beginner",
    };
  }

  return null;
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
  const isFormatAnswer =
    /קבוצה|קבוצתי|קבוצתית|חוג|אישי|אישית|פרטי|פרטית|מאמן אישי/.test(
      String(userMessage).toLowerCase()
    );

  return (
    isFormatAnswer &&
    askedQuestion(
      getLastAssistantMessage(
        conversationHistory
      ),
      "adultFormat"
    )
  );
}

function isChildExperienceDetailsContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  if (!String(userMessage).trim()) {
    return false;
  }

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  return (
    lastAssistantMessage.includes(
      "כמה זמן"
    ) &&
    lastAssistantMessage.includes(
      "באיזו רמה"
    )
  );
}

function buildChildExperienceDetailsResponse() {
  return [
    "מעולה 😊",
    "",
    "זה עוזר להבין טוב יותר את הרקע. ההתאמה הסופית לקבוצה תיעשה לפי הרמה בפועל.",
    "",
    buildBranchQuestion(
      QUESTIONS.branchPreference
    ),
  ].join("\n");
}

function normalizeGoal(
  message = ""
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (text.includes("טכניקה")) {
    return "שיפור טכניקה";
  }

  if (text.includes("כושר")) {
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
  if (!normalizeGoal(userMessage)) {
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

const GOAL_EXPLANATIONS = {
  "שיפור טכניקה":
    "אם המטרה היא שיפור טכניקה, כדאי להתאים מסגרת שתאפשר עבודה מסודרת על החבטות, התנועה במגרש והדיוק.",
  כושר:
    "אם המטרה היא גם לשפר כושר, אפשר להתאים אימונים שמשלבים טניס עם הרבה תנועה, עבודת רגליים וקצב משחק.",
  משחקים:
    "אם המטרה היא יותר משחקים, כדאי להתאים מסגרת שתאפשר הרבה זמן משחק מול שחקנים ברמה מתאימה.",
};

function buildGoalResponse(
  goal
) {
  return [
    "מעולה 😊",
    "",
    GOAL_EXPLANATIONS[goal] ||
      GOAL_EXPLANATIONS.משחקים,
    "",
    buildBranchQuestion(
      QUESTIONS.branchPreference
    ),
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
    text === "ראשון" ||
    text === "גלי"
  ) {
    return "גלי הדר – ראשון לציון";
  }

  if (text.includes("חשמונאי")) {
    return "בית חשמונאי";
  }

  return null;
}

function isRecommendationBranchContinuation({
  userMessage = "",
  conversationHistory = [],
}) {
  if (!normalizeBranch(userMessage)) {
    return false;
  }

  return askedQuestion(
    getLastAssistantMessage(
      conversationHistory
    ),
    "branchPreference"
  );
}

/*
 * כניסה למסלול איסוף ליד.
 * תמיד קובעת מטרת פנייה, כדי שהליד יישלח למנהל בסיום.
 */
function buildLeadStartResponse(
  userProfile = {},
  goal = LEAD_GOALS.lead
) {
  const updates = hasValue(
    userProfile.goal
  )
    ? {}
    : { goal };

  const next = buildNextQuestion({
    ...userProfile,
    ...updates,
  });

  if (next.completed) {
    return {
      source: "lead-start",
      reply:
        "תודה 😊\n\nהפרטים הדרושים כבר שמורים אצלי, והם מועברים לצוות האקדמיה. נחזור אליכם בהקדם.",
      updates,
      completed: true,
    };
  }

  return {
    source: "lead-start",
    reply: next.reply,
    updates,
    completed: false,
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
        ? "בלי ניסיון קודם"
        : "עם ניסיון קודם";

    parts.push(
      `לפי מה שכבר סיפרתם — גיל ${userProfile.age}, ${experienceText} — אפשר להתקדם בצורה מסודרת.`,
      ""
    );
  }

  if (hasValue(userProfile.branch)) {
    parts.push(
      `הסניף ${userProfile.branch} כבר שמור אצלי.`,
      ""
    );
  }

  parts.push(
    "אם תרצו, אפשר להתקדם לאימון ניסיון ולבדוק התאמה לקבוצה קיימת.",
    "",
    QUESTIONS.trialOffer
  );

  return {
    source: "ready",
    reply: parts.join("\n"),
    updates: {},
    completed: false,
  };
}

/*
 * לקוח שכבר נשלח עליו ליד, ורוצה לרשום מתאמן נוסף.
 */
function isAnotherTraineeRequest(
  userMessage = ""
) {
  return /מתאמן נוסף|מתאמנת נוספת|ילד נוסף|ילדה נוספת|ילד נוסף|לרשום עוד|לרשום גם את|רוצה לרשום גם|אח שלו|אחות שלה|האח שלו|האחות שלה|ילד שני|ילדה שנייה/.test(
    String(userMessage)
  );
}

function buildAnotherTraineeStart() {
  const updates = {
    name: null,
    age: null,
    branch: null,
    experience: null,
    audience: null,
    goal: LEAD_GOALS.anotherTrainee,
    summary_sent: false,
  };

  return {
    source: "lead-another-trainee",
    reply: `בשמחה 😊\n\nנרשום מתאמן או מתאמנת נוספים.\n\n${QUESTIONS.leadName}`,
    updates,
    completed: false,
  };
}

function buildAlreadySentResponse(
  userProfile = {}
) {
  const nameText = hasValue(
    userProfile.name
  )
    ? ` של ${userProfile.name}`
    : "";

  return {
    source: "lead-already-sent",
    reply: [
      `הפרטים${nameText} כבר אצל צוות האקדמיה, ונחזור אליכם בהקדם 😊`,
      "",
      `לשאלות דחופות אפשר להתקשר ל-${academy.officialPhone}.`,
      "",
      QUESTIONS.anotherTrainee,
    ].join("\n"),
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
  /*
   * הליד הושלם בהודעה הזו.
   * אם הלקוח גם שאל שאלה — עונים עליה ומוסיפים את הסיכום.
   */
  if (forceLeadSummary) {
    if (looksLikeQuestion(userMessage)) {
      const answer = await buildReply({
        userMessage,
        userProfile: {
          ...userProfile,
          summary_sent: true,
        },
        conversationHistory,
      });

      return {
        source: `${answer.source}+lead-summary`,
        reply: `${answer.reply}\n\n${leadSummary}`,
        updates: answer.updates || {},
        completed: true,
      };
    }

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

  const startingLeadNow =
    shouldStartLeadFlow(
      conversationIntent
    );

  const trialConfirmation =
    isTrialConfirmation({
      userMessage,
      conversationHistory,
    });

  const activeLeadQuestion = Boolean(
    getPendingLeadQuestion(
      conversationHistory
    )
  );

  const leadAlreadySent =
    userProfile.summary_sent === true;

  const existingLeadFlow =
    !leadAlreadySent &&
    (
      hasRecentLeadIntent(
        conversationHistory
      ) ||
      activeLeadQuestion
    );

  /*
   * לקוח חוזר: רישום מתאמן נוסף.
   */
  if (
    leadAlreadySent &&
    isAnotherTraineeRequest(userMessage)
  ) {
    return buildAnotherTraineeStart();
  }

  /*
   * לקוח שכבר נשלח עליו ליד ומבקש שוב הרשמה / חזרה.
   */
  if (
    leadAlreadySent &&
    (startingLeadNow || trialConfirmation)
  ) {
    return buildAlreadySentResponse(
      userProfile
    );
  }

  /*
   * אישור להתקדם לאימון ניסיון.
   */
  if (trialConfirmation) {
    return buildLeadStartResponse(
      userProfile,
      LEAD_GOALS.trial
    );
  }

  /*
   * הרשמה מפורשת / בקשה לחזרה.
   */
  if (startingLeadNow) {
    return buildLeadStartResponse(
      userProfile,
      conversationIntent.stage === "callback"
        ? LEAD_GOALS.callback
        : LEAD_GOALS.lead
    );
  }

  /*
   * שאלה באמצע איסוף ליד:
   * עונים (FAQ או OpenAI) ואז חוזרים לשאלת הליד.
   */
  if (
    activeLeadQuestion &&
    looksLikeQuestion(userMessage)
  ) {
    const pendingLeadQuestion =
      getPendingLeadQuestion(
        conversationHistory
      );

    const automatedDuringLead =
      getAutomatedResponse(
        userMessage,
        userProfile
      );

    const interruptionReply =
      automatedDuringLead.handled
        ? automatedDuringLead.response
        : await generateReply(
            conversationHistory,
            userProfile
          );

    const parts = [interruptionReply];

    if (pendingLeadQuestion) {
      parts.push(
        "",
        "ולגבי ההמשך 😊",
        "",
        pendingLeadQuestion.reply
      );
    }

    return {
      source: automatedDuringLead.handled
        ? "faq-during-lead"
        : "openai-during-lead",
      reply: parts.join("\n"),
      updates: {},
      completed: false,
    };
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
        source: "lead-continuation",
        reply: leadContinuation.reply,
        updates:
          leadContinuation.updates || {},
        completed:
          leadContinuation.completed === true,
      };
    }
  }

  const recommendationIntent = {
    stage: "recommendation",
    confidence: 1,
  };

  /*
   * תשובה לשאלת גיל במסלול המלצה.
   */
  if (
    isRecommendationAgeContinuation({
      userMessage,
      conversationHistory,
    })
  ) {
    const continuationResponse =
      getRecommendationResponse({
        userMessage,
        userProfile,
        conversationIntent:
          recommendationIntent,
      });

    if (continuationResponse) {
      return {
        source: "recommendation-age",
        reply: continuationResponse,
        updates: {},
        completed: false,
      };
    }
  }

  /*
   * הלקוח מוכן להתקדם, אך עדיין לא אישר אימון ניסיון.
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
  if (
    isRecommendationContinuation({
      userMessage,
      conversationHistory,
    })
  ) {
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
        updates: {
          experience: "experienced",
        },
        completed: false,
      };
    }

    /*
     * "כן" / "לא" לשאלה "יש ניסיון קודם?"
     */
    const yesNoExperience =
      getYesNoExperience(userMessage);

    const continuationResponse =
      getRecommendationResponse({
        userMessage: yesNoExperience
          ? yesNoExperience.text
          : userMessage,
        userProfile,
        conversationIntent:
          recommendationIntent,
      });

    if (continuationResponse) {
      return {
        source: "recommendation",
        reply: continuationResponse,
        updates: yesNoExperience
          ? {
              experience:
                yesNoExperience.experience,
            }
          : {},
        completed: false,
      };
    }
  }

  /*
   * ילד עם ניסיון: כמה זמן שיחק ובאיזו רמה.
   */
  if (
    isChildExperienceDetailsContinuation({
      userMessage,
      conversationHistory,
    })
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
   * מבוגר: קבוצה או אישי.
   */
  if (
    isAdultFormatContinuation({
      userMessage,
      conversationHistory,
    })
  ) {
    const continuationResponse =
      getRecommendationResponse({
        userMessage,
        userProfile,
        conversationIntent:
          recommendationIntent,
      });

    if (continuationResponse) {
      return {
        source: "recommendation",
        reply: continuationResponse,
        updates: {},
        completed: false,
      };
    }
  }

  /*
   * מטרה: טכניקה / כושר / משחקים.
   */
  if (
    isRecommendationGoalContinuation({
      userMessage,
      conversationHistory,
    })
  ) {
    const goal =
      normalizeGoal(userMessage);

    return {
      source: "recommendation-goal",
      reply: buildGoalResponse(goal),
      updates: { goal },
      completed: false,
    };
  }

  /*
   * בחירת סניף בתוך מסלול המלצה.
   */
  if (
    isRecommendationBranchContinuation({
      userMessage,
      conversationHistory,
    })
  ) {
    const branch =
      normalizeBranch(userMessage);

    const isAdult =
      userProfile.audience === "adult" ||
      Number(userProfile.age) >= 18;

    const trialText = isAdult
      ? academy.trialLessons.adults.description
      : academy.trialLessons.children.description;

    return {
      source: "recommendation-branch",
      reply: [
        "מעולה 😊",
        "",
        `רשמתי את הסניף: ${branch}.`,
        "",
        trialText,
        "",
        QUESTIONS.trialOffer,
      ].join("\n"),
      updates: { branch },
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
      reply: recommendationResponse,
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
      reply: interestResponse,
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
      source: "equipment-continuation",
      reply: equipmentContinuation,
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
    return {
      source: `faq:${automated.intent}`,
      reply: automated.response,
      updates: {},
      completed: false,
    };
  }

  /*
   * OpenAI הוא המוצא האחרון.
   */
  return {
    source: "openai",
    reply: await generateReply(
      conversationHistory,
      userProfile
    ),
    updates: {},
    completed: false,
  };
}

module.exports = {
  buildReply,
  LEAD_GOALS,
};
