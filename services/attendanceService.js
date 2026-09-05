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
 * תאריך ישראל
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
 * ניקוי טקסט ושמות
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

/*
 * =========================================================
 * קבוצות
 * =========================================================
 */

async function getActiveGroupByName(
  groupName
) {
  const cleanGroupName =
    cleanValue(groupName);

  if (!cleanGroupName) {
    return null;
  }

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
      [cleanGroupName]
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
      [groupId]
    );

  return result.rows;
}

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
 * רשימת קבוצה
 * =========================================================
 */

async function getGroupRoster(
  groupName
) {
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

  const allTrainees =
    await getAllTraineesByGroupId(
      group.id
    );

  const existing =
    findMatchingTrainee(
      cleanName,
      allTrainees
    );

  /*
   * כבר פעיל בקבוצה
   */
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

  /*
   * היה בעבר בקבוצה והוסר:
   * מחזירים אותו לפעילות.
   */
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
 *
 * הסרה רכה בלבד.
 * לא מוחקים את המתאמן מה-DB,
 * כדי לשמור היסטוריית נוכחות.
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
 * העברת מתאמן בין קבוצות
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

  const fromGroup =
    await getActiveGroupByName(
      fromGroupName
    );

  if (!fromGroup) {
    return {
      success: false,
      code:
        "SOURCE_GROUP_NOT_FOUND",
      message:
        `❌ לא מצאתי קבוצה בשם "${fromGroupName}".`,
    };
  }

  const toGroup =
    await getActiveGroupByName(
      toGroupName
    );

  if (!toGroup) {
    return {
      success: false,
      code:
        "TARGET_GROUP_NOT_FOUND",
      message:
        `❌ לא מצאתי קבוצה בשם "${toGroupName}".`,
    };
  }

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

    /*
     * משביתים את הרשומה בקבוצת המקור.
     */
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

    /*
     * אם הייתה רשומה ישנה בקבוצת היעד,
     * מפעילים אותה מחדש.
     */
    if (existingTarget) {
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
   * שם לא מוכר אינו מתווסף
   * אוטומטית בשום מצב.
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

/*
 * =========================================================
 * בניית רשימת קבוצה
 * =========================================================
 */

function buildGroupRosterMessage(
  result
) {
  if (!result?.success) {
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

  return [
    `👥 קבוצת ${result.group.name}`,
    "",
    `סה״כ מתאמנים: ${result.total}`,
    "",
    ...traineeLines,
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
  getAllTraineesByGroupId,

  getGroupRoster,
  buildGroupRosterMessage,

  addTrainee,
  removeTrainee,
  moveTrainee,

  submitAttendance,
  buildAttendanceSummary,
};