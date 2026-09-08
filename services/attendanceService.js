const {
  pool,
} = require("./databaseService");

/*
 * =========================================================
 * שמות אנשי צוות
 * =========================================================
 */

const STAFF_NAMES = {
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

  if (
    STAFF_NAMES[
      normalizedPhone
    ]
  ) {
    return STAFF_NAMES[
      normalizedPhone
    ];
  }

  if (
    isManagerPhone(
      normalizedPhone
    )
  ) {
    return "מנהל";
  }

  if (
    isCoachPhone(
      normalizedPhone
    )
  ) {
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

function getIsraelDateString() {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    );

  return formatter.format(
    new Date()
  );
}

function getIsraelDayOfWeek() {
  const dayName =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Jerusalem",
        weekday:
          "long",
      }
    ).format(
      new Date()
    );

  const map = {
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6,
    Saturday: 7,
  };

  return map[dayName] || null;
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

  /*
   * חייב להיות כתוב גלי הדר כדי שלא נתבלבל
   * עם קבוצות של בית חשמונאי.
   */
  if (
    !/גלי\s*הדר/i.test(
      text
    )
  ) {
    return null;
  }

  let dayOfWeek = null;

  for (
    const [
      dayName,
      dayNumber,
    ] of Object.entries(
      DAY_MAP
    )
  ) {
    if (
      text.includes(
        dayName
      )
    ) {
      dayOfWeek =
        dayNumber;
      break;
    }
  }

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
 * זיהוי נבחרת לפי שם קצר
 * =========================================================
 */

function getTeamLabelFromGroupName(
  groupName = ""
) {
  const text =
    normalizeGroupText(
      groupName
    );

  if (
    text === "בוגרת" ||
    text ===
      "נבחרת בוגרת"
  ) {
    return "בוגרת";
  }

  if (
    text === "צעירה" ||
    text ===
      "נבחרת צעירה"
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

async function getActiveGroups() {
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

  return result.rows;
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
  groupId
) {
  const result =
    await pool.query(
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
  groupId
) {
  const result =
    await pool.query(
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
 *
 * קודם מחפשים התאמה מלאה.
 *
 * אם אין התאמה מלאה, מאפשרים שם פרטי / חלק יחיד
 * רק כאשר יש התאמה אחת ויחידה ברשימת האימון.
 *
 * לדוגמה:
 * עילאי -> רבזון עילאי
 * אורי -> אורי רבינוביץ
 * תומר -> תומר יוספזון
 *
 * אם יש יותר מהתאמה אחת - לא מנחשים.
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

async function getGroupRoster(
  groupName
) {
  const slot =
    parseGaliHadarSlot(
      groupName
    );

  if (slot) {
    const group =
      await ensureGaliHadarAttendanceGroup(
        slot
      );

    const trainees =
      await getActiveTraineesByGroupId(
        group.id
      );

    return {
      success: true,
      group,
      trainees,

      total:
        trainees.length,

      slot,

      isTrainingSlot:
        true,
    };
  }

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

  const group =
    resolution.group;

  const trainees =
    await getActiveTraineesByGroupId(
      group.id
    );

  return {
    success: true,
    group,
    trainees,

    total:
      trainees.length,
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
    cleanValue(
      traineeName
    );

  const cleanNotes =
    cleanValue(
      notes || ""
    ) || null;

  if (!cleanName) {
    return {
      success: false,

      code:
        "INVALID_NAME",

      message:
        "❌ חסר שם המתאמן.",
    };
  }

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

  const group =
    resolution.group;

  const allTrainees =
    await getAllTraineesByGroupId(
      group.id
    );

  const existing =
    findMatchingTrainee(
      cleanName,
      allTrainees
    );

  if (
    existing &&
    existing.active
  ) {
    return {
      success: false,

      code:
        "TRAINEE_ALREADY_EXISTS",

      group,

      trainee:
        existing,

      message:
        `⚠️ ${existing.name} כבר נמצא בקבוצת ${group.name}.`,
    };
  }

  if (
    existing &&
    !existing.active
  ) {
    const result =
      await pool.query(
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
        [
          existing.id,
          cleanNotes,
        ]
      );

    return {
      success: true,

      code:
        "TRAINEE_REACTIVATED",

      group,

      trainee:
        result.rows[0],

      message:
        `✅ ${result.rows[0].name} הוחזר לקבוצת ${group.name}.`,
    };
  }

  const result =
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
        RETURNING
          id,
          group_id,
          name,
          notes,
          active
      `,
      [
        group.id,
        cleanName,
        cleanNotes,
      ]
    );

  return {
    success: true,

    code:
      "TRAINEE_ADDED",

    group,

    trainee:
      result.rows[0],

    message:
      `✅ ${result.rows[0].name} נוסף לקבוצת ${group.name}.`,
  };
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
    cleanValue(
      traineeName
    );

  if (!cleanName) {
    return {
      success: false,

      code:
        "INVALID_NAME",

      message:
        "❌ חסר שם המתאמן.",
    };
  }

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

  const group =
    resolution.group;

  const trainees =
    await getActiveTraineesByGroupId(
      group.id
    );

  const trainee =
    findMatchingTrainee(
      cleanName,
      trainees
    );

  if (!trainee) {
    return {
      success: false,

      code:
        "TRAINEE_NOT_FOUND",

      group,

      message:
        `❌ לא מצאתי מתאמן פעיל בשם "${cleanName}" בקבוצת ${group.name}.`,
    };
  }

  const result =
    await pool.query(
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
      [
        trainee.id,
      ]
    );

  return {
    success: true,

    code:
      "TRAINEE_REMOVED",

    group,

    trainee:
      result.rows[0],

    message:
      `✅ ${result.rows[0].name} הוסר מקבוצת ${group.name}.`,
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
    cleanValue(
      traineeName
    );

  if (!cleanName) {
    return {
      success: false,

      code:
        "INVALID_NAME",

      message:
        "❌ חסר שם המתאמן.",
    };
  }

  const fromResolution =
    await resolveActiveGroup(
      fromGroupName
    );

  if (
    !fromResolution.success
  ) {
    return {
      success: false,

      code:
        fromResolution.code,

      message:
        fromResolution.message,

      matches:
        fromResolution.matches ||
        [],
    };
  }

  const toResolution =
    await resolveActiveGroup(
      toGroupName
    );

  if (
    !toResolution.success
  ) {
    return {
      success: false,

      code:
        toResolution.code,

      message:
        toResolution.message,

      matches:
        toResolution.matches ||
        [],
    };
  }

  const fromGroup =
    fromResolution.group;

  const toGroup =
    toResolution.group;

  if (
    fromGroup.id ===
    toGroup.id
  ) {
    return {
      success: false,

      code:
        "SAME_GROUP",

      message:
        "⚠️ קבוצת המקור וקבוצת היעד זהות.",
    };
  }

  const sourceTrainees =
    await getActiveTraineesByGroupId(
      fromGroup.id
    );

  const sourceTrainee =
    findMatchingTrainee(
      cleanName,
      sourceTrainees
    );

  if (!sourceTrainee) {
    return {
      success: false,

      code:
        "TRAINEE_NOT_FOUND",

      message:
        `❌ לא מצאתי את "${cleanName}" בקבוצת ${fromGroup.name}.`,
    };
  }

  const targetTrainees =
    await getAllTraineesByGroupId(
      toGroup.id
    );

  const existingTarget =
    findMatchingTrainee(
      cleanName,
      targetTrainees
    );

  if (
    existingTarget &&
    existingTarget.active
  ) {
    return {
      success: false,

      code:
        "TRAINEE_ALREADY_IN_TARGET",

      message:
        `⚠️ ${existingTarget.name} כבר נמצא בקבוצת ${toGroup.name}.`,
    };
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `
        UPDATE trainees
        SET
          active = FALSE,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        sourceTrainee.id,
      ]
    );

    let targetTrainee;

    if (
      existingTarget
    ) {
      const reactivateResult =
        await client.query(
          `
            UPDATE trainees
            SET
              active = TRUE,
              notes = $2,
              updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              group_id,
              name,
              notes,
              active
          `,
          [
            existingTarget.id,
            sourceTrainee.notes,
          ]
        );

      targetTrainee =
        reactivateResult.rows[0];
    } else {
      const insertResult =
        await client.query(
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
            RETURNING
              id,
              group_id,
              name,
              notes,
              active
          `,
          [
            toGroup.id,
            sourceTrainee.name,
            sourceTrainee.notes,
          ]
        );

      targetTrainee =
        insertResult.rows[0];
    }

    await client.query(
      "COMMIT"
    );

    return {
      success: true,

      code:
        "TRAINEE_MOVED",

      fromGroup,
      toGroup,

      trainee:
        targetTrainee,

      message:
        `✅ ${sourceTrainee.name} הועבר מקבוצת ${fromGroup.name} לקבוצת ${toGroup.name}.`,
    };
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
 *
 * לפני שמירת דיווח מחדש לאותו מפגש,
 * מוחקים את הרשומות הקודמות של אותו session.
 *
 * כך:
 * - שינוי roster לא משאיר נעדרים ישנים.
 * - מתאמן גמיש שלא דווח שוב לא נשאר בטעות.
 * - דיווח מתוקן מחליף את הדיווח הקודם.
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
}) {
  let group;
  let trainees;
  let slot = null;
  let teamContext = null;

  /*
   * קודם בודקים אם נשלח יום + שעה מפורשים.
   */
  slot =
    parseGaliHadarSlot(
      groupName
    );

  /*
   * בוגרת / צעירה ללא יום ושעה:
   * משתמשים אוטומטית ביום הנוכחי בישראל.
   */
  const teamLabel =
    getTeamLabelFromGroupName(
      groupName
    );

  if (
    !slot &&
    teamLabel
  ) {
    const dayOfWeek =
      getIsraelDayOfWeek();

    if (!dayOfWeek) {
      return {
        success: false,

        code:
          "DAY_NOT_FOUND",

        message:
          "❌ לא הצלחתי לזהות את היום הנוכחי בישראל.",
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
   * אם יש שם לא מוכר - לא שומרים שום דבר.
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
    getIsraelDateString();

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

  /*
   * מתאמן רגיל תמיד נכלל.
   * מתאמן גמיש נכלל רק אם הגיע.
   */
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
      ? `📋 נוכחות – ${result.teamContext.teamLabel}`
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