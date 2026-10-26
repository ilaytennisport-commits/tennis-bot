const { parseMonthSpec } = require("./months");

/*
 * =========================================================
 * פענוח הודעות של אנשי צוות (מנהלים ומאמנים)
 * =========================================================
 *
 * קובץ זה רק מפענח טקסט — בלי גישה למסד הנתונים.
 * פקודות עם שם + קבוצה מחזירות כמה "מועמדים" לחלוקה,
 * כי שם משפחה יכול להתחיל ב-ל או ב-מ ("דני לוי", "דני מזרחי").
 * ה-controller בוחר את המועמד הראשון שהקבוצות שלו קיימות.
 */

function cleanStaffText(
  value = ""
) {
  return String(value)
    .replace(/\*/g, "")
    .replace(/[״"]/g, '"')
    .replace(/[׳']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAttendanceName(
  value = ""
) {
  return String(value)
    .replace(
      /^[\s*•\-–—✅☑️✔️]+/u,
      ""
    )
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanManagerPart(
  value = ""
) {
  return cleanStaffText(value)
    .replace(
      /^(?:קבוצה|קבוצת)\s+/,
      ""
    )
    .replace(
      /^(?:ימים|יום)\s+/,
      ""
    )
    .trim();
}

/*
 * =========================================================
 * דיווח נוכחות
 * =========================================================
 */

const YESTERDAY_PATTERN =
  /(?:^|\s)(?:של\s+)?אתמול(?=\s|$)/;

function parseAttendanceCommand(
  message = ""
) {
  const rawText =
    String(message).trim();

  if (!rawText) {
    return {
      isAttendanceCommand: false,
    };
  }

  const lines =
    rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  if (lines.length === 0) {
    return {
      isAttendanceCommand: false,
    };
  }

  let firstLine =
    cleanStaffText(lines[0]);

  /*
   * "נוכחות צעירה אתמול" → דיווח על אתמול.
   */
  let dateOffsetDays = 0;

  if (YESTERDAY_PATTERN.test(firstLine)) {
    dateOffsetDays = -1;
    firstLine = firstLine
      .replace(YESTERDAY_PATTERN, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  let groupName = "";

  /*
   * פורמט מפורש:
   * נוכחות א+ד 16:00
   * נוכחות צעירה שלישי
   */
  const attendanceMatch =
    firstLine.match(
      /^נוכחות\s*[:\-–—]?\s*(.*)$/i
    );

  if (attendanceMatch) {
    groupName = cleanManagerPart(
      attendanceMatch[1]
    );
  } else {
    /*
     * פורמט מקוצר: צעירה / בוגרת שלישי / נבחרת צעירה חמישי
     */
    const possibleGroupName =
      cleanManagerPart(firstLine);

    const teamCommandPattern =
      /^(?:נבחרת\s+)?(?:צעירה|בוגרת)(?:\s+(?:ב|ביום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))?$/i;

    /*
     * רק שעה: "18:00", "18:00:", "בשעה 18", "18:00 שלישי".
     * הקבוצה תזוהה לפי היום והשעה.
     */
    const timeOnlyPattern =
      /^(?:בשעה\s+|ב-?)?\d{1,2}(?:[:.]\d{2})?(?:\s+(?:ב|ביום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))?\s*:?$/;

    if (
      teamCommandPattern.test(
        possibleGroupName
      ) ||
      timeOnlyPattern.test(
        possibleGroupName
      )
    ) {
      groupName = possibleGroupName.replace(
        /\s*:$/,
        ""
      );
    } else {
      return {
        isAttendanceCommand: false,
      };
    }
  }

  const presentNames =
    lines
      .slice(1)
      .flatMap((line) =>
        line.split(/[,;]/)
      )
      .map(cleanAttendanceName)
      .filter(Boolean);

  return {
    isAttendanceCommand: true,
    groupName,
    presentNames,
    dateOffsetDays,
  };
}

/*
 * =========================================================
 * חלוקה של "שם + קבוצה" לכל האפשרויות
 * =========================================================
 */

/*
 * מחזיר את כל המיקומים שבהם מופיע מפריד (למשל " ל" או " מ").
 * explicit: מפריד מפורש ("לקבוצה", "מקבוצה") — מקבל עדיפות.
 */
function findSeparators(text, letter) {
  const pattern = new RegExp(
    `\\s(${letter}(?:קבוצה|קבוצת)\\s+|${letter})`,
    "g"
  );

  const separators = [];
  let match;

  while ((match = pattern.exec(text))) {
    separators.push({
      index: match.index,
      end: match.index + match[0].length,
      explicit: match[1].length > 1,
    });

    pattern.lastIndex = match.index + 1;
  }

  return separators;
}

function orderSeparators(separators) {
  /*
   * קודם מפרידים מפורשים, ובכל סוג — מהסוף להתחלה
   * (שם המשפחה בא לפני שם הקבוצה).
   */
  return [...separators].sort((a, b) => {
    if (a.explicit !== b.explicit) {
      return a.explicit ? -1 : 1;
    }

    return b.index - a.index;
  });
}

function splitNameAndGroup(rest, letter) {
  const candidates = [];

  for (const separator of orderSeparators(
    findSeparators(rest, letter)
  )) {
    const traineeName = cleanManagerPart(
      rest.slice(0, separator.index)
    );

    const groupName = cleanManagerPart(
      rest.slice(separator.end)
    );

    if (traineeName && groupName) {
      candidates.push({
        traineeName,
        groupName,
      });
    }
  }

  return candidates;
}

function splitMove(rest) {
  const candidates = [];

  const toSeparators = orderSeparators(
    findSeparators(rest, "ל")
  );

  for (const toSeparator of toSeparators) {
    const beforeTo = rest.slice(
      0,
      toSeparator.index
    );

    const toGroupName = cleanManagerPart(
      rest.slice(toSeparator.end)
    );

    const fromSeparators = orderSeparators(
      findSeparators(beforeTo, "מ")
    );

    for (const fromSeparator of fromSeparators) {
      const traineeName = cleanManagerPart(
        beforeTo.slice(0, fromSeparator.index)
      );

      const fromGroupName = cleanManagerPart(
        beforeTo.slice(fromSeparator.end)
      );

      if (
        traineeName &&
        fromGroupName &&
        toGroupName
      ) {
        candidates.push({
          traineeName,
          fromGroupName,
          toGroupName,
        });
      }
    }
  }

  return candidates;
}

/*
 * =========================================================
 * פקודות ניהול טבעיות
 * =========================================================
 */

const ADD_VERBS =
  "תוסיף|הוסף|תוסיפי|הוסיפי|תכניס|תכניסי";
const REMOVE_VERBS =
  "תוריד|תסיר|הסר|הורד|תורידי|תסירי|תוציא|תוציאי";
const MOVE_VERBS =
  "תעביר|העבר|תעבירי";

function stripVerb(text, verbs) {
  const match = text.match(
    new RegExp(
      `^(?:${verbs})\\s+(?:את\\s+)?(.+)$`
    )
  );

  return match ? match[1].trim() : null;
}

function withCandidates(type, candidates, extra = {}) {
  if (candidates.length === 0) {
    return null;
  }

  return {
    type,
    ...candidates[0],
    ...extra,
    candidates,
  };
}

function parseNaturalManagerCommand(
  message = ""
) {
  const text = cleanStaffText(message);

  if (!text) {
    return null;
  }

  /*
   * רשימת קבוצה
   */
  const rosterPatterns = [
    /^(?:תראה|תראי|תציג|תציגי|הצג|הראה)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?רשימה\s+של\s+(?:קבוצה\s+|קבוצת\s+)?(.+)$/i,
    /^מי\s+(?:נמצא\s+|נמצאים\s+)?ב(?:קבוצה\s+|קבוצת\s+|נבחרת\s+)(.+)$/i,
  ];

  for (const pattern of rosterPatterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        type: "LIST_GROUP",
        groupName: cleanManagerPart(match[1]),
      };
    }
  }

  /*
   * העברה
   */
  const moveRest = stripVerb(text, MOVE_VERBS);

  if (moveRest) {
    const command = withCandidates(
      "MOVE_TRAINEE",
      splitMove(moveRest)
    );

    if (command) {
      return command;
    }
  }

  /*
   * הוספה
   */
  const addRest = stripVerb(text, ADD_VERBS);

  if (addRest) {
    const command = withCandidates(
      "ADD_TRAINEE",
      splitNameAndGroup(addRest, "ל"),
      { notes: null }
    );

    if (command) {
      return command;
    }
  }

  /*
   * הסרה
   */
  const removeRest = stripVerb(text, REMOVE_VERBS);

  if (removeRest) {
    const command = withCandidates(
      "REMOVE_TRAINEE",
      splitNameAndGroup(removeRest, "מ")
    );

    if (command) {
      return command;
    }
  }

  return null;
}

/*
 * =========================================================
 * עצירה / הפעלה של הבוט מול לקוח מסוים
 * =========================================================
 *
 * עצור בוט 0501234567
 * הפעל בוט 0501234567
 */
function parseBotControlCommand(
  message = ""
) {
  const text = cleanStaffText(message);

  const match = text.match(
    /^(עצור|השתק|הפעל|החזר)\s+(?:את\s+)?(?:ה)?בוט\s+(?:ל|עבור\s+|מול\s+)?([+\d][\d\s-]{7,})$/
  );

  if (!match) {
    return null;
  }

  return {
    type: /^(עצור|השתק)$/.test(match[1])
      ? "PAUSE_BOT"
      : "RESUME_BOT",
    phone: match[2].replace(/[\s-]/g, ""),
  };
}

/*
 * =========================================================
 * ייצוא נוכחות לאקסל
 * =========================================================
 *
 * ייצוא נוכחות               → החודש הנוכחי
 * ייצוא נוכחות חודש קודם
 * ייצוא נוכחות אוקטובר
 * דוח נוכחות 10/2026
 */
function parseExportCommand(
  message = "",
  now = new Date()
) {
  const text = cleanStaffText(message);

  const match = text.match(
    /^(?:ייצוא|יצוא|ייצא|תייצא|שלח|תשלח|תן|דוח|דו"ח|קובץ|אקסל)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:דוח\s+|דו"ח\s+|קובץ\s+)?נוכחות(?:\s+(?:לאקסל|באקסל|אקסל))?\s*(.*)$/
  );

  if (!match) {
    return null;
  }

  const yearMonth = parseMonthSpec(
    match[1],
    now
  );

  if (!yearMonth) {
    return {
      type: "INVALID_EXPORT_COMMAND",
    };
  }

  return {
    type: "EXPORT_ATTENDANCE",
    yearMonth,
  };
}

/*
 * =========================================================
 * פקודות ניהול – טבעיות + תאימות לפורמט הישן
 * =========================================================
 */

/*
 * =========================================================
 * שינוי שם (קבוצה / מתאמן)
 * =========================================================
 *
 * שתי שורות אחרי הפקודה:        או בשורה אחת:
 *   שנה שם קבוצה                 שנה שם קבוצה <ישן> ל- <חדש>
 *   <השם הישן>                   שנה שם אדל לאדל שלומון
 *   <השם החדש>
 */
function parseRenameCommand(message = "") {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => cleanStaffText(line))
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const head = lines[0].match(
    /^(?:שנה|תשנה|שינוי|לשנות)\s+(?:את\s+)?(?:ה)?שם(?:\s+(?:של\s+)?(?:ה)?(קבוצה|ילד|ילדה|מתאמן|מתאמנת|שחקן|שחקנית))?\s*[:\-–—]?\s*(.*)$/
  );

  if (!head) {
    return null;
  }

  const type = head[1] === "קבוצה" ? "RENAME_GROUP" : "RENAME_TRAINEE";
  const rest = head[2].trim();
  let oldName = "";
  let newName = "";

  if (!rest && lines.length >= 3) {
    oldName = lines[1];
    newName = lines[2];
  } else if (rest && lines.length >= 2) {
    oldName = rest;
    newName = lines[1];
  } else if (rest) {
    const arrow = rest.split(/\s*(?:→|->|=>|>>|⬅|←)\s*/);
    const explicit = rest.split(/\s+ל-\s*|\s+לשם\s+/);

    if (arrow.length === 2) {
      [oldName, newName] = arrow;
    } else if (explicit.length === 2) {
      [oldName, newName] = explicit;
    } else {
      /*
       * "אדל לאדל שלומון" — רק אם יש בדיוק מילה אחת שמתחילה ב-ל.
       */
      const words = rest.split(" ");
      const splitAt = words
        .map((word, index) => (index > 0 && /^ל[א-ת]/.test(word) ? index : -1))
        .filter((index) => index > 0);

      if (splitAt.length === 1) {
        oldName = words.slice(0, splitAt[0]).join(" ");
        newName = [words[splitAt[0]].slice(1), ...words.slice(splitAt[0] + 1)].join(" ");
      }
    }
  }

  return {
    type,
    oldName: cleanManagerPart(oldName),
    newName: cleanStaffText(newName),
  };
}

function parseManagerCommand(
  message = ""
) {
  const text = cleanStaffText(message);

  if (!text) {
    return null;
  }

  const renameCommand = parseRenameCommand(message);

  if (renameCommand) {
    return renameCommand;
  }

  if (/^(?:קבוצות|רשימת קבוצות|כל הקבוצות|מה הקבוצות)$/.test(text)) {
    return { type: "LIST_GROUPS" };
  }

  const botControl =
    parseBotControlCommand(text);

  if (botControl) {
    return botControl;
  }

  /*
   * קישור לדף הנוכחות החי.
   */
  if (
    /^(?:החלף|תחליף|חדש)\s+(?:את\s+)?(?:ה)?קישור\s+(?:ל)?(?:ה)?נוכחות$|^קישור\s+(?:נוכחות\s+)?חדש$/.test(
      text
    )
  ) {
    return { type: "ROTATE_ATTENDANCE_LINK" };
  }

  /*
   * מאמנים: "הוסף מאמן 0541234567 דנה" / "הסר מאמן 0541234567" / "מאמנים".
   */
  if (/^(?:מאמנים|רשימת מאמנים|מי המאמנים)$/.test(text)) {
    return { type: "LIST_COACHES" };
  }

  const addCoachMatch = text.match(
    /^(?:הוסף|תוסיף|הגדר|תגדיר)\s+(?:את\s+)?(?:ה)?(?:מאמן|מאמנת|מדריך|מדריכה)\s+(.+)$/
  );

  if (addCoachMatch) {
    const rest = addCoachMatch[1];
    const phoneMatch = rest.match(/(?:\+?972|0)[\d\s-]{8,13}\d/);

    return {
      type: "ADD_COACH",
      phone: phoneMatch ? phoneMatch[0] : "",
      name: (phoneMatch ? rest.replace(phoneMatch[0], " ") : rest)
        .replace(/[,:\-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }

  const removeCoachMatch = text.match(
    /^(?:הסר|תסיר|מחק|תמחק|הורד|תוריד)\s+(?:את\s+)?(?:ה)?(?:מאמן|מאמנת|מדריך|מדריכה)\s+(.+)$/
  );

  if (removeCoachMatch) {
    return {
      type: "REMOVE_COACH",
      phoneOrName: removeCoachMatch[1].trim(),
    };
  }

  /*
   * פתיחה / סגירה של קבוצה.
   * "פתח קבוצה א+ד 18:00 – ותיקים" / "סגור קבוצה א+ד 18:00 – ותיקים"
   */
  const createGroupMatch = text.match(
    /^(?:פתח|תפתח|צור|תיצור|הוסף|תוסיף)\s+(?:ה)?קבוצה(?:\s+חדשה)?\s*[:\-–—]?\s*(.+)$/
  );

  if (createGroupMatch) {
    return {
      type: "CREATE_GROUP",
      groupName: createGroupMatch[1].trim(),
    };
  }

  const closeGroupMatch = text.match(
    /^(?:סגור|תסגור|מחק|תמחק)\s+(?:את\s+)?(?:ה)?קבוצה\s*[:\-–—]?\s*(.+)$/
  );

  if (closeGroupMatch) {
    return {
      type: "CLOSE_GROUP",
      groupName: closeGroupMatch[1].trim(),
    };
  }

  /*
   * קישור לניהול הליגה.
   */
  if (
    /^(?:החלף|תחליף|חדש)\s+(?:את\s+)?(?:ה)?קישור\s+(?:ל)?(?:ה)?ליגה$|^קישור\s+ליגה\s+חדש$/.test(
      text
    )
  ) {
    return { type: "ROTATE_LEAGUE_LINK" };
  }

  if (
    /^(?:שלח\s+|תשלח\s+|תן\s+)?(?:לי\s+)?(?:את\s+)?(?:ה)?(?:קישור|לינק|דף)\s+(?:ל)?(?:ה)?(?:ניהול\s+(?:ה)?)?ליגה$/.test(
      text
    )
  ) {
    return { type: "LEAGUE_LINK" };
  }

  if (
    /^(?:שלח\s+|תשלח\s+|תן\s+)?(?:לי\s+)?(?:את\s+)?(?:ה)?(?:קישור|לינק|דף)\s+(?:ל)?(?:ה)?נוכחות$/.test(
      text
    )
  ) {
    return { type: "ATTENDANCE_LINK" };
  }

  const exportCommand =
    parseExportCommand(text);

  if (exportCommand) {
    return exportCommand;
  }

  const naturalCommand =
    parseNaturalManagerCommand(text);

  if (naturalCommand) {
    return naturalCommand;
  }

  const rosterMatch = text.match(
    /^רשימת\s+קבוצה\s+(.+)$/i
  );

  if (rosterMatch) {
    return {
      type: "LIST_GROUP",
      groupName: cleanManagerPart(
        rosterMatch[1]
      ),
    };
  }

  const addMatch = text.match(
    /^הוסף\s+מתאמן\s+([^|]+)\|([^|]+)(?:\|(.+))?$/i
  );

  if (addMatch) {
    return {
      type: "ADD_TRAINEE",
      groupName: cleanManagerPart(addMatch[1]),
      traineeName: cleanManagerPart(addMatch[2]),
      notes: addMatch[3]
        ? cleanManagerPart(addMatch[3])
        : null,
    };
  }

  const removeMatch = text.match(
    /^הסר\s+מתאמן\s+([^|]+)\|(.+)$/i
  );

  if (removeMatch) {
    return {
      type: "REMOVE_TRAINEE",
      groupName: cleanManagerPart(removeMatch[1]),
      traineeName: cleanManagerPart(removeMatch[2]),
    };
  }

  const moveMatch = text.match(
    /^העבר\s+מתאמן\s+([^|]+)\|([^|]+)\|(.+)$/i
  );

  if (moveMatch) {
    return {
      type: "MOVE_TRAINEE",
      fromGroupName: cleanManagerPart(moveMatch[1]),
      toGroupName: cleanManagerPart(moveMatch[2]),
      traineeName: cleanManagerPart(moveMatch[3]),
    };
  }

  /*
   * התחיל כמו פקודת ניהול אבל לא הובן.
   * (\b לא עובד עם עברית ב-JavaScript, ולכן (?:\s|$))
   */
  if (
    new RegExp(
      `^(?:${ADD_VERBS}|${REMOVE_VERBS}|${MOVE_VERBS}|רשימת\\s+קבוצה|תראה\\s+לי|מי\\s+בקבוצה|עצור\\s+בוט|הפעל\\s+בוט)(?:\\s|$)`,
      "i"
    ).test(text)
  ) {
    return {
      type: "INVALID_MANAGER_COMMAND",
    };
  }

  return null;
}

module.exports = {
  cleanStaffText,
  cleanAttendanceName,
  cleanManagerPart,
  parseAttendanceCommand,
  parseNaturalManagerCommand,
  parseBotControlCommand,
  parseExportCommand,
  parseManagerCommand,
  parseRenameCommand,
  splitNameAndGroup,
  splitMove,
};
