const equipmentKnowledge = require(
  "../knowledge/equipmentKnowledge"
);

function getCategoryKnowledge(category) {
  return (
    equipmentKnowledge[category] ||
    equipmentKnowledge.categories?.[category] ||
    null
  );
}

function detectEquipmentCategory(message = "") {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (/מחבט|מחבטים|רקטה|רקטות/.test(text)) {
    return "rackets";
  }

  if (/גריפ|אוברגריפ|ידית/.test(text)) {
    return "grips";
  }

  if (/גיד|גידים|שזירה|מתיחה/.test(text)) {
    return "strings";
  }

  if (/כדור|כדורים/.test(text)) {
    return "balls";
  }

  if (/נעל|נעליים/.test(text)) {
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

function getRacketGuidance(
  rackets,
  audience
) {
  if (!rackets) {
    return [];
  }

  if (audience === "child") {
    return (
      rackets.childGuidance ||
      rackets.guidance?.children ||
      []
    );
  }

  if (audience === "adult") {
    return (
      rackets.adultGuidance ||
      rackets.guidance?.adults ||
      []
    );
  }

  return [];
}

function buildRacketResponse(
  audience
) {
  const rackets =
    getCategoryKnowledge("rackets");

  if (!rackets) {
    return equipmentKnowledge.fallbackResponse ||
      "באקדמיה יש מגוון אפשרויות בנושא מחבטים וציוד טניס. כדי להתאים נכון, אשמח להבין למי מיועד המחבט.";
  }

  if (audience === "child") {
    const guidance =
      getRacketGuidance(
        rackets,
        "child"
      );

    return [
      ...guidance,
      "",
      "מה גיל הילד או הילדה?",
    ].join("\n");
  }

  if (audience === "adult") {
    const guidance =
      getRacketGuidance(
        rackets,
        "adult"
      );

    return [
      ...guidance,
      "",
      "האם מדובר במחבט ראשון או בשדרוג למחבט קיים?",
    ].join("\n");
  }

  return [
    "בשמחה. בחירת מחבט תלויה בגיל, בגובה וברמת הניסיון.",
    "",
    "המחבט מיועד לילד, לנער או למבוגר?",
  ].join("\n");
}

function getGuidance(category) {
  const knowledge =
    getCategoryKnowledge(category);

  if (!knowledge) {
    return [];
  }

  return Array.isArray(knowledge.guidance)
    ? knowledge.guidance
    : [];
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
        ...getGuidance("grips"),
        "",
        "האם מדובר בהחלפת גריפ קיים או בהתאמת גודל האחיזה?",
      ].join("\n");

    case "strings":
      return [
        ...getGuidance("strings"),
        "",
        "מה רמת הניסיון של השחקן או השחקנית?",
      ].join("\n");

    case "balls":
      return [
        ...getGuidance("balls"),
        "",
        "למי מיועדים הכדורים — ילד, נער או מבוגר?",
      ].join("\n");

    case "shoes":
      return [
        ...getGuidance("shoes"),
        "",
        "הנעליים מיועדות לילד או למבוגר?",
      ].join("\n");

    case "accessories": {
      const accessories =
        getCategoryKnowledge(
          "accessories"
        );

      const items =
        accessories?.items || [];

      return [
        "יש מגוון ציוד נלווה לטניס, כגון:",
        ...items.map(
          (item) => `• ${item}`
        ),
        "",
        "איזה ציוד אתם מחפשים?",
      ].join("\n");
    }

    default:
      return (
        equipmentKnowledge.fallbackResponse ||
        "באקדמיה יש מגוון אפשרויות בנושא מחבטים וציוד טניס. כדי להתאים נכון, אשמח להבין למי מיועד הציוד."
      );
  }
}

module.exports = {
  getEquipmentResponse,
  detectEquipmentCategory,
  detectEquipmentAudience,
};