function polishResponse(response, options = {}) {
  if (!response || typeof response !== "string") {
    return response;
  }

  let text = response.trim();

  text = text.replace(/\n{3,}/g, "\n\n");

  const greetings = [
    "בשמחה",
    "כמובן",
    "בהחלט",
    "כן,",
  ];

  const hasGreeting = greetings.some((greeting) =>
    text.startsWith(greeting)
  );

  if (!hasGreeting) {
    text = `בשמחה 😊\n\n${text}`;
  }

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