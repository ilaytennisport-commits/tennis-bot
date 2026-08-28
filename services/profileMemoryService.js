function extractAge(message = "") {
  const text = String(message).trim();

  // דוגמאות:
  // בן 9
  // בת 11
  // גיל 35
  // הבן שלי בן 9
  // הילדה בת 7
  // אני בן 42
  const match = text.match(
    /(?:בן|בת|גיל)\s*:?\s*(\d{1,2})/u
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

  // דוגמאות:
  // גובה 140
  // גובה: 140
  // גובה - 140
  const explicitMatch = text.match(
    /(?:גובה|גובהו|גובהה)\s*[:\-]?\s*(\d{2,3})/u
  );

  if (explicitMatch) {
    const height = Number(explicitMatch[1]);

    if (height >= 80 && height <= 230) {
      return height;
    }
  }

  // דוגמאות:
  // 140 ס"מ
  // 140 ס״מ
  // 140 סמ
  const heightWithUnitMatch = text.match(
    /(\d{2,3})\s*(?:ס"מ|ס״מ|סמ)/u
  );

  if (heightWithUnitMatch) {
    const height = Number(heightWithUnitMatch[1]);

    if (height >= 80 && height <= 230) {
      return height;
    }
  }

  // מספר בלבד בטווח הגיוני של גובה
  const numericOnlyMatch = text.match(
    /^\s*(\d{2,3})\s*$/
  );

  if (numericOnlyMatch) {
    const height = Number(numericOnlyMatch[1]);

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
    /ילד|ילדה|ילדים|לילד|לילדה|בן שלי|בת שלי|הבן|הבת|נוער/u.test(
      text
    )
  ) {
    return "child";
  }

  if (
    /מבוגר|מבוגרת|מבוגרים|למבוגר|למבוגרת|בשבילי|לעצמי|עבורי/u.test(
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

  if (
    /תיק למחבט|תיקי מחבטים|תיק/u.test(
      text
    )
  ) {
    return "bag";
  }

  if (
    /בולם זעזועים|סופג זעזועים|בולם/u.test(
      text
    )
  ) {
    return "vibration_damper";
  }

  if (
    /אוברגריפ|גריפ|גריפים|ידית|אחיזה/u.test(
      text
    )
  ) {
    return "grip";
  }

  if (
    /גיד|גידים|מיתר|מיתרים|שזירה/u.test(
      text
    )
  ) {
    return "strings";
  }

  if (
    /כדור|כדורים/u.test(
      text
    )
  ) {
    return "balls";
  }

  if (
    /נעלי טניס|נעליים|נעל/u.test(
      text
    )
  ) {
    return "shoes";
  }

  if (
    /מחבט|מחבטים|רקטה|רקטות/u.test(
      text
    )
  ) {
    return "racket";
  }

  return (
    profile.equipment_topic ||
    null
  );
}

function detectExperience(
  message = "",
  profile = {}
) {
  const text = String(message)
    .toLowerCase()
    .trim();

  /*
   * מתחיל / ללא ניסיון.
   * חייב להיבדק לפני experienced,
   * כדי ש"אף פעם לא שיחקתי"
   * לא יזוהה בטעות כשחקן מנוסה.
   */
  if (
    /מתחיל|מתחילה|מתחיל מאפס|מתחילה מאפס|חדש|חדשה|פעם ראשונה|לא שיחק|לא שיחקה|לא שיחקתי|לא שיחקה|אף פעם לא שיחקתי|אף פעם לא שיחק|אף פעם לא שיחקה|מעולם לא שיחקתי|מעולם לא שיחק|מעולם לא שיחקה|אין לי ניסיון|אין לו ניסיון|אין לה ניסיון|בלי ניסיון/u.test(
      text
    )
  ) {
    return "beginner";
  }

  /*
   * ניסיון קודם.
   *
   * מכסה גם:
   * "הוא כבר שיחק בעבר"
   * "אני משחק כבר כמה שנים"
   * "משחק טניס כבר כמה שנים"
   * "משחקת טניס שנתיים"
   * "שיחק בערך שנתיים"
   */
  if (
    /שיחק בעבר|שיחקה בעבר|שיחקתי בעבר|שיחקתי פעם|כבר שיחקתי|כבר שיחק|כבר שיחקה|כבר משחק|כבר משחקת|אני משחק|אני משחקת|משחק טניס|משחקת טניס|שיחק טניס|שיחקה טניס|שיחקתי טניס|יש לי ניסיון|יש לו ניסיון|יש לה ניסיון|ניסיון קודם|שיחקתי כמה שנים|שיחק כמה שנים|שיחקה כמה שנים|שיחקתי כמה חודשים|שיחק כמה חודשים|שיחקה כמה חודשים|משחק כבר כמה שנים|משחקת כבר כמה שנים|משחק טניס כבר|משחקת טניס כבר|מתקדם|מתקדמת|מנוסה/u.test(
      text
    )
  ) {
    return "experienced";
  }

  return (
    profile.experience ||
    null
  );
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

  const equipmentTopic = detectEquipmentTopic(
    message,
    profile
  );

  const experience = detectExperience(
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

  if (experience) {
    updates.experience =
      experience;
  }

  return updates;
}

module.exports = {
  extractAge,
  extractHeight,
  detectAudience,
  detectEquipmentTopic,
  detectExperience,
  buildProfileUpdates,
};