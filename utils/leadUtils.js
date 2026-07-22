function whatsappIdToPhone(userId) {
  const digits = String(userId || "").replace(/\D/g, "");

  if (digits.startsWith("972") && digits.length >= 11) {
    return `0${digits.slice(3)}`;
  }

  return digits || null;
}

function extractUserDetails(message, currentUser = {}) {
  const updates = {};
  const cleanMessage = String(message || "").trim();

  // גיל: "בן 9", "בת 12", "גיל 30"
  const ageMatch = cleanMessage.match(/(?:בן|בת|גיל)\s*(\d{1,2})/);

  if (ageMatch) {
    const age = Number(ageMatch[1]);

    if (age >= 4 && age <= 99) {
      updates.age = age;
    }
  }

  // מספר טלפון ישראלי
  const phoneMatch = cleanMessage.match(
    /(?:\+972|972|0)?5\d[-\s]?\d{3}[-\s]?\d{4}/
  );

  if (phoneMatch) {
    updates.phone = phoneMatch[0].replace(/[-\s]/g, "");
  }

  // סניף
  if (
    cleanMessage.includes("גלי הדר") ||
    cleanMessage.includes("ראשון לציון") ||
    cleanMessage.includes("רמז")
  ) {
    updates.branch = "גלי הדר – ראשון לציון";
  } else if (cleanMessage.includes("בית דגן")) {
    updates.branch = "בית דגן";
  } else if (
    cleanMessage.includes("בית חשמונאי") ||
    cleanMessage.includes("חשמונאי")
  ) {
    updates.branch = "בית חשמונאי";
  }

  // מטרת הפנייה
  if (cleanMessage.includes("ניסיון")) {
    updates.goal = "שיעור ניסיון";
  } else if (cleanMessage.includes("חוג")) {
    updates.goal = "חוג טניס";
  } else if (
    cleanMessage.includes("אימון אישי") ||
    cleanMessage.includes("שיעור פרטי")
  ) {
    updates.goal = "אימון אישי";
  }

  // שם
  const namePatterns = [
    /קוראים לי\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לו\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לה\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלי\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלו\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלה\s+([א-תA-Za-z"-]{2,20})/,
  ];

  for (const pattern of namePatterns) {
    const nameMatch = cleanMessage.match(pattern);

    if (nameMatch) {
      updates.name = nameMatch[1];
      break;
    }
  }

  // מילה בודדת יכולה להיות שם
  const singleWordName = cleanMessage.match(/^[א-תA-Za-z"-]{2,20}$/);

  const wordsThatAreNotNames = new Set([
    "שלום",
    "היי",
    "כן",
    "לא",
    "תודה",
    "ניסיון",
    "מחיר",
    "מחירים",
    "גלי",
    "הדר",
    "איפוס",
  ]);

  if (
    !currentUser.name &&
    !updates.name &&
    singleWordName &&
    !wordsThatAreNotNames.has(cleanMessage)
  ) {
    updates.name = cleanMessage;
  }

  return updates;
}

function getMissingLeadFields(user) {
  const missing = [];

  if (!user.name) {
    missing.push("שם המתאמן");
  }

  if (!user.age) {
    missing.push("גיל");
  }

  if (!user.branch) {
    missing.push("סניף מועדף");
  }

  if (!user.phone) {
    missing.push("מספר טלפון");
  }

  return missing;
}

function formatLeadSummary(user) {
  return [
    "תודה! קיבלתי את הפרטים 😊",
    "",
    `שם: ${user.name}`,
    `גיל: ${user.age}`,
    `סניף: ${user.branch}`,
    `טלפון: ${user.phone}`,
    "",
    "הפרטים נשמרו להמשך טיפול. צוות האקדמיה יבדוק קבוצה מתאימה ויחזור אליכם.",
  ].join("\n");
}

module.exports = {
  whatsappIdToPhone,
  extractUserDetails,
  getMissingLeadFields,
  formatLeadSummary,
};