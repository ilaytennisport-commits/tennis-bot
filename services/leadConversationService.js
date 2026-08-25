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

function isNameQuestion(message = "") {
  return (
    message.includes("איך קוראים") ||
    message.includes("מה שם המתאמן") ||
    message.includes("מה שם המתאמנת") ||
    message.includes("מה שמו") ||
    message.includes("מה שמה")
  );
}

function isAgeQuestion(message = "") {
  return (
    message.includes("בן כמה") ||
    message.includes("בת כמה") ||
    message.includes("מה הגיל") ||
    message.includes("מה גיל המתאמן") ||
    message.includes("מה גיל המתאמנת")
  );
}

function isBranchQuestion(message = "") {
  return (
    message.includes("באיזה סניף") ||
    message.includes("איזה סניף") ||
    message.includes("סניף מועדף")
  );
}

function normalizeBranch(message = "") {
  const text = String(message)
    .trim()
    .toLowerCase();

  if (
    text.includes("גלי הדר") ||
    text.includes("ראשון")
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

function getNextMissingStep(
  profile = {}
) {
  if (!hasValue(profile.name)) {
    return "name";
  }

  if (!hasValue(profile.age)) {
    return "age";
  }

  if (!hasValue(profile.branch)) {
    return "branch";
  }

  return null;
}

function buildNextQuestion(
  profile = {}
) {
  const nextStep =
    getNextMissingStep(profile);

  if (nextStep === "name") {
    return {
      reply:
        "מעולה 😊\n\nמה שם המתאמן או המתאמנת?",
      completed: false,
    };
  }

  if (nextStep === "age") {
    return {
      reply:
        "תודה 😊\n\nמה גיל המתאמן או המתאמנת?",
      completed: false,
    };
  }

  if (nextStep === "branch") {
    return {
      reply: [
        "מעולה 😊",
        "",
        "באיזה סניף אתם מעוניינים?",
        "• גלי הדר – ראשון לציון",
        "• בית חשמונאי",
      ].join("\n"),
      completed: false,
    };
  }

  return {
    reply:
      "תודה, רשמתי 😊\n\nהפרטים נאספו להמשך טיפול. צוות האקדמיה יחזור אליכם בהקדם.",
    completed: true,
  };
}

function getLeadContinuation({
  userMessage,
  conversationHistory = [],
  userProfile = {},
}) {
  const text =
    String(userMessage).trim();

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  // תשובה לשאלת השם
  if (isNameQuestion(lastAssistantMessage)) {
    const name = text.replace(
      /^(קוראים לי|קוראים לו|קוראים לה|השם הוא)\s+/,
      ""
    ).trim();

    if (!name || name.length < 2) {
      return {
        reply:
          "אשמח לקבל את שם המתאמן או המתאמנת.",
      };
    }

    const nextProfile = {
      ...userProfile,
      name,
    };

    const next =
      buildNextQuestion(nextProfile);

    return {
      updates: {
        name,
      },
      reply: next.reply,
      completed: next.completed,
    };
  }

  // תשובה לשאלת הגיל
  if (isAgeQuestion(lastAssistantMessage)) {
    const ageMatch =
      text.match(/\d{1,2}/);

    const age = ageMatch
      ? Number(ageMatch[0])
      : null;

    if (
      !Number.isInteger(age) ||
      age < 4 ||
      age > 99
    ) {
      return {
        reply:
          "מה גיל המתאמן או המתאמנת? אפשר לכתוב את הגיל במספרים.",
      };
    }

    const nextProfile = {
      ...userProfile,
      age,
    };

    const next =
      buildNextQuestion(nextProfile);

    return {
      updates: {
        age,
      },
      reply: next.reply,
      completed: next.completed,
    };
  }

  // תשובה לשאלת הסניף
  if (isBranchQuestion(lastAssistantMessage)) {
    const branch =
      normalizeBranch(text);

    if (!branch) {
      return {
        reply: [
          "איזה סניף מתאים לכם?",
          "• גלי הדר – ראשון לציון",
          "• בית חשמונאי",
        ].join("\n"),
      };
    }

    const nextProfile = {
      ...userProfile,
      branch,
    };

    const next =
      buildNextQuestion(nextProfile);

    return {
      updates: {
        branch,
      },
      reply: next.reply,
      completed: next.completed,
    };
  }

  return null;
}

module.exports = {
  getLeadContinuation,
};