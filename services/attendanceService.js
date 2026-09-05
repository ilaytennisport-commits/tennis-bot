const {
  pool,
} = require("./databaseService");

/*
 * =========================================================
 * הרשאות מאמנים
 * =========================================================
 */

const COACH_NAMES = {
  "0544832278": "אריק הלמן",
  "0546444516": "ליאל",
  "0533368713": "נובל",
  "0522315590": "אבי",
  "0542284211": "אלונה",
  "0549827437": "אריק מנדלבאום",
  "0549454430": "נועה",
};

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

function getCoachPhones() {
  const raw =
    process.env.COACH_PHONES || "";

  return raw
    .split(",")
    .map((phone) =>
      normalizePhone(phone)
    )
    .filter(Boolean);
}

function isCoachPhone(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  return getCoachPhones().includes(
    normalizedPhone
  );
}

function getCoachName(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  return (
    COACH_NAMES[normalizedPhone] ||
    "מאמן"
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
    normalizeName(inputName);

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
      code: "GROUP_NOT_FOUND",
      message:
        `❌ לא מצאתי קבוצה בשם "${groupName}".`,
    };
  }

  const trainees =
    await getActiveTraineesByGroupId(
      group.id
    );

  if (trainees.length === 0) {
    return {
      success: false,
      code: "EMPTY_GROUP",
      message:
        `❌ אין מתאמנים פעילים בקבוצת ${group.name}.`,
    };
  }

  const matchedTrainees = [];
  const unknownNames = [];

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
   * חשוב:
   * שמות לא מוכרים לעולם
   * לא נוצרים כאן כמתאמנים.
   */
  if (unknownNames.length > 0) {
    return {
      success: false,
      code: "UNKNOWN_TRAINEES",
      group,
      unknownNames,
      message: [
        "⚠️ נמצאו שמות שלא קיימים ברשימת הקבוצה:",
        "",
        ...unknownNames.map(
          (name) => `• ${name}`
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
    getCoachName(
      submittedByPhone
    );

  const session =
    await getOrCreateAttendanceSession(
      {
        groupId: group.id,
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
    sessionId: session.id,
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
      : ["אין"];

  const absentLines =
    result.absent.length > 0
      ? result.absent.map(
          (trainee) =>
            `❌ ${trainee.name}`
        )
      : ["אין 🎉"];

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

  isCoachPhone,
  getCoachName,

  getIsraelDateString,

  getActiveGroupByName,
  getActiveGroups,
  getActiveTraineesByGroupId,

  submitAttendance,
  buildAttendanceSummary,
};