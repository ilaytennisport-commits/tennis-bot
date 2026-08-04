function polishResponse(response, options = {}) {
  if (!response || typeof response !== "string") {
    return response;
  }

  let text = response.trim();

  // הסרת רווחים מיותרים
  text = text.replace(/\n{3,}/g, "\n\n");

  // פתיח ידידותי אם חסר
  const greetings = [
    "בשמחה",
    "בשמחה 😊",
    "כמובן",
    "בהחלט",
    "כן,"
  ];

  const hasGreeting = greetings.some(g =>
    text.startsWith(g)
  );

  if (!hasGreeting) {
    text = "בשמחה 😊\n\n" + text;
  }

  // אם אין שאלה בסוף - נציע המשך שיחה
  if (
    !text.includes("?") &&
    options.offerMoreHelp !== false
  ) {
    text += "\n\nיש עוד משהו שאוכל לעזור בו?";
  }

  return text;
}

module.exports = {
  polishResponse,
};