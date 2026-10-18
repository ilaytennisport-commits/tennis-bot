const {
  pool,
} = require("../../services/databaseService");

/*
 * כל עמודות הפרופיל, בסדר קבוע.
 * הוספת עמודה חדשה = הוספה כאן + ב-databaseService.
 */
const USER_COLUMNS = [
  "name",
  "age",
  "city",
  "height",
  "audience",
  "equipment_topic",
  "experience",
  "branch",
  "phone",
  "goal",

  // שער הכניסה
  "source",
  "source_confirmed",

  // לקוח שהגיע ממסלול מיוחד ועבר להתעניין במסלול הרגיל
  "regular_flow_active",

  "summary_sent",

  // נציג אנושי ענה ידנית — הבוט שותק עד הזמן הזה
  "bot_paused_until",

  // הודעה ראשונה שנשלחה לפני שאלת "איך שמעתם עלינו"
  "pending_message",
];

const BOOLEAN_COLUMNS = new Set([
  "source_confirmed",
  "regular_flow_active",
  "summary_sent",
]);

const SELECT_COLUMNS =
  USER_COLUMNS.join(",\n        ");

function emptyUser() {
  const user = {};

  for (const column of USER_COLUMNS) {
    user[column] = BOOLEAN_COLUMNS.has(column)
      ? false
      : null;
  }

  return user;
}

async function getUser(userId) {
  const result = await pool.query(
    `
      SELECT
        ${SELECT_COLUMNS}
      FROM users
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || emptyUser();
}

async function saveUser(
  userId,
  data = {}
) {
  const currentUser =
    await getUser(userId);

  const updatedUser = {
    ...currentUser,
    ...data,
  };

  const values = USER_COLUMNS.map(
    (column) =>
      BOOLEAN_COLUMNS.has(column)
        ? updatedUser[column] === true
        : updatedUser[column] ?? null
  );

  const placeholders = USER_COLUMNS.map(
    (_, index) => `$${index + 2}`
  ).join(", ");

  const updates = USER_COLUMNS.map(
    (column) =>
      `${column} = EXCLUDED.${column}`
  ).join(",\n        ");

  const result = await pool.query(
    `
      INSERT INTO users (
        user_id,
        ${SELECT_COLUMNS},
        updated_at
      )
      VALUES (
        $1,
        ${placeholders},
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        ${updates},
        updated_at = NOW()
      RETURNING
        ${SELECT_COLUMNS}
    `,
    [userId, ...values]
  );

  return result.rows[0];
}

async function markSummarySent(
  userId
) {
  const result = await pool.query(
    `
      UPDATE users
      SET
        summary_sent = TRUE,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING
        ${SELECT_COLUMNS}
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function clearUser(userId) {
  await pool.query(
    `
      DELETE FROM users
      WHERE user_id = $1
    `,
    [userId]
  );
}

module.exports = {
  USER_COLUMNS,
  emptyUser,
  getUser,
  saveUser,
  markSummarySent,
  clearUser,
};
