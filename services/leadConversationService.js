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
    message.includes(
      "מה שם המתאמן או המתאמנת?"
    ) ||
    message.includes(
      "מה שם הילד או הילדה?"
    )
  );
}


function isAgeQuestion(message = "") {
  return (
    message.includes(
      "מה גיל המתאמן או המתאמנת?"
    ) ||
    message.includes(
      "מה גיל הילד או הילדה?"
    )
  );
}


function isBranchQuestion(message = "") {
  return (
    message.includes(
      "באיזה סניף אתם מעוניינים?"
    ) ||
    message.includes(
      "באיזה סניף תרצו להתאמן?"
    )
  );
}


/*
 * מזהה שהלקוח שאל שאלה
 * במקום לענות לפרט שהבוט ביקש.
 *
 * לדוגמה:
 * "באיזה ימים יש אימונים?"
 * "כמה זה עולה?"
 * "יש חניה?"
 */
function looksLikeQuestion(
  message = ""
) {
  const text = String(message)
    .trim()
    .toLowerCase();

  if (!text) {
    return false;
  }

  if (text.includes("?")) {
    return true;
  }

  return (
    /^(מה|מתי|איפה|איפוא|איך|כמה|איזה|איזו|אילו|האם|למה|באיזה|באיזו|יש |אפשר |ניתן |עד מתי|מאיזה|לאיזה|איפה יש)/.test(
      text
    )
  );
}


/*
 * בדיקה בסיסית שהטקסט באמת
 * יכול להיות שם של אדם.
 */
function normalizeName(
  message = ""
) {
  let name = String(message)
    .trim()
    .replace(
      /^(קוראים לי|קוראים לו|קוראים לה|השם הוא|השם שלו|השם שלה|שמי)\s+/,
      ""
    )
    .trim();

  /*
   * לא שומרים שאלות בתור שם.
   */
  if (looksLikeQuestion(name)) {
    return null;
  }

  /*
   * לא שומרים משפטים ארוכים מאוד
   * בתור שם.
   */
  if (
    name.length < 2 ||
    name.length > 40
  ) {
    return null;
  }

  /*
   * שם לא אמור להכיל הרבה מילים.
   * מאפשר גם שם + שם משפחה.
   */
  const words =
    name
      .split(/\s+/)
      .filter(Boolean);

  if (words.length > 4) {
    return null;
  }

  /*
   * מונע מטקסטים נפוצים של FAQ
   * להפוך לשם.
   */
  if (
    /מחיר|עולה|אימון|אימונים|ימים|שעות|שעה|סניף|כתובת|איפה|מתי|חוג|קבוצה|קבוצות|ניסיון|נסיון|מחבט|ציוד/.test(
      name.toLowerCase()
    )
  ) {
    return null;
  }

  return name;
}


function normalizeBranch(
  message = ""
) {
  const text = String(message)
    .trim()
    .toLowerCase();

  if (
    text.includes("גלי הדר") ||
    text.includes("ראשון לציון") ||
    text === "ראשון" ||
    text.includes("רמז 96")
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
        "בשמחה 😊\n\nמה שם המתאמן או המתאמנת?",
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
        "תודה 😊",
        "",
        "באיזה סניף תרצו להתאמן?",
        "• גלי הדר – ראשון לציון",
        "• בית חשמונאי",
      ].join("\n"),
      completed: false,
    };
  }

  return {
    reply:
      "תודה 😊\n\nהפרטים נאספו להמשך טיפול. צוות האקדמיה יבדוק את האפשרות המתאימה ויחזור אליכם.",
    completed: true,
  };
}


function getLeadContinuation({
  userMessage = "",
  conversationHistory = [],
  userProfile = {},
}) {
  const text = String(userMessage)
    .trim();

  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );


  /*
   * תשובה לשאלת השם.
   */
  if (
    isNameQuestion(
      lastAssistantMessage
    )
  ) {
    /*
     * אם הלקוח שאל שאלה במקום לתת שם,
     * לא מטפלים בזה כליד.
     * ה-router ייתן ל-FAQ לטפל בה.
     */
    if (looksLikeQuestion(text)) {
      return null;
    }

    const name =
      normalizeName(text);

    if (!name) {
      return {
        reply:
          "אשמח לקבל את שם המתאמן או המתאמנת.",
        updates: {},
        completed: false,
      };
    }

    const nextProfile = {
      ...userProfile,
      name,
    };

    const next =
      buildNextQuestion(
        nextProfile
      );

    return {
      updates: {
        name,
      },
      reply: next.reply,
      completed:
        next.completed,
    };
  }


  /*
   * תשובה לשאלת הגיל.
   */
  if (
    isAgeQuestion(
      lastAssistantMessage
    )
  ) {
    /*
     * שאלה באמצע איסוף הליד
     * לא נחשבת לגיל.
     */
    if (looksLikeQuestion(text)) {
      return null;
    }

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
        updates: {},
        completed: false,
      };
    }

    const nextProfile = {
      ...userProfile,
      age,
    };

    const next =
      buildNextQuestion(
        nextProfile
      );

    return {
      updates: {
        age,
      },
      reply: next.reply,
      completed:
        next.completed,
    };
  }


  /*
   * תשובה לשאלת הסניף.
   */
  if (
    isBranchQuestion(
      lastAssistantMessage
    )
  ) {
    /*
     * אם זו שאלת ביניים,
     * נותנים ל-router לטפל בה.
     */
    if (looksLikeQuestion(text)) {
      return null;
    }

    const branch =
      normalizeBranch(text);

    if (!branch) {
      return {
        reply: [
          "איזה סניף מתאים לכם?",
          "• גלי הדר – ראשון לציון",
          "• בית חשמונאי",
        ].join("\n"),
        updates: {},
        completed: false,
      };
    }

    const nextProfile = {
      ...userProfile,
      branch,
    };

    const next =
      buildNextQuestion(
        nextProfile
      );

    return {
      updates: {
        branch,
      },
      reply: next.reply,
      completed:
        next.completed,
    };
  }


  return null;
}


module.exports = {
  getLeadContinuation,
};