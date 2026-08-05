function extractAge(message = "") {
  const text = String(message).trim();

  const match = text.match(
    /(?:בן|בת|גיל)\s*(\d{1,2})/
  );

  if (!match) {
    return null;
  }

  const age = Number(match[1]);

  if (age < 4 || age > 99) {
    return null;
  }

  return age;
}

function extractHeight(message = "") {
  const text = String(message).trim();

  const explicitMatch = text.match(
    /(?:גובה|גובהו|גובהה)\s*[:\-]?\s*(\d{2,3})/
  );

  if (explicitMatch) {
    const height = Number(explicitMatch[1]);

    if (height >= 80 && height <= 230) {
      return height;
    }
  }

  const heightWithUnitMatch = text.match(
    /(\d{2,3})\s*(?:ס"מ|ס״מ|סמ)/
  );

  if (heightWithUnitMatch) {
    const height = Number(
      heightWithUnitMatch[1]
    );

    if (height >= 80 && height <= 230) {
      return height;
    }
  }

  const numericOnlyMatch = text.match(
    /^\s*(\d{2,3})\s*$/
  );

  if (numericOnlyMatch) {
    const height = Number(
      numericOnlyMatch[1]
    );

    if (height >= 80 && height <= 230) {
      return height;
    }
  }

  return null;
}

function detectAudience(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  if (
    /ילד|ילדה|ילדים|לילד|לילדה|בן שלי|בת שלי|הבן|הבת|נוער/.test(
      text
    )
  ) {
    return "child";
  }

  if (
    /מבוגר|מבוגרת|מבוגרים|למבוגר|למבוגרת|בשבילי|לעצמי|עבורי/.test(
      text
    )
  ) {
    return "adult";
  }

  const extractedAge = extractAge(message);
  const savedAge = Number(profile.age);

  const age =
    extractedAge ||
    (
      Number.isFinite(savedAge) &&
      savedAge > 0
        ? savedAge
        : null
    );

  if (age) {
    return age >= 18
      ? "adult"
      : "child";
  }

  return profile.audience || null;
}

function detectEquipmentTopic(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  // פריטים ספציפיים נבדקים לפני "מחבט".
  if (
    /תיק למחבט|תיקי מחבטים|תיק/.test(
      text
    )
  ) {
    return "bag";
  }

  if (
    /בולם זעזועים|סופג זעזועים|בולם/.test(
      text
    )
  ) {
    return "vibration_damper";
  }

  if (
    /אוברגריפ|גריפ|גריפים|ידית|אחיזה/.test(
      text
    )
  ) {
    return "grip";
  }

  if (
    /גיד|גידים|מיתר|מיתרים|שזירה/.test(
      text
    )
  ) {
    return "strings";
  }

  if (/כדור|כדורים/.test(text)) {
    return "balls";
  }

  if (
    /נעלי טניס|נעליים|נעל/.test(
      text
    )
  ) {
    return "shoes";
  }

  if (
    /מחבט|מחבטים|רקטה|רקטות/.test(
      text
    )
  ) {
    return "racket";
  }

  return profile.equipment_topic || null;
}

function buildProfileUpdates(
  message = "",
  profile = {}
) {
  const updates = {};

  const age = extractAge(message);
  const height = extractHeight(message);

  const audience = detectAudience(
    message,
    profile
  );

  const equipmentTopic =
    detectEquipmentTopic(
      message,
      profile
    );

  if (age !== null) {
    updates.age = age;
  }

  if (height !== null) {
    updates.height = height;
  }

  if (audience) {
    updates.audience = audience;
  }

  if (equipmentTopic) {
    updates.equipment_topic =
      equipmentTopic;
  }

  return updates;
}

module.exports = {
  extractAge,
  extractHeight,
  detectAudience,
  detectEquipmentTopic,
  buildProfileUpdates,
};