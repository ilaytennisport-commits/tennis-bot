const equipmentKnowledge = require(
  "../knowledge/equipmentKnowledge"
);

function detectEquipmentCategory(message = "") {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    /מחבט|מחבטים|רקטה|רקטות/.test(text)
  ) {
    return "rackets";
  }

  if (
    /גריפ|אוברגריפ|ידית/.test(text)
  ) {
    return "grips";
  }

  if (
    /גיד|גידים|שזירה|מתיחה/.test(text)
  ) {
    return "strings";
  }

  if (
    /כדור|כדורים/.test(text)
  ) {
    return "balls";
  }

  if (
    /נעל|נעליים/.test(text)
  ) {
    return "shoes";
  }

  if (
    /תיק|בולם זעזועים|כובע|בקבוק|אביזר|ציוד נלווה/.test(
      text
    )
  ) {
    return "accessories";
  }

  return null;
}

function detectEquipmentAudience(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    /ילד|ילדה|ילדים|לילד|לילדה|בן שלי|בת שלי|נוער/.test(
      text
    )
  ) {
    return "child";
  }

  if (
    /מבוגר|מבוגרת|למבוגר|בשבילי|לעצמי|עבורי/.test(
      text
    )
  ) {
    return "adult";
  }

  const age = Number(profile.age);

  if (
    Number.isFinite(age) &&
    age > 0
  ) {
    return age >= 18
      ? "adult"
      : "child";
  }

  return null;
}

function buildRacketResponse(
  audience
) {
  const rackets =
    equipmentKnowledge.rackets;

  if (audience === "child") {
    return [
      ...rackets.childGuidance,
      "",
      "מה גיל הילד או הילדה?"
    ].join("\n");
  }

  if (audience === "adult") {
    return [
      ...rackets.adultGuidance,
      "",
      "האם מדובר במחבט ראשון או בשדרוג למחבט קיים?"
    ].join("\n");
  }

  return [
    "בשמחה. בחירת מחבט תלויה בגיל, בגובה וברמת הניסיון.",
    "",
    "המחבט מיועד לילד, לנער או למבוגר?"
  ].join("\n");
}

function getEquipmentResponse(
  message,
  profile = {}
) {
  const category =
    detectEquipmentCategory(message);

  const audience =
    detectEquipmentAudience(
      message,
      profile
    );

  switch (category) {
    case "rackets":
      return buildRacketResponse(
        audience
      );

    case "grips":
      return [
        ...equipmentKnowledge.grips.guidance,
        "",
        "האם מדובר בהחלפת גריפ קיים או בהתאמת גודל האחיזה?"
      ].join("\n");

    case "strings":
      return [
        ...equipmentKnowledge.strings.guidance,
        "",
        "מה רמת הניסיון של השחקן או השחקנית?"
      ].join("\n");

    case "balls":
      return [
        ...equipmentKnowledge.balls.guidance,
        "",
        "למי מיועדים הכדורים — ילד, נער או מבוגר?"
      ].join("\n");

    case "shoes":
      return [
        ...equipmentKnowledge.shoes.guidance,
        "",
        "הנעליים מיועדות לילד או למבוגר?"
      ].join("\n");

    case "accessories":
      return [
        "יש מגוון ציוד נלווה לטניס, כגון:",
        ...equipmentKnowledge.accessories.items.map(
          (item) => `• ${item}`
        ),
        "",
        "איזה ציוד אתם מחפשים?"
      ].join("\n");

    default:
      return equipmentKnowledge
        .fallbackResponse;
  }
}

module.exports = {
  getEquipmentResponse,
  detectEquipmentCategory,
  detectEquipmentAudience,
};