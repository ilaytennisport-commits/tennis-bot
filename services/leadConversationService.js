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

  if (text.includes("בית דגן")) {
    return "בית דגן";
  }

  if (
    text.includes("בית חשמונאי") ||
    text.includes("חשמונאי")
  ) {
    return "בית חשמונאי";
  }

  return null;
}

function getLeadContinuation({
  userMessage,
  conversationHistory = [],
  userProfile = {},
}) {
  const text = String(userMessage).trim();

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

    if (!hasValue(userProfile.age)) {
      return {
        updates: {
          name,
        },
        reply:
          "תודה, רשמתי 😊\n\nמה גיל המתאמן או המתאמנת?",
      };
    }

    if (!hasValue(userProfile.branch)) {
      return {
        updates: {
          name,
        },
        reply: [
          "תודה, רשמתי 😊",
          "",
          "באיזה סניף אתם מעוניינים?",
          "• גלי הדר – ראשון לציון",
          "• בית דגן",
          "• בית חשמונאי",
        ].join("\n"),
      };
    }

    return {
      updates: {
        name,
      },
      reply:
        "תודה, רשמתי את השם.",
    };
  }

  // תשובה לשאלת הגיל
  if (isAgeQuestion(lastAssistantMessage)) {
    const ageMatch = text.match(/\d{1,2}/);
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

    if (!hasValue(userProfile.branch)) {
      return {
        updates: {
          age,
        },
        reply: [
          "תודה 😊",
          "",
          "באיזה סניף אתם מעוניינים?",
          "• גלי הדר – ראשון לציון",
          "• בית דגן",
          "• בית חשמונאי",
        ].join("\n"),
      };
    }

    return {
      updates: {
        age,
      },
      reply:
        "תודה, רשמתי את הגיל.",
    };
  }

  // תשובה לשאלת הסניף
  if (isBranchQuestion(lastAssistantMessage)) {
    const branch = normalizeBranch(text);

    if (!branch) {
      return {
        reply: [
          "איזה סניף מתאים לכם?",
          "• גלי הדר – ראשון לציון",
          "• בית דגן",
          "• בית חשמונאי",
        ].join("\n"),
      };
    }

    return {
      updates: {
        branch,
      },
      reply:
        "תודה, רשמתי 😊\n\nהפרטים נאספו להמשך טיפול. צוות האקדמיה יבדוק את האפשרות המתאימה ויחזור אליכם.",
      completed: true,
    };
  }

  return null;
}

module.exports = {
  getLeadContinuation,
};