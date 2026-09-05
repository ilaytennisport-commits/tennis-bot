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
 * טלפונים והרשאות
 * =========================================================
 */

function normalizePhone(phone = "") {
  let value = String(phone)
    .replace(/\D/g, "")
    .trim();

  /*
   * 97254... -> 054...
   */
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
 *
 * משתנה חדש:
 *
 * MANAGER_PHONES
 *
 * לדוגמה:
 * 0500000000,0501111111
 *
 * אם MANAGER_PHONES עדיין לא הוגדר,
 * המערכת תשתמש ב-CLUB_MANAGER_PHONE
 * הישן כדי לא לשבור את המערכת.
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

/*
 * תאימות לקוד הקיים.
 */
function getCoachName(phone) {
  return getStaffName(
    phone
  );
}

/*
 * =========================================================
 * עזרי תאריך
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

/*
 * =========================================================
 * קבוצות
 * =========================================================
 */

async function getActiveGroupByName(
  groupName
) {
  const result =
    await pool.query(
      `
        SELECT
          id,
          name,
          branch,
          active
        FROM training_groups
        WHERE
          LOWER(name) =
            LOWER($1)
          AND active = TRUE
        LIMIT 1
      `,
      [groupName]
    );

  return result.rows[0] || null;
}

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
        ORDER BY name
      `
    );

  return result.rows;
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
      [groupId]
    );

  return result.rows;
}

function normalizeName(name = "") {
  return String(name)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]/g, "")
    .toLowerCase();
}

function findMatchingTrainee(
  inputName,
  trainees
) {
  const normalizedInput =
    normalizeName(
      inputName
    );

  return (
    trainees.find(
      (trainee) =>
        normalizeName(
          trainee.name
        ) === normalizedInput
    ) || null
  );
}

/*
 * =========================================================
 * יצירת / עדכון מפגש נוכחות
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

async function saveAttendanceRecords({
  sessionId,
  trainees,
  presentTraineeIds,
}) {
  for (
    const trainee of trainees
  ) {
    const status =
      presentTraineeIds.has(
        trainee.id
      )
        ? "present"
        : "absent";

    await pool.query(
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
  const group =
    await getActiveGroupByName(
      groupName
    );

  if (!group) {
    return {
      success: false,
      code:
        "GROUP_NOT_FOUND",
      message:
        `❌ לא מצאתי קבוצה בשם "${groupName}".`,
    };
  }

  const trainees =
    await getActiveTraineesByGroupId(
      group.id
    );

  if (
    trainees.length === 0
  ) {
    return {
      success: false,
      code:
        "EMPTY_GROUP",
      message:
        `❌ אין מתאמנים פעילים בקבוצת ${group.name}.`,
    };
  }

  const matchedTrainees =
    [];

  const unknownNames =
    [];

  for (
    const inputName of presentNames
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
   * שמות לא מוכרים לעולם
   * לא מתווספים אוטומטית.
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
        "⚠️ נמצאו שמות שלא קיימים ברשימת הקבוצה:",
        "",
        ...unknownNames.map(
          (name) =>
            `• ${name}`
        ),
        "",
        "הנוכחות לא נשמרה.",
        "רק מנהל יכול להוסיף מתאמנים חדשים למערכת.",
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
    await getOrCreateAttendanceSession(
      {
        groupId:
          group.id,
        sessionDate,
        submittedBy,
      }
    );

  const presentTraineeIds =
    new Set(
      matchedTrainees.map(
        (trainee) =>
          trainee.id
      )
    );

  await saveAttendanceRecords({
    sessionId:
      session.id,
    trainees,
    presentTraineeIds,
  });

  const absentTrainees =
    trainees.filter(
      (trainee) =>
        !presentTraineeIds.has(
          trainee.id
        )
    );

  return {
    success: true,

    session,

    group,

    submittedBy,

    submittedByPhone:
      normalizePhone(
        submittedByPhone
      ),

    total:
      trainees.length,

    presentCount:
      matchedTrainees.length,

    absentCount:
      absentTrainees.length,

    present:
      matchedTrainees,

    absent:
      absentTrainees,
  };
}

/*
 * =========================================================
 * בניית הודעת סיכום
 * =========================================================
 */

function buildAttendanceSummary(
  result
) {
  if (!result?.success) {
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

  return [
    `📋 נוכחות – ${result.group.name}`,
    "",
    `👤 דווח על ידי: ${result.submittedBy}`,
    "",
    `✅ הגיעו: ${result.presentCount} מתוך ${result.total}`,
    "",
    "הגיעו:",
    ...presentLines,
    "",
    "לא הגיעו:",
    ...absentLines,
  ].join("\n");
}

module.exports = {
  normalizePhone,

  getManagerPhones,
  isManagerPhone,

  isCoachPhone,
  getCoachName,
  getStaffName,

  getIsraelDateString,

  getActiveGroupByName,
  getActiveGroups,
  getActiveTraineesByGroupId,

  submitAttendance,
  buildAttendanceSummary,
};