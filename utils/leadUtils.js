function whatsappIdToPhone(userId) {
  const rawId = String(userId || "");

  const phoneMatch =
    rawId.match(/(?:972|0)?5\d{8}/);

  if (!phoneMatch) {
    return null;
  }

  let phone = phoneMatch[0];

  if (phone.startsWith("972")) {
    phone = `0${phone.slice(3)}`;
  } else if (phone.startsWith("5")) {
    phone = `0${phone}`;
  }

  return phone;
}

function extractUserDetails(
  message,
  currentUser = {}
) {
  const updates = {};

  const cleanMessage =
    String(message || "").trim();

  const normalizedMessage =
    cleanMessage.replace(/\s+/g, " ");

  /*
   * זיהוי גיל:
   * "בן 7", "בת 12", "גיל 30"
   */
  const ageWithLabelMatch =
    normalizedMessage.match(
      /(?:בן|בת|גיל(?:ו|ה)?(?:\s+הוא|\s+היא)?)\s*:?\s*(\d{1,2})/
    );

  if (ageWithLabelMatch) {
    const age =
      Number(ageWithLabelMatch[1]);

    if (age >= 4 && age <= 99) {
      updates.age = age;
    }
  }

  /*
   * זיהוי גיל כאשר המשתמש
   * עונה רק במספר, למשל "7".
   *
   * מתבצע רק אם עדיין לא נשמר גיל.
   */
  if (
    !currentUser.age &&
    !updates.age
  ) {
    const standaloneAgeMatch =
      normalizedMessage.match(
        /^\s*(\d{1,2})\s*$/
      );

    if (standaloneAgeMatch) {
      const age =
        Number(standaloneAgeMatch[1]);

      if (age >= 4 && age <= 99) {
        updates.age = age;
      }
    }
  }

  /*
   * מספר טלפון ישראלי.
   */
  const phoneMatch =
    normalizedMessage.match(
      /(?:\+972|972|0)?5\d[-\s]?\d{3}[-\s]?\d{4}/
    );

  if (phoneMatch) {
    let phone =
      phoneMatch[0].replace(
        /[-\s]/g,
        ""
      );

    if (phone.startsWith("+972")) {
      phone =
        `0${phone.slice(4)}`;
    } else if (
      phone.startsWith("972")
    ) {
      phone =
        `0${phone.slice(3)}`;
    } else if (
      phone.startsWith("5")
    ) {
      phone = `0${phone}`;
    }

    updates.phone = phone;
  }

  /*
   * זיהוי סניף.
   */
  if (
    normalizedMessage.includes(
      "גלי הדר"
    ) ||
    normalizedMessage.includes(
      "ראשון לציון"
    ) ||
    normalizedMessage.includes(
      "רמז"
    )
  ) {
    updates.branch =
      "גלי הדר – ראשון לציון";
  } else if (
    normalizedMessage.includes(
      "בית חשמונאי"
    ) ||
    normalizedMessage.includes(
      "חשמונאי"
    )
  ) {
    updates.branch =
      "בית חשמונאי";
  }

  /*
   * מטרת הפנייה.
   *
   * כוונת הרשמה נבדקת לפני "חוג",
   * כדי ש-"אני רוצה להירשם לחוג"
   * יישמר כהרשמה ולא רק כחוג טניס.
   */
  if (
    normalizedMessage.includes(
      "להירשם"
    ) ||
    normalizedMessage.includes(
      "להרשם"
    ) ||
    normalizedMessage.includes(
      "הרשמה"
    ) ||
    normalizedMessage.includes(
      "רוצה להצטרף"
    ) ||
    normalizedMessage.includes(
      "רוצה להתחיל"
    ) ||
    normalizedMessage.includes(
      "תרשמו אותי"
    ) ||
    normalizedMessage.includes(
      "לרשום את"
    )
  ) {
    updates.goal =
      "הרשמה לחוג";
  } else if (
    normalizedMessage.includes(
      "ניסיון"
    )
  ) {
    updates.goal =
      "שיעור ניסיון";
  } else if (
    normalizedMessage.includes(
      "אימון אישי"
    ) ||
    normalizedMessage.includes(
      "שיעור פרטי"
    )
  ) {
    updates.goal =
      "אימון אישי";
  } else if (
    normalizedMessage.includes(
      "אימון זוגי"
    )
  ) {
    updates.goal =
      "אימון זוגי";
  } else if (
    normalizedMessage.includes(
      "מבוגרים"
    )
  ) {
    updates.goal =
      "אימוני מבוגרים";
  } else if (
    normalizedMessage.includes(
      "ילדים"
    )
  ) {
    updates.goal =
      "אימוני ילדים";
  } else if (
    normalizedMessage.includes(
      "חוג"
    )
  ) {
    updates.goal =
      "חוג טניס";
  }

  /*
   * זיהוי שם רק כאשר המשתמש
   * מציין במפורש שזה שם.
   *
   * מילה בודדת כמו "רז" לא תישמר
   * כאן אוטומטית כשם.
   * אם הבוט שאל "מה שם המתאמן?",
   * leadConversationService יטפל בתשובה.
   */
  const namePatterns = [
    /קוראים לי\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לו\s+([א-תA-Za-z"-]{2,20})/,
    /קוראים לה\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלי\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלו\s+([א-תA-Za-z"-]{2,20})/,
    /השם שלה\s+([א-תA-Za-z"-]{2,20})/,
    /^([א-תA-Za-z"-]{2,20})\s+(?:בן|בת)\s+\d{1,2}$/,
  ];

  for (const pattern of namePatterns) {
    const nameMatch =
      normalizedMessage.match(
        pattern
      );

    if (nameMatch) {
      updates.name =
        nameMatch[1];

      break;
    }
  }

  return updates;
}

function getMissingLeadFields(
  user = {}
) {
  const missing = [];

  if (!user.name) {
    missing.push(
      "שם המתאמן"
    );
  }

  if (
    user.age === null ||
    user.age === undefined ||
    user.age === ""
  ) {
    missing.push("גיל");
  }

  if (!user.branch) {
    missing.push(
      "סניף מועדף"
    );
  }

  if (!user.phone) {
    missing.push(
      "מספר טלפון"
    );
  }

  if (!user.goal) {
    missing.push(
      "תחום התעניינות"
    );
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
    `תחום התעניינות: ${user.goal}`,
    "",
    "הפרטים נשמרו להמשך טיפול. צוות האקדמיה יבדוק את האפשרות המתאימה ויחזור אליכם.",
  ].join("\n");
}

module.exports = {
  whatsappIdToPhone,
  extractUserDetails,
  getMissingLeadFields,
  formatLeadSummary,
};