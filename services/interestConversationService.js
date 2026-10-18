function getInterestResponse({
  userMessage = "",
  conversationIntent = {},
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  /*
   * השירות הזה מטפל רק בהתעניינות כללית.
   * המלצות מטופלות ב-recommendationService.
   */
  /*
   * רק התעניינות מפורשת ("אשמח לפרטים", "מתעניינת").
   * "התעניינות" שנובעת רק מפרטים שמורים בפרופיל
   * (ביטחון נמוך) אינה סיבה לענות תשובה כללית —
   * למשל "40" כתשובה לשאלת גיל.
   */
  if (
    conversationIntent.stage !==
      "interest" ||
    (conversationIntent.confidence || 0) < 0.8
  ) {
    return null;
  }

  if (
    text.includes("עוד לא החלטתי") ||
    text.includes("מתלבט") ||
    text.includes("מתלבטת")
  ) {
    return [
      "ברור 😊",
      "",
      "אפשר בהחלט קודם להבין מה הכי מתאים בלי להתחייב.",
      "",
      "מה הכי חשוב לך לדעת כרגע — מחיר, רמה, סניף או איך נראה האימון?"
    ].join("\n");
  }

  if (
    text.includes("פרטים") ||
    text.includes("מתעניין") ||
    text.includes("מתעניינת")
  ) {
    return [
      "בשמחה 😊",
      "",
      "אפשר לקבל מידע על המסלולים, המחירים והסניפים בלי להתחייב.",
      "",
      "מה הכי מעניין אותך לדעת קודם?"
    ].join("\n");
  }

  return [
    "בשמחה 😊",
    "",
    "אשמח לעזור להבין מה יכול להתאים.",
    "",
    "מה היית רוצה לדעת קודם?"
  ].join("\n");
}

module.exports = {
  getInterestResponse,
};