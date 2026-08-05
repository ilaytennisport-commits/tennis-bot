function extractNumber(message = "") {
  const match = String(message).match(/\d{2,3}/);

  if (!match) {
    return null;
  }

  return Number(match[0]);
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

function getEquipmentContinuation({
  userMessage,
  conversationHistory = [],
  userProfile = {},
}) {
  const lastAssistantMessage =
    getLastAssistantMessage(
      conversationHistory
    );

  const number =
    extractNumber(userMessage);

  // המשך להתאמת מחבט לפי גובה
  if (
    lastAssistantMessage.includes(
      "מה הגובה"
    ) &&
    number &&
    number >= 90 &&
    number <= 220
  ) {
    const age = Number(
      userProfile.age
    );

    let racketSize;

    if (number <= 100) {
      racketSize = "19–21 אינץ׳";
    } else if (number <= 115) {
      racketSize = "21–23 אינץ׳";
    } else if (number <= 125) {
      racketSize = "23 אינץ׳";
    } else if (number <= 140) {
      racketSize = "25 אינץ׳";
    } else if (number <= 150) {
      racketSize = "25–26 אינץ׳";
    } else {
      racketSize = "26–27 אינץ׳";
    }

    return [
      "תודה, רשמתי 😊",
      "",
      `לפי גובה של ${number} ס״מ${
        age
          ? ` וגיל ${age}`
          : ""
      }, כדאי להתחיל מבדיקה של מחבט בגודל ${racketSize}.`,
      "ההתאמה הסופית תלויה גם ברמת הניסיון, בכוח ובנוחות האחיזה.",
      "",
      "האם זה המחבט הראשון שלו?",
    ].join("\n");
  }

  // המשך לשיחת גידים
  if (
    lastAssistantMessage.includes(
      "מתחיל או מנוסה"
    )
  ) {
    const text = String(
      userMessage
    ).toLowerCase();

    if (
      /מתחיל|מתחילה|חדש|חדשה/.test(
        text
      )
    ) {
      return [
        "תודה 😊",
        "",
        "לשחקן מתחיל כדאי בדרך כלל לבחור גידים נוחים וסלחניים.",
        "כדי להתאים אותם נכון, חשוב לדעת גם איזה מחבט יש לך.",
        "",
        "מה דגם המחבט?",
      ].join("\n");
    }

    if (
      /מנוסה|מתקדם|מתקדמת|תחרותי|תחרותית/.test(
        text
      )
    ) {
      return [
        "תודה 😊",
        "",
        "לשחקן מנוסה ניתן להתאים גידים לפי העדפה לעוצמה, לשליטה או לנוחות.",
        "",
        "מה חשוב לך יותר: עוצמה או שליטה?",
      ].join("\n");
    }
  }

  return null;
}

module.exports = {
  getEquipmentContinuation,
};