const {
  pool,
} = require("./databaseService");

/*
 * =========================================================
 * שמות אנשי צוות
 * =========================================================
 */

const DEFAULT_STAFF_NAMES = {
  "0544832278": "אריק הלמן",
  "0546444516": "ליאל",
  "0533368713": "נובל",
  "0522315590": "אבי",
  "0542284211": "אלונה",
  "0549827437": "אריק מנדלבאום",
  "0549454430": "נועה",
  "0505209997": "אור",
};

/*
 * אפשר להגדיר / לעקוף שמות צוות במשתנה הסביבה STAFF_NAMES:
 * 0501234567:שם,0521234567:שם
 * מומלץ להעביר את כל הרשימה למשתנה הסביבה ולמחוק אותה מהקוד.
 */
function getStaffNames() {
  const names = {
    ...DEFAULT_STAFF_NAMES,
  };

  for (const entry of String(
    process.env.STAFF_NAMES || ""
  ).split(",")) {
    const [phone, ...nameParts] =
      entry.split(":");

    const name = nameParts
      .join(":")
      .trim();

    const normalizedPhone =
      normalizePhone(phone);

    if (normalizedPhone && name) {
      names[normalizedPhone] = name;
    }
  }

  return names;
}

/*
 * =========================================================
 * סניפים
 * =========================================================
 */

const BRANCH_GALI_HADAR =
  "גלי הדר – ראשון לציון";

const BRANCH_BEIT_HASHMONAI =
  "בית חשמונאי";

/*
 * =========================================================
 * ימי השבוע
 * =========================================================
 */

const DAY_MAP = {
  ראשון: 1,
  שני: 2,
  שלישי: 3,
  רביעי: 4,
  חמישי: 5,
  שישי: 6,
  שבת: 7,
};

const DAY_NAMES = {
  1: "ראשון",
  2: "שני",
  3: "שלישי",
  4: "רביעי",
  5: "חמישי",
  6: "שישי",
  7: "שבת",
};

/*
 * =========================================================
 * קבוצות קבועות
 * =========================================================
 */

const GROUPS = {
  GALI_HADAR_BEGINNERS_16:
    "א+ד 16:00 – מתחילים כיתות ג-ו",

  GALI_HADAR_ATUDA:
    "א+ד 17:00 + ג 18:00 – עתודה",

  GALI_HADAR_BEGINNERS_17:
    "א+ד 17:00 – מתחילים כיתות א-ג",

  GALI_HADAR_18:
    "א+ד 18:00 – ו+",

  GALI_HADAR_SENIOR_TEAM:
    "ב+ג+ה 16:30-18:00 – נבחרת בוגרת",

  GALI_HADAR_YOUNG_TEAM:
    "ב+ג+ה 16:30-18:00 – נבחרת צעירה",

  GALI_HADAR_BEGINNERS_BE_18:
    "ב+ה 18:00 – מתחילים כיתות ג-ו",

  HASHMONAI_AD_1530:
    "א+ד 15:30-16:30 – ג-ו מתחילים ומתקדמים",

  HASHMONAI_AD_1645:
    "א+ד 16:45-17:45 – ז-יב",

  HASHMONAI_AD_ATUDA:
    "א+ד 17:45-18:45 – עתודה תחרותי ללא הסעות",

  HASHMONAI_COMPETITIVE:
    "א+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות",

  HASHMONAI_BE_1645:
    "ב+ה 16:45-17:30 – א-ג מתחילים כולל שנה שניה",

  HASHMONAI_BE_ATUDA:
    "ב+ה 17:45-18:45 – עתודה תחרותי ללא הסעות",
};

/*
 * =========================================================
 * טלפונים והרשאות
 * =========================================================
 */

function normalizePhone(phone = "") {
  let value = String(phone)
    .replace(/\D/g, "")
    .trim();

  if (
    value.startsWith("972") &&
    value.length >= 11
  ) {
    value =
      "0" +
      value.slice(3);
  }

  return value;
}

function parsePhoneList(
  value = ""
) {
  return String(value)
    .split(",")
    .map((phone) =>
      normalizePhone(phone)
    )
    .filter(Boolean);
}

/*
 * =========================================================
 * מנהלים
 * =========================================================
 */

function getManagerPhones() {
  const managerPhones =
    parsePhoneList(
      process.env.MANAGER_PHONES ||
        ""
    );

  if (
    managerPhones.length > 0
  ) {
    return [
      ...new Set(
        managerPhones
      ),
    ];
  }

  const oldManagerPhone =
    normalizePhone(
      process.env
        .CLUB_MANAGER_PHONE ||
        ""
    );

  return oldManagerPhone
    ? [oldManagerPhone]
    : [];
}

function isManagerPhone(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  if (!normalizedPhone) {
    return false;
  }

  return getManagerPhones().includes(
    normalizedPhone
  );
}

/*
 * =========================================================
 * מאמנים
 * =========================================================
 */

function getCoachPhones() {
  return parsePhoneList(
    process.env.COACH_PHONES ||
      ""
  );
}

function isCoachPhone(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  if (!normalizedPhone) {
    return false;
  }

  return getCoachPhones().includes(
    normalizedPhone
  );
}

/*
 * =========================================================
 * שמות אנשי צוות
 * =========================================================
 */

function getStaffName(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  const staffNames =
    getStaffNames();

  if (staffNames[normalizedPhone]) {
    return staffNames[normalizedPhone];
  }

  if (isManagerPhone(normalizedPhone)) {
    return "מנהל";
  }

  if (isCoachPhone(normalizedPhone)) {
    return "מאמן";
  }

  return "איש צוות";
}

function getCoachName(phone) {
  return getStaffName(
    phone
  );
}

/*
 * =========================================================
 * תאריך ויום בישראל
 * =========================================================
 */

function getIsraelDateParts(
  now = new Date()
) {
  const dateString =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(now);

  return {
    dateString,
    dayOfWeek:
      dayOfWeekFromDateString(
        dateString
      ),
  };
}

/*
 * 1 = ראשון ... 7 = שבת
 */
function dayOfWeekFromDateString(
  dateString
) {
  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  return (
    new Date(
      Date.UTC(year, month - 1, day, 12)
    ).getUTCDay() + 1
  );
}

function shiftDateString(
  dateString,
  days
) {
  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12)
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function getIsraelDateString(
  offsetDays = 0,
  now = new Date()
) {
  return shiftDateString(
    getIsraelDateParts(now).dateString,
    offsetDays
  );
}

function getIsraelDayOfWeek(
  now = new Date()
) {
  return getIsraelDateParts(now)
    .dayOfWeek;
}

/*
 * תאריך המפגש שעליו מדווחים נוכחות:
 * - "אתמול" (dateOffsetDays = -1) → אתמול.
 * - יום מפורש שאינו היום → המופע האחרון של אותו יום
 *   (עד 6 ימים אחורה). כך דיווח ביום חמישי על "צעירה שלישי"
 *   נשמר לתאריך של יום שלישי ולא לתאריך של היום.
 * - אחרת → היום.
 */
function resolveSessionDate({
  dayOfWeek = null,
  dateOffsetDays = 0,
  now = new Date(),
} = {}) {
  const today =
    getIsraelDateParts(now).dateString;

  if (dateOffsetDays) {
    const sessionDate =
      shiftDateString(
        today,
        dateOffsetDays
      );

    return {
      sessionDate,
      dayOfWeek:
        dayOfWeekFromDateString(
          sessionDate
        ),
    };
  }

  if (dayOfWeek) {
    const todayDayOfWeek =
      dayOfWeekFromDateString(today);

    const daysBack =
      (todayDayOfWeek - dayOfWeek + 7) % 7;

    return {
      sessionDate: shiftDateString(
        today,
        -daysBack
      ),
      dayOfWeek,
    };
  }

  return {
    sessionDate: today,
    dayOfWeek:
      dayOfWeekFromDateString(today),
  };
}

/*
 * =========================================================
 * ניקוי טקסט
 * =========================================================
 */

function cleanValue(
  value = ""
) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(
  name = ""
) {
  return cleanValue(name)
    .replace(/[.,!?;:]/g, "")
    .toLowerCase();
}

function normalizeGroupText(
  value = ""
) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[׳']/g, "")
    .replace(/[״"]/g, "")
    .replace(
      /ראשון\s*לציון/g,
      "ראשון"
    )
    .replace(
      /ראשלצ/g,
      "ראשון"
    )
    .replace(
      /\s*\+\s*/g,
      "+"
    )
    .replace(
      /\s*[–—-]\s*/g,
      "-"
    )
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * =========================================================
 * זיהוי סניף
 * =========================================================
 */

function detectBranchFromText(
  value = ""
) {
  const text =
    normalizeGroupText(
      value
    );

  if (
    text.includes(
      "בית חשמונאי"
    ) ||
    text.includes(
      "חשמונאי"
    )
  ) {
    return BRANCH_BEIT_HASHMONAI;
  }

  if (
    text.includes(
      "גלי הדר"
    ) ||
    text.includes(
      "ראשון לציון"
    )
  ) {
    return BRANCH_GALI_HADAR;
  }

  return null;
}

function removeBranchWords(
  value = ""
) {
  return normalizeGroupText(
    value
  )
    .replace(
      /(?:ב)?בית חשמונאי/g,
      " "
    )
    .replace(
      /(?:ב)?חשמונאי/g,
      " "
    )
    .replace(
      /(?:ב)?גלי הדר/g,
      " "
    )
    .replace(
      /(?:ב)?סניף\s+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * =========================================================
 * זיהוי יום מתוך טקסט
 * =========================================================
 */

function getDayOfWeekFromText(
  value = ""
) {
  /*
   * "ראשון לציון" הוא שם עיר ולא יום ראשון.
   */
  const text = cleanValue(value)
    .toLowerCase()
    .replace(/[׳'״"]/g, "")
    .replace(/ראשון\s*לציון|ראשלצ/g, " ");

  for (
    const [
      dayName,
      dayNumber,
    ] of Object.entries(
      DAY_MAP
    )
  ) {
    /*
     * מילה שלמה בלבד ("שניה" אינה "שני"),
     * עם ב/ל/ה או "יום" לפניה.
     */
    const pattern = new RegExp(
      `(?:^|[\\s,.(+\\-–])(?:ביום\\s+|יום\\s+)?[בלה]?${dayName}(?=$|[\\s,.)+\\-–])`
    );

    if (pattern.test(text)) {
      return dayNumber;
    }
  }

  return null;
}

/*
 * =========================================================
 * זיהוי יום + שעה בגלי הדר
 * =========================================================
 */

function normalizeHour(
  hour,
  minute = "00"
) {
  const h =
    String(hour).padStart(
      2,
      "0"
    );

  const m =
    String(
      minute || "00"
    ).padStart(
      2,
      "0"
    );

  return `${h}:${m}`;
}

function parseGaliHadarSlot(
  value = ""
) {
  const text =
    cleanValue(
      value
    );

  if (!text) {
    return null;
  }

  if (
    !/גלי\s*הדר/i.test(
      text
    )
  ) {
    return null;
  }

  const dayOfWeek =
    getDayOfWeekFromText(
      text
    );

  if (!dayOfWeek) {
    return null;
  }

  const timeMatch =
    text.match(
      /\b(\d{1,2})(?::(\d{2}))?\b/
    );

  if (!timeMatch) {
    return null;
  }

  const hour =
    Number(
      timeMatch[1]
    );

  const minute =
    timeMatch[2] ||
    "00";

  if (
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }

  const startTime =
    normalizeHour(
      hour,
      minute
    );

  return {
    branch:
      BRANCH_GALI_HADAR,

    dayOfWeek,

    dayName:
      DAY_NAMES[
        dayOfWeek
      ],

    startTime,

    displayName:
      `${DAY_NAMES[dayOfWeek]} ${startTime}`,
  };
}

/*
 * =========================================================
 * זיהוי נבחרת
 * =========================================================
 *
 * מאפשר:
 * בוגרת
 * צעירה
 * נבחרת בוגרת
 * נבחרת צעירה
 * בוגרת שלישי
 * צעירה חמישי
 * =========================================================
 */

function getTeamLabelFromGroupName(
  groupName = ""
) {
  const text =
    normalizeGroupText(
      groupName
    );

  const hasSenior =
    /(?:^|\s)(?:נבחרת\s+)?בוגרת(?:\s|$)/.test(
      text
    );

  const hasYoung =
    /(?:^|\s)(?:נבחרת\s+)?צעירה(?:\s|$)/.test(
      text
    );

  if (
    hasSenior &&
    !hasYoung
  ) {
    return "בוגרת";
  }

  if (
    hasYoung &&
    !hasSenior
  ) {
    return "צעירה";
  }

  return null;
}

/*
 * =========================================================
 * זיהוי מתאמן גמיש
 * =========================================================
 */

function isFlexibleTrainee(
  trainee
) {
  const notes =
    cleanValue(
      trainee?.notes || ""
    ).toLowerCase();

  if (!notes) {
    return false;
  }

  return (
    notes.includes(
      "ראשון או רביעי"
    ) ||
    notes.includes(
      "גמיש"
    )
  );
}

/*
 * =========================================================
 * כינויים לקבוצות הקבועות
 * =========================================================
 */

const GROUP_ALIASES = [
  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_ATUDA,

    aliases: [
      "עתודה גלי הדר",
      "גלי הדר עתודה",
    ],
  },

  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_SENIOR_TEAM,

    aliases: [
      "נבחרת בוגרת",
      "נבחרת בוגרת גלי הדר",
    ],
  },

  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_YOUNG_TEAM,

    aliases: [
      "נבחרת צעירה",
      "נבחרת צעירה גלי הדר",
    ],
  },

  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_BEGINNERS_16,

    aliases: [
      "א+ד 16:00",
      "א ד 16:00",
      "א+ד 16",
    ],
  },

  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_18,

    aliases: [
      "א+ד 18:00",
      "א ד 18:00",
      "א+ד 18",
    ],
  },

  {
    branch:
      BRANCH_GALI_HADAR,

    target:
      GROUPS.GALI_HADAR_BEGINNERS_BE_18,

    aliases: [
      "ב+ה 18:00",
      "ב ה 18:00",
      "ב+ה 18",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_AD_1530,

    aliases: [
      "א+ד 15:30",
      "א ד 15:30",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_AD_1645,

    aliases: [
      "א+ד 16:45",
      "א ד 16:45",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_AD_ATUDA,

    aliases: [
      "א+ד 17:45",
      "א ד 17:45",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_COMPETITIVE,

    aliases: [
      "א+ד 18:45",
      "א ד 18:45",
      "ב+ה 19:30",
      "ב ה 19:30",
      "תחרותי בית חשמונאי",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_BE_1645,

    aliases: [
      "ב+ה 16:45",
      "ב ה 16:45",
    ],
  },

  {
    branch:
      BRANCH_BEIT_HASHMONAI,

    target:
      GROUPS.HASHMONAI_BE_ATUDA,

    aliases: [
      "ב+ה 17:45",
      "ב ה 17:45",
    ],
  },
];

/*
 * =========================================================
 * קבוצות פעילות
 * =========================================================
 */

/*
 * קבוצות פנימיות שהמערכת יוצרת לדיווח נוכחות
 * ("גלי הדר | שלישי 16:30 | צעירה") — לא מוצגות למנהלים.
 */
function isInternalAttendanceGroup(
  name = ""
) {
  return /^גלי הדר \|/.test(
    String(name)
  );
}

async function getActiveGroups({
  includeInternal = false,
} = {}) {
  const result =
    await pool.query(
      `
        SELECT
          id,
          name,
          branch,
          active
        FROM training_groups
        WHERE active = TRUE
        ORDER BY
          branch,
          name
      `
    );

  return result.rows.filter(
    (group) =>
      includeInternal ||
      !isInternalAttendanceGroup(
        group.name
      )
  );
}

function getAliasScore(
  input,
  group
) {
  const normalizedInput =
    normalizeGroupText(
      input
    );

  const inputWithoutBranch =
    removeBranchWords(
      input
    );

  let bestScore = 0;

  for (
    const aliasEntry of
      GROUP_ALIASES
  ) {
    if (
      normalizeGroupText(
        aliasEntry.target
      ) !==
      normalizeGroupText(
        group.name
      )
    ) {
      continue;
    }

    if (
      aliasEntry.branch &&
      group.branch !==
        aliasEntry.branch
    ) {
      continue;
    }

    for (
      const alias of
        aliasEntry.aliases
    ) {
      const normalizedAlias =
        normalizeGroupText(
          alias
        );

      if (
        normalizedAlias ===
          normalizedInput ||
        normalizedAlias ===
          inputWithoutBranch
      ) {
        bestScore =
          Math.max(
            bestScore,
            95
          );
      }
    }
  }

  return bestScore;
}

function getGroupMatchScore(
  input,
  group
) {
  const requestedBranch =
    detectBranchFromText(
      input
    );

  if (
    requestedBranch &&
    group.branch !==
      requestedBranch
  ) {
    return 0;
  }

  const normalizedInput =
    normalizeGroupText(
      input
    );

  const inputWithoutBranch =
    removeBranchWords(
      input
    );

  const normalizedGroup =
    normalizeGroupText(
      group.name
    );

  if (
    !normalizedInput ||
    !normalizedGroup
  ) {
    return 0;
  }

  if (
    normalizedInput ===
      normalizedGroup ||
    inputWithoutBranch ===
      normalizedGroup
  ) {
    return 100;
  }

  const aliasScore =
    getAliasScore(
      input,
      group
    );

  if (
    aliasScore > 0
  ) {
    return aliasScore;
  }

  if (
    requestedBranch &&
    inputWithoutBranch &&
    normalizedGroup.includes(
      inputWithoutBranch
    )
  ) {
    return 80;
  }

  if (
    inputWithoutBranch &&
    normalizedGroup.includes(
      inputWithoutBranch
    )
  ) {
    return 70;
  }

  return 0;
}

function formatGroupChoice(
  group
) {
  if (!group.branch) {
    return `• ${group.name}`;
  }

  return (
    `• ${group.name}` +
    ` — ${group.branch}`
  );
}

async function resolveActiveGroup(
  groupName
) {
  const cleanGroupName =
    cleanValue(
      groupName
    );

  if (!cleanGroupName) {
    return {
      success: false,
      code:
        "EMPTY_GROUP_NAME",
      message:
        "❌ חסר שם הקבוצה.",
      matches: [],
    };
  }

  const groups =
    await getActiveGroups();

  const matches =
    groups
      .map((group) => ({
        group,

        score:
          getGroupMatchScore(
            cleanGroupName,
            group
          ),
      }))
      .filter(
        (item) =>
          item.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (
    matches.length === 0
  ) {
    return {
      success: false,

      code:
        "GROUP_NOT_FOUND",

      message:
        `❌ לא מצאתי קבוצה שמתאימה ל-"${cleanGroupName}".`,

      matches: [],
    };
  }

  const bestScore =
    matches[0].score;

  const bestMatches =
    matches.filter(
      (item) =>
        item.score ===
        bestScore
    );

  if (
    bestMatches.length > 1
  ) {
    return {
      success: false,

      code:
        "AMBIGUOUS_GROUP",

      matches:
        bestMatches.map(
          (item) =>
            item.group
        ),

      message: [
        `⚠️ מצאתי כמה קבוצות שמתאימות ל-"${cleanGroupName}".`,
        "",
        "לאיזו קבוצה התכוונת?",
        ...bestMatches.map(
          (item) =>
            formatGroupChoice(
              item.group
            )
        ),
      ].join("\n"),
    };
  }

  return {
    success: true,

    group:
      bestMatches[0].group,

    matches: [
      bestMatches[0].group,
    ],
  };
}

async function getActiveGroupByName(
  groupName
) {
  const resolution =
    await resolveActiveGroup(
      groupName
    );

  return resolution.success
    ? resolution.group
    : null;
}

/*
 * =========================================================
 * מתאמנים
 * =========================================================
 */

async function getActiveTraineesByGroupId(
  groupId,
  db = pool
) {
  const result =
    await db.query(
      `
        SELECT
          id,
          name,
          notes,
          active
        FROM trainees
        WHERE
          group_id = $1
          AND active = TRUE
        ORDER BY name
      `,
      [
        groupId,
      ]
    );

  return result.rows;
}

async function getAllTraineesByGroupId(
  groupId,
  db = pool
) {
  const result =
    await db.query(
      `
        SELECT
          id,
          name,
          notes,
          active
        FROM trainees
        WHERE group_id = $1
        ORDER BY name
      `,
      [
        groupId,
      ]
    );

  return result.rows;
}

/*
 * =========================================================
 * התאמת שם מתאמן
 * =========================================================
 */

function findMatchingTrainee(
  inputName,
  trainees
) {
  const normalizedInput =
    normalizeName(
      inputName
    );

  if (!normalizedInput) {
    return null;
  }

  const exactMatch =
    trainees.find(
      (trainee) =>
        normalizeName(
          trainee.name
        ) ===
        normalizedInput
    );

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches =
    trainees.filter(
      (trainee) => {
        const traineeParts =
          normalizeName(
            trainee.name
          )
            .split(" ")
            .filter(Boolean);

        return traineeParts.includes(
          normalizedInput
        );
      }
    );

  if (
    partialMatches.length === 1
  ) {
    return partialMatches[0];
  }

  return null;
}

/*
 * =========================================================
 * גלי הדר – רשימה לפי יום ושעה
 * =========================================================
 */

async function getGaliHadarSlotRoster(
  slot
) {
  const result =
    await pool.query(
      `
        SELECT DISTINCT
          trainee_name AS name,
          group_label,
          notes
        FROM trainee_training_slots
        WHERE
          branch = $1
          AND day_of_week = $2
          AND start_time = $3::TIME
          AND active = TRUE
        ORDER BY trainee_name
      `,
      [
        BRANCH_GALI_HADAR,
        slot.dayOfWeek,
        slot.startTime,
      ]
    );

  return result.rows;
}

/*
 * =========================================================
 * גלי הדר – נבחרת לפי היום
 * =========================================================
 */

async function getGaliHadarTeamRosterForDay({
  teamLabel,
  dayOfWeek,
}) {
  const result =
    await pool.query(
      `
        SELECT DISTINCT
          trainee_name AS name,
          group_label,
          notes
        FROM trainee_training_slots
        WHERE
          branch = $1
          AND day_of_week = $2
          AND start_time = '16:30'::TIME
          AND group_label = $3
          AND active = TRUE
        ORDER BY trainee_name
      `,
      [
        BRANCH_GALI_HADAR,
        dayOfWeek,
        teamLabel,
      ]
    );

  return result.rows;
}

/*
 * =========================================================
 * קבוצת נוכחות פנימית למפגש גלי הדר
 * =========================================================
 */

function buildGaliHadarAttendanceGroupName(
  slot
) {
  return (
    `גלי הדר | ` +
    `${slot.dayName} ` +
    `${slot.startTime}`
  );
}

async function ensureGaliHadarAttendanceGroup(
  slot
) {
  const groupName =
    buildGaliHadarAttendanceGroupName(
      slot
    );

  const groupResult =
    await pool.query(
      `
        INSERT INTO training_groups (
          name,
          branch,
          active
        )
        VALUES (
          $1,
          $2,
          TRUE
        )
        ON CONFLICT (name)
        DO UPDATE SET
          branch = EXCLUDED.branch,
          active = TRUE,
          updated_at = NOW()
        RETURNING
          id,
          name,
          branch,
          active
      `,
      [
        groupName,
        BRANCH_GALI_HADAR,
      ]
    );

  const group =
    groupResult.rows[0];

  const slotRoster =
    await getGaliHadarSlotRoster(
      slot
    );

  for (
    const slotTrainee of
      slotRoster
  ) {
    const noteParts =
      [];

    if (
      slotTrainee.group_label
    ) {
      noteParts.push(
        slotTrainee.group_label
      );
    }

    if (
      slotTrainee.notes
    ) {
      noteParts.push(
        slotTrainee.notes
      );
    }

    const notes =
      noteParts.length > 0
        ? noteParts.join(
            ", "
          )
        : null;

    await pool.query(
      `
        INSERT INTO trainees (
          group_id,
          name,
          notes,
          active
        )
        VALUES (
          $1,
          $2,
          $3,
          TRUE
        )
        ON CONFLICT (
          group_id,
          name
        )
        DO UPDATE SET
          notes = EXCLUDED.notes,
          active = TRUE,
          updated_at = NOW()
      `,
      [
        group.id,
        slotTrainee.name,
        notes,
      ]
    );
  }

  const activeNames =
    slotRoster.map(
      (trainee) =>
        trainee.name
    );

  if (
    activeNames.length > 0
  ) {
    await pool.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE
          group_id = $1
          AND active = TRUE
          AND NOT (
            name = ANY(
              $2::TEXT[]
            )
          )
      `,
      [
        group.id,
        activeNames,
      ]
    );
  } else {
    await pool.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE
          group_id = $1
          AND active = TRUE
      `,
      [
        group.id,
      ]
    );
  }

  return group;
}

/*
 * =========================================================
 * קבוצת נוכחות פנימית לנבחרת לפי היום
 * =========================================================
 */

async function ensureGaliHadarTeamAttendanceGroup({
  teamLabel,
  dayOfWeek,
}) {
  const dayName =
    DAY_NAMES[
      dayOfWeek
    ];

  const groupName =
    `גלי הדר | ${dayName} 16:30 | ${teamLabel}`;

  const groupResult =
    await pool.query(
      `
        INSERT INTO training_groups (
          name,
          branch,
          active
        )
        VALUES (
          $1,
          $2,
          TRUE
        )
        ON CONFLICT (name)
        DO UPDATE SET
          branch = EXCLUDED.branch,
          active = TRUE,
          updated_at = NOW()
        RETURNING
          id,
          name,
          branch,
          active
      `,
      [
        groupName,
        BRANCH_GALI_HADAR,
      ]
    );

  const group =
    groupResult.rows[0];

  const roster =
    await getGaliHadarTeamRosterForDay({
      teamLabel,
      dayOfWeek,
    });

  for (
    const rosterTrainee of
      roster
  ) {
    await pool.query(
      `
        INSERT INTO trainees (
          group_id,
          name,
          notes,
          active
        )
        VALUES (
          $1,
          $2,
          $3,
          TRUE
        )
        ON CONFLICT (
          group_id,
          name
        )
        DO UPDATE SET
          notes = EXCLUDED.notes,
          active = TRUE,
          updated_at = NOW()
      `,
      [
        group.id,
        rosterTrainee.name,
        rosterTrainee.notes,
      ]
    );
  }

  const activeNames =
    roster.map(
      (trainee) =>
        trainee.name
    );

  if (
    activeNames.length > 0
  ) {
    await pool.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE
          group_id = $1
          AND active = TRUE
          AND NOT (
            name = ANY(
              $2::TEXT[]
            )
          )
      `,
      [
        group.id,
        activeNames,
      ]
    );
  } else {
    await pool.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE
          group_id = $1
          AND active = TRUE
      `,
      [
        group.id,
      ]
    );
  }

  return {
    group,
    dayOfWeek,
    dayName,
    teamLabel,
  };
}

/*
 * =========================================================
 * רשימת קבוצה
 * =========================================================
 */

/*
 * =========================================================
 * יעדי רשימה: קבוצה רגילה / נבחרת / מפגש גלי הדר
 * =========================================================
 *
 * רשימות הנבחרות ומפגשי גלי הדר (יום + שעה) נשמרות בטבלת
 * trainee_training_slots — זו הטבלה שממנה נבנית הנוכחות.
 * לכן גם הוספה / הסרה / העברה של מנהל נכתבת לשם,
 * ושינוי של מנהל לא נדרס בדיווח הנוכחות הבא.
 *
 * קבוצות רגילות (למשל בית חשמונאי) נשמרות בטבלת trainees.
 */

const TEAM_START_TIME = "16:30";
const DEFAULT_TEAM_DAYS = [2, 3, 5];
const MANUAL_SLOT_LABEL = "כללי";

function parseSlotsTarget(
  groupName = ""
) {
  const slot =
    parseGaliHadarSlot(groupName);

  if (slot) {
    return {
      type: "slot",
      slot,
      displayName: `גלי הדר – ${slot.displayName}`,
    };
  }

  const teamLabel =
    getTeamLabelFromGroupName(groupName);

  if (teamLabel) {
    const dayOfWeek =
      getDayOfWeekFromText(groupName);

    return {
      type: "team",
      teamLabel,
      dayOfWeek,
      displayName: dayOfWeek
        ? `נבחרת ${teamLabel} (${DAY_NAMES[dayOfWeek]})`
        : `נבחרת ${teamLabel}`,
    };
  }

  return null;
}

async function getTeamDays(
  teamLabel,
  db = pool
) {
  const result = await db.query(
    `
      SELECT DISTINCT day_of_week
      FROM trainee_training_slots
      WHERE
        branch = $1
        AND group_label = $2
        AND start_time = $3::TIME
        AND active = TRUE
      ORDER BY day_of_week
    `,
    [
      BRANCH_GALI_HADAR,
      teamLabel,
      TEAM_START_TIME,
    ]
  );

  const days = result.rows.map(
    (row) => Number(row.day_of_week)
  );

  return days.length > 0
    ? days
    : DEFAULT_TEAM_DAYS;
}

async function getSlotsRows(
  target,
  { activeOnly = true } = {},
  db = pool
) {
  const params = [BRANCH_GALI_HADAR];
  const where = ["branch = $1"];

  if (target.type === "team") {
    params.push(target.teamLabel);
    where.push(`group_label = $${params.length}`);

    params.push(TEAM_START_TIME);
    where.push(`start_time = $${params.length}::TIME`);

    if (target.dayOfWeek) {
      params.push(target.dayOfWeek);
      where.push(`day_of_week = $${params.length}`);
    }
  } else {
    params.push(target.slot.dayOfWeek);
    where.push(`day_of_week = $${params.length}`);

    params.push(target.slot.startTime);
    where.push(`start_time = $${params.length}::TIME`);
  }

  if (activeOnly) {
    where.push("active = TRUE");
  }

  const result = await db.query(
    `
      SELECT
        id,
        trainee_name AS name,
        group_label,
        day_of_week,
        notes,
        active
      FROM trainee_training_slots
      WHERE ${where.join(" AND ")}
      ORDER BY trainee_name, day_of_week
    `,
    params
  );

  return result.rows;
}

/*
 * מאחד כמה שורות שיבוץ (ימים שונים) למתאמן אחד.
 */
function groupRowsByName(rows = []) {
  const byName = new Map();

  for (const row of rows) {
    if (!byName.has(row.name)) {
      byName.set(row.name, {
        name: row.name,
        notes: row.notes,
        rows: [],
      });
    }

    byName.get(row.name).rows.push(row);
  }

  return [...byName.values()];
}

function formatDays(days = []) {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => DAY_NAMES[day])
    .join(", ");
}

async function getTargetDays(target, db) {
  if (target.type === "slot") {
    return [target.slot.dayOfWeek];
  }

  return target.dayOfWeek
    ? [target.dayOfWeek]
    : getTeamDays(target.teamLabel, db);
}

async function getSlotLabel(target, db) {
  if (target.type === "team") {
    return target.teamLabel;
  }

  const rows = await getSlotsRows(
    target,
    { activeOnly: true },
    db
  );

  const labels = [
    ...new Set(
      rows
        .map((row) => row.group_label)
        .filter(Boolean)
    ),
  ];

  return labels.length === 1
    ? labels[0]
    : MANUAL_SLOT_LABEL;
}

/*
 * ממשק אחיד לקבוצה רגילה ולרשימת שיבוצים.
 */
async function resolveRosterScope(
  groupName
) {
  const target =
    parseSlotsTarget(groupName);

  if (target) {
    return {
      success: true,
      scope: {
        kind: "slots",
        key: [
          "slots",
          target.type,
          target.teamLabel || "",
          target.dayOfWeek ||
            target.slot?.dayOfWeek ||
            "",
          target.slot?.startTime || "",
        ].join(":"),
        target,
        group: {
          name: target.displayName,
          branch: BRANCH_GALI_HADAR,
        },
      },
    };
  }

  const resolution =
    await resolveActiveGroup(groupName);

  if (!resolution.success) {
    return {
      success: false,
      code: resolution.code,
      message: resolution.message,
      matches: resolution.matches || [],
    };
  }

  return {
    success: true,
    scope: {
      kind: "group",
      key: `group:${resolution.group.id}`,
      group: resolution.group,
    },
  };
}

function scopeLabel(scope) {
  return scope.kind === "group"
    ? `קבוצת ${scope.group.name}`
    : scope.group.name;
}

async function findActiveInScope(
  scope,
  traineeName,
  db = pool
) {
  if (scope.kind === "group") {
    return findMatchingTrainee(
      traineeName,
      await getActiveTraineesByGroupId(
        scope.group.id,
        db
      )
    );
  }

  return findMatchingTrainee(
    traineeName,
    groupRowsByName(
      await getSlotsRows(
        scope.target,
        { activeOnly: true },
        db
      )
    )
  );
}

async function addToScope(
  scope,
  traineeName,
  notes,
  db = pool
) {
  if (scope.kind === "group") {
    const existing = findMatchingTrainee(
      traineeName,
      await getAllTraineesByGroupId(
        scope.group.id,
        db
      )
    );

    if (existing && existing.active) {
      return {
        success: false,
        code: "TRAINEE_ALREADY_EXISTS",
        group: scope.group,
        trainee: existing,
        message: `⚠️ ${existing.name} כבר נמצא/ת ב${scopeLabel(scope)}.`,
      };
    }

    if (existing) {
      const result = await db.query(
        `
          UPDATE trainees
          SET
            active = TRUE,
            notes =
              CASE
                WHEN $2::TEXT IS NOT NULL
                  THEN $2
                ELSE notes
              END,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            group_id,
            name,
            notes,
            active
        `,
        [existing.id, notes]
      );

      return {
        success: true,
        code: "TRAINEE_REACTIVATED",
        group: scope.group,
        trainee: result.rows[0],
        message: `✅ ${result.rows[0].name} הוחזר/ה ל${scopeLabel(scope)}.`,
      };
    }

    const result = await db.query(
      `
        INSERT INTO trainees (
          group_id,
          name,
          notes,
          active
        )
        VALUES ($1, $2, $3, TRUE)
        RETURNING
          id,
          group_id,
          name,
          notes,
          active
      `,
      [scope.group.id, traineeName, notes]
    );

    return {
      success: true,
      code: "TRAINEE_ADDED",
      group: scope.group,
      trainee: result.rows[0],
      message: `✅ ${result.rows[0].name} נוסף/ה ל${scopeLabel(scope)}.`,
    };
  }

  const { target } = scope;

  const days =
    await getTargetDays(target, db);

  const existingActive = findMatchingTrainee(
    traineeName,
    groupRowsByName(
      await getSlotsRows(
        target,
        { activeOnly: true },
        db
      )
    )
  );

  /*
   * אם המתאמן היה פעם ברשימה — משתמשים בשם המלא שלו.
   */
  const previous = findMatchingTrainee(
    traineeName,
    groupRowsByName(
      await getSlotsRows(
        target,
        { activeOnly: false },
        db
      )
    )
  );

  const canonicalName =
    existingActive?.name ||
    previous?.name ||
    traineeName;

  const activeDays = new Set(
    (existingActive?.rows || []).map(
      (row) => Number(row.day_of_week)
    )
  );

  const missingDays = days.filter(
    (day) => !activeDays.has(day)
  );

  if (missingDays.length === 0) {
    return {
      success: false,
      code: "TRAINEE_ALREADY_EXISTS",
      group: scope.group,
      trainee: { name: canonicalName },
      message: `⚠️ ${canonicalName} כבר נמצא/ת ב${scopeLabel(scope)}.`,
    };
  }

  const label =
    await getSlotLabel(target, db);

  const startTime =
    target.type === "slot"
      ? target.slot.startTime
      : TEAM_START_TIME;

  for (const day of missingDays) {
    await db.query(
      `
        INSERT INTO trainee_training_slots (
          trainee_name,
          branch,
          group_label,
          day_of_week,
          start_time,
          notes,
          active
        )
        VALUES ($1, $2, $3, $4, $5::TIME, $6, TRUE)
        ON CONFLICT (
          trainee_name,
          branch,
          day_of_week,
          start_time,
          group_label
        )
        DO UPDATE SET
          active = TRUE,
          notes = COALESCE(
            EXCLUDED.notes,
            trainee_training_slots.notes
          ),
          updated_at = NOW()
      `,
      [
        canonicalName,
        BRANCH_GALI_HADAR,
        label,
        day,
        startTime,
        notes,
      ]
    );
  }

  const daysText =
    target.type === "team" &&
    !target.dayOfWeek
      ? ` (ימים: ${formatDays(missingDays)})`
      : "";

  return {
    success: true,
    code: existingActive
      ? "TRAINEE_DAYS_ADDED"
      : "TRAINEE_ADDED",
    group: scope.group,
    trainee: {
      name: canonicalName,
      notes,
    },
    message: `✅ ${canonicalName} נוסף/ה ל${scopeLabel(scope)}${daysText}.`,
  };
}

async function removeFromScope(
  scope,
  matched,
  db = pool
) {
  if (scope.kind === "group") {
    const result = await db.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          group_id,
          name,
          notes,
          active
      `,
      [matched.id]
    );

    return result.rows[0];
  }

  for (const row of matched.rows) {
    await db.query(
      `
        UPDATE trainee_training_slots
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );
  }

  return {
    name: matched.name,
    notes: matched.notes,
    days: matched.rows.map((row) =>
      Number(row.day_of_week)
    ),
  };
}

/*
 * =========================================================
 * רשימת קבוצה
 * =========================================================
 */

async function getGroupRoster(
  groupName
) {
  const resolution =
    await resolveRosterScope(groupName);

  if (!resolution.success) {
    return {
      success: false,
      code: resolution.code,
      message: resolution.message,
      matches: resolution.matches,
    };
  }

  const { scope } = resolution;

  if (scope.kind === "group") {
    const trainees =
      await getActiveTraineesByGroupId(
        scope.group.id
      );

    return {
      success: true,
      group: scope.group,
      trainees,
      total: trainees.length,
    };
  }

  const people = groupRowsByName(
    await getSlotsRows(scope.target, {
      activeOnly: true,
    })
  );

  const showDays =
    scope.target.type === "team" &&
    !scope.target.dayOfWeek;

  const trainees = people.map(
    (person) => ({
      name: person.name,
      notes: showDays
        ? formatDays(
            person.rows.map((row) =>
              Number(row.day_of_week)
            )
          )
        : person.notes,
    })
  );

  return {
    success: true,
    group: scope.group,
    trainees,
    total: trainees.length,
    slot: scope.target.slot || null,
  };
}

/*
 * =========================================================
 * הוספת מתאמן
 * =========================================================
 */

async function addTrainee({
  groupName,
  traineeName,
  notes = null,
}) {
  const cleanName =
    cleanValue(traineeName);

  const cleanNotes =
    cleanValue(notes || "") || null;

  if (!cleanName) {
    return {
      success: false,
      code: "INVALID_NAME",
      message: "❌ חסר שם המתאמן.",
    };
  }

  const resolution =
    await resolveRosterScope(groupName);

  if (!resolution.success) {
    return {
      success: false,
      code: resolution.code,
      message: resolution.message,
      matches: resolution.matches,
    };
  }

  return addToScope(
    resolution.scope,
    cleanName,
    cleanNotes
  );
}

/*
 * =========================================================
 * הסרת מתאמן
 * =========================================================
 */

async function removeTrainee({
  groupName,
  traineeName,
}) {
  const cleanName =
    cleanValue(traineeName);

  if (!cleanName) {
    return {
      success: false,
      code: "INVALID_NAME",
      message: "❌ חסר שם המתאמן.",
    };
  }

  const resolution =
    await resolveRosterScope(groupName);

  if (!resolution.success) {
    return {
      success: false,
      code: resolution.code,
      message: resolution.message,
      matches: resolution.matches,
    };
  }

  const { scope } = resolution;

  const matched =
    await findActiveInScope(
      scope,
      cleanName
    );

  if (!matched) {
    return {
      success: false,
      code: "TRAINEE_NOT_FOUND",
      group: scope.group,
      message: `❌ לא מצאתי מתאמן פעיל בשם "${cleanName}" ב${scopeLabel(scope)}.`,
    };
  }

  const removed = await removeFromScope(
    scope,
    matched
  );

  return {
    success: true,
    code: "TRAINEE_REMOVED",
    group: scope.group,
    trainee: removed,
    message: `✅ ${removed.name} הוסר/ה מ${scopeLabel(scope)}.`,
  };
}

/*
 * =========================================================
 * העברת מתאמן
 * =========================================================
 */

async function moveTrainee({
  fromGroupName,
  toGroupName,
  traineeName,
}) {
  const cleanName =
    cleanValue(traineeName);

  if (!cleanName) {
    return {
      success: false,
      code: "INVALID_NAME",
      message: "❌ חסר שם המתאמן.",
    };
  }

  const from =
    await resolveRosterScope(fromGroupName);

  if (!from.success) {
    return {
      success: false,
      code: from.code,
      message: from.message,
      matches: from.matches,
    };
  }

  const to =
    await resolveRosterScope(toGroupName);

  if (!to.success) {
    return {
      success: false,
      code: to.code,
      message: to.message,
      matches: to.matches,
    };
  }

  if (from.scope.key === to.scope.key) {
    return {
      success: false,
      code: "SAME_GROUP",
      message:
        "⚠️ קבוצת המקור וקבוצת היעד זהות.",
    };
  }

  const source = await findActiveInScope(
    from.scope,
    cleanName
  );

  if (!source) {
    return {
      success: false,
      code: "TRAINEE_NOT_FOUND",
      message: `❌ לא מצאתי את "${cleanName}" ב${scopeLabel(from.scope)}.`,
    };
  }

  const client = await pool.connect();
  let finished = false;

  try {
    await client.query("BEGIN");

    await removeFromScope(
      from.scope,
      source,
      client
    );

    const added = await addToScope(
      to.scope,
      source.name,
      source.notes || null,
      client
    );

    if (!added.success) {
      await client.query("ROLLBACK");
      finished = true;

      return {
        success: false,
        code: "TRAINEE_ALREADY_IN_TARGET",
        message: added.message,
      };
    }

    await client.query("COMMIT");
    finished = true;

    return {
      success: true,
      code: "TRAINEE_MOVED",
      fromGroup: from.scope.group,
      toGroup: to.scope.group,
      trainee: added.trainee,
      message: `✅ ${source.name} הועבר/ה מ${scopeLabel(from.scope)} ל${scopeLabel(to.scope)}.`,
    };
  } catch (error) {
    if (!finished) {
      await client.query("ROLLBACK");
    }

    throw error;
  } finally {
    client.release();
  }
}

/*
 * =========================================================
 * מפגש נוכחות
 * =========================================================
 */

async function getOrCreateAttendanceSession({
  groupId,
  sessionDate,
  submittedBy,
}) {
  const result =
    await pool.query(
      `
        INSERT INTO attendance_sessions (
          group_id,
          session_date,
          submitted_by
        )
        VALUES (
          $1,
          $2,
          $3
        )
        ON CONFLICT (
          group_id,
          session_date
        )
        DO UPDATE SET
          submitted_by =
            EXCLUDED.submitted_by,
          updated_at = NOW()
        RETURNING
          id,
          group_id,
          session_date,
          submitted_by
      `,
      [
        groupId,
        sessionDate,
        submittedBy,
      ]
    );

  return result.rows[0];
}

/*
 * =========================================================
 * שמירת נוכחות
 * =========================================================
 */

async function saveAttendanceRecords({
  sessionId,
  trainees,
  presentTraineeIds,
}) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `
        DELETE FROM attendance_records
        WHERE session_id = $1
      `,
      [
        sessionId,
      ]
    );

    for (
      const trainee of
        trainees
    ) {
      const status =
        presentTraineeIds.has(
          trainee.id
        )
          ? "present"
          : "absent";

      await client.query(
        `
          INSERT INTO attendance_records (
            session_id,
            trainee_id,
            status
          )
          VALUES (
            $1,
            $2,
            $3
          )
          ON CONFLICT (
            session_id,
            trainee_id
          )
          DO UPDATE SET
            status =
              EXCLUDED.status,
            updated_at = NOW()
        `,
        [
          sessionId,
          trainee.id,
          status,
        ]
      );
    }

    await client.query(
      "COMMIT"
    );
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

/*
 * =========================================================
 * דיווח נוכחות
 * =========================================================
 */

async function submitAttendance({
  groupName,
  presentNames,
  submittedByPhone,
  dateOffsetDays = 0,
}) {
  let group;
  let trainees;
  let slot = null;
  let teamContext = null;
  let sessionInfo = null;

  /*
   * יום + שעה מפורשים של גלי הדר.
   */
  slot =
    parseGaliHadarSlot(
      groupName
    );

  /*
   * נבחרת בוגרת / צעירה.
   *
   * אם נכתב יום מפורש:
   * "צעירה שלישי"
   * "בוגרת חמישי"
   *
   * משתמשים ביום שנכתב.
   *
   * אם נכתב רק:
   * "צעירה"
   * "בוגרת"
   *
   * משתמשים ביום הנוכחי בישראל.
   */
  const teamLabel =
    getTeamLabelFromGroupName(
      groupName
    );

  if (
    !slot &&
    teamLabel
  ) {
    const requestedDayOfWeek =
      getDayOfWeekFromText(
        groupName
      );

    sessionInfo =
      resolveSessionDate({
        dayOfWeek:
          requestedDayOfWeek,
        dateOffsetDays,
      });

    const dayOfWeek =
      sessionInfo.dayOfWeek;

    if (!dayOfWeek) {
      return {
        success: false,

        code:
          "DAY_NOT_FOUND",

        message:
          "❌ לא הצלחתי לזהות את יום האימון.",
      };
    }

    teamContext =
      await ensureGaliHadarTeamAttendanceGroup({
        teamLabel,
        dayOfWeek,
      });

    group =
      teamContext.group;

    trainees =
      await getActiveTraineesByGroupId(
        group.id
      );
  } else if (slot) {
    sessionInfo =
      resolveSessionDate({
        dayOfWeek:
          slot.dayOfWeek,
        dateOffsetDays,
      });

    group =
      await ensureGaliHadarAttendanceGroup(
        slot
      );

    trainees =
      await getActiveTraineesByGroupId(
        group.id
      );
  } else {
    const resolution =
      await resolveActiveGroup(
        groupName
      );

    if (
      !resolution.success
    ) {
      return {
        success: false,

        code:
          resolution.code,

        message:
          resolution.message,

        matches:
          resolution.matches ||
          [],
      };
    }

    group =
      resolution.group;

    sessionInfo =
      resolveSessionDate({
        dateOffsetDays,
      });

    trainees =
      await getActiveTraineesByGroupId(
        group.id
      );
  }

  if (
    trainees.length === 0
  ) {
    const teamMessage =
      teamContext
        ? `❌ אין מתאמנים משובצים בנבחרת ${teamContext.teamLabel} ליום ${teamContext.dayName}.`
        : `❌ אין מתאמנים פעילים בקבוצת ${group.name}.`;

    return {
      success: false,

      code:
        "EMPTY_GROUP",

      message:
        teamMessage,
    };
  }

  const matchedTrainees =
    [];

  const unknownNames =
    [];

  for (
    const inputName of
      presentNames
  ) {
    const trainee =
      findMatchingTrainee(
        inputName,
        trainees
      );

    if (trainee) {
      if (
        !matchedTrainees.some(
          (item) =>
            item.id ===
            trainee.id
        )
      ) {
        matchedTrainees.push(
          trainee
        );
      }
    } else {
      unknownNames.push(
        inputName
      );
    }
  }

  /*
   * שם לא מוכר = לא שומרים כלום.
   */
  if (
    unknownNames.length > 0
  ) {
    return {
      success: false,

      code:
        "UNKNOWN_TRAINEES",

      group,
      unknownNames,

      message: [
        "⚠️ נמצאו שמות שלא קיימים ברשימת האימון:",
        "",
        ...unknownNames.map(
          (name) =>
            `• ${name}`
        ),
        "",
        "הנוכחות לא נשמרה.",
        "רק מנהל יכול לשנות את רשימות המתאמנים.",
      ].join("\n"),
    };
  }

  const sessionDate =
    sessionInfo.sessionDate;

  const submittedBy =
    getStaffName(
      submittedByPhone
    );

  const session =
    await getOrCreateAttendanceSession({
      groupId:
        group.id,

      sessionDate,

      submittedBy,
    });

  const presentTraineeIds =
    new Set(
      matchedTrainees.map(
        (trainee) =>
          trainee.id
      )
    );

  /*
   * =======================================================
   * טיפול במתאמנים גמישים
   * =======================================================
   */

  const flexibleTrainees =
    slot
      ? trainees.filter(
          (trainee) =>
            isFlexibleTrainee(
              trainee
            )
        )
      : [];

  const flexibleTraineeIds =
    new Set(
      flexibleTrainees.map(
        (trainee) =>
          trainee.id
      )
    );

  const attendanceTrainees =
    trainees.filter(
      (trainee) =>
        !flexibleTraineeIds.has(
          trainee.id
        ) ||
        presentTraineeIds.has(
          trainee.id
        )
    );

  await saveAttendanceRecords({
    sessionId:
      session.id,

    trainees:
      attendanceTrainees,

    presentTraineeIds,
  });

  const absentTrainees =
    trainees.filter(
      (trainee) =>
        !presentTraineeIds.has(
          trainee.id
        ) &&
        !flexibleTraineeIds.has(
          trainee.id
        )
    );

  const attendanceTotal =
    attendanceTrainees.length;

  return {
    success: true,

    session,
    group,
    slot,
    teamContext,

    submittedBy,

    submittedByPhone:
      normalizePhone(
        submittedByPhone
      ),

    total:
      attendanceTotal,

    rosterTotal:
      trainees.length,

    presentCount:
      matchedTrainees.length,

    absentCount:
      absentTrainees.length,

    flexibleCount:
      flexibleTrainees.length,

    present:
      matchedTrainees,

    absent:
      absentTrainees,

    flexible:
      flexibleTrainees,
  };
}

/*
 * =========================================================
 * סיכום נוכחות
 * =========================================================
 */

function buildAttendanceSummary(
  result
) {
  if (
    !result?.success
  ) {
    return (
      result?.message ||
      "❌ לא ניתן היה לשמור את הנוכחות."
    );
  }

  const presentLines =
    result.present.length > 0
      ? result.present.map(
          (trainee) =>
            `✅ ${trainee.name}`
        )
      : [
          "אין",
        ];

  const absentLines =
    result.absent.length > 0
      ? result.absent.map(
          (trainee) =>
            `❌ ${trainee.name}`
        )
      : [
          "אין 🎉",
        ];

  const title =
    result.teamContext
      ? `📋 נוכחות – ${result.teamContext.teamLabel} (${result.teamContext.dayName})`
      : result.slot
        ? `📋 נוכחות – ${result.slot.dayName} ${result.slot.startTime}`
        : `📋 נוכחות – ${result.group.name}`;

  const lines = [
    title,

    `📍 ${result.group.branch || "ללא סניף"}`,

    "",

    `👤 דווח על ידי: ${result.submittedBy}`,

    "",

    `✅ הגיעו: ${result.presentCount} מתוך ${result.total}`,

    `❌ נעדרו: ${result.absentCount}`,

    "",

    "הגיעו:",

    ...presentLines,

    "",

    "לא הגיעו:",

    ...absentLines,
  ];

  if (
    result.slot &&
    result.flexible?.length > 0
  ) {
    const flexibleNotPresent =
      result.flexible.filter(
        (trainee) =>
          !result.present.some(
            (presentTrainee) =>
              presentTrainee.id ===
              trainee.id
          )
      );

    if (
      flexibleNotPresent.length > 0
    ) {
      lines.push(
        "",
        "🔄 מתאמנים גמישים שלא סומנו כנעדרים:",
        ...flexibleNotPresent.map(
          (trainee) =>
            `• ${trainee.name}`
        )
      );
    }
  }

  return lines.join(
    "\n"
  );
}

/*
 * =========================================================
 * הודעת רשימת קבוצה
 * =========================================================
 */

function buildGroupRosterMessage(
  result
) {
  if (
    !result?.success
  ) {
    return (
      result?.message ||
      "❌ לא ניתן היה לקבל את רשימת הקבוצה."
    );
  }

  const traineeLines =
    result.trainees.length > 0
      ? result.trainees.map(
          (
            trainee,
            index
          ) => {
            const notes =
              trainee.notes
                ? ` (${trainee.notes})`
                : "";

            return `${index + 1}. ${trainee.name}${notes}`;
          }
        )
      : [
          "אין מתאמנים פעילים.",
        ];

  const title =
    result.slot
      ? `👥 גלי הדר – ${result.slot.dayName} ${result.slot.startTime}`
      : `👥 קבוצת ${result.group.name}`;

  return [
    title,

    `📍 ${result.group.branch || "ללא סניף"}`,

    "",

    `סה״כ מתאמנים: ${result.total}`,

    "",

    ...traineeLines,
  ].join(
    "\n"
  );
}

/*
 * =========================================================
 * exports
 * =========================================================
 */

module.exports = {
  normalizePhone,

  getManagerPhones,
  isManagerPhone,

  isCoachPhone,
  getCoachName,
  getStaffName,

  getIsraelDateString,
  getIsraelDayOfWeek,
  resolveSessionDate,
  getDayOfWeekFromText,
  getTeamLabelFromGroupName,
  parseSlotsTarget,
  isInternalAttendanceGroup,
  findMatchingTrainee,

  normalizeGroupText,
  detectBranchFromText,

  parseGaliHadarSlot,

  resolveActiveGroup,
  getActiveGroupByName,
  getActiveGroups,

  getActiveTraineesByGroupId,
  getAllTraineesByGroupId,

  getGroupRoster,
  buildGroupRosterMessage,

  addTrainee,
  removeTrainee,
  moveTrainee,

  submitAttendance,
  buildAttendanceSummary,
};