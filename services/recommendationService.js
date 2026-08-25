function detectExperience(
  message = ""
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    /מתחיל|מתחילה|מתחיל מאפס|חדש|חדשה|פעם ראשונה|לא שיחק|לא שיחקה/.test(
      text
    )
  ) {
    return "beginner";
  }

  if (
    /שיחק בעבר|שיחקה בעבר|כבר משחק|כבר משחקת|מתקדם|מתקדמת|מנוסה/.test(
      text
    )
  ) {
    return "experienced";
  }

  return null;
}

function getRecommendationResponse({
  userMessage = "",
  userProfile = {},
  conversationIntent = {},
}) {
  if (
    conversationIntent.stage !==
    "recommendation"
  ) {
    return null;
  }

  const age =
    Number(userProfile.age);

  const experience =
    detectExperience(
      userMessage
    );

  /*
   * ילד עם גיל ידוע.
   */
  if (
    Number.isFinite(age) &&
    age > 0 &&
    age < 18
  ) {
    if (experience === "beginner") {
      return [
        "מצוין 😊",
        "",
        `לילד בן ${age} שמתחיל מאפס, חוג קבוצתי למתחילים הוא בדרך כלל נקודת פתיחה מצוינת.`,
        "באימונים עובדים בהדרגה על היכרות עם המחבט והכדור, קואורדינציה, תנועה במגרש, חבטות בסיסיות והבנת המשחק.",
        "",
        "המטרה היא קודם כול לבנות ביטחון והנאה מהמשחק, ורק אחר כך להתקדם לטכניקה מורכבת יותר.",
        "",
        "באיזה סניף יהיה לכם הכי נוח — גלי הדר בראשון לציון או בית חשמונאי?"
      ].join("\n");
    }

    if (experience === "experienced") {
      return [
        "בשמחה 😊",
        "",
        `לילד בן ${age} שכבר שיחק בעבר, כדאי להתאים קבוצה לפי הרמה בפועל ולא רק לפי הגיל.`,
        "",
        "כמה זמן הוא כבר משחק?"
      ].join("\n");
    }

    return [
      "בשמחה 😊",
      "",
      `לפי גיל ${age}, אפשר להתאים קבוצה שמתאימה לגיל ולרמת המשחק.`,
      "",
      "הוא מתחיל לגמרי או שכבר שיחק בעבר?"
    ].join("\n");
  }

  /*
   * מבוגר עם גיל ידוע.
   */
  if (
    Number.isFinite(age) &&
    age >= 18
  ) {
    if (experience === "beginner") {
      return [
        "בשמחה 😊",
        "",
        "למבוגר שמתחיל מאפס, בדרך כלל הכי נכון להתחיל בקבוצת מתחילים או באימון אישי, לפי ההעדפה.",
        "",
        "אתה מעדיף קבוצה או מסגרת אישית יותר?"
      ].join("\n");
    }

    if (experience === "experienced") {
      return [
        "בשמחה 😊",
        "",
        "אם כבר יש ניסיון, כדאי להתאים מסגרת לפי הרמה והמטרה שלך.",
        "",
        "מה חשוב לך יותר כרגע — שיפור טכניקה, כושר או משחקים?"
      ].join("\n");
    }

    return [
      "בשמחה 😊",
      "",
      "יש מסגרות למבוגרים ברמות שונות.",
      "",
      "אתה מתחיל לגמרי או שכבר שיחקת בעבר?"
    ].join("\n");
  }

  /*
   * אין עדיין גיל.
   */
  return [
    "בשמחה 😊",
    "",
    "כדי להמליץ על מסגרת שמתאימה באמת, חשוב לדעת גיל ורמת ניסיון.",
    "",
    "בן או בת כמה המתאמן או המתאמנת?"
  ].join("\n");
}

module.exports = {
  getRecommendationResponse,
  detectExperience,
};