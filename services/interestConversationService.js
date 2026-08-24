function getInterestResponse({
  userMessage = "",
  userProfile = {},
  conversationIntent = {},
}) {
  const text = String(userMessage)
    .toLowerCase()
    .trim();

  if (
    conversationIntent.stage !== "interest" &&
    conversationIntent.stage !== "recommendation"
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
    text.includes("מה מתאים") ||
    text.includes("מה מומלץ") ||
    text.includes("תמליץ")
  ) {
    if (userProfile.age) {
      return [
        "בשמחה 😊",
        "",
        `לפי גיל ${userProfile.age}, אפשר לכוון למסגרת שמתאימה לגיל ולרמת הניסיון.`,
        "",
        "המתאמן מתחיל לגמרי או שכבר שיחק בעבר?"
      ].join("\n");
    }

    return [
      "בשמחה 😊",
      "",
      "כדי לכוון למסגרת שמתאימה באמת, חשוב לדעת גיל ורמת ניסיון.",
      "",
      "בן או בת כמה המתאמן או המתאמנת?"
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