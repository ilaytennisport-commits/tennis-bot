const {
  pool,
} = require("../../services/databaseService");

function emptyUser() {
  return {
    name: null,
    age: null,
    city: null,
    height: null,
    audience: null,
    equipment_topic: null,
    experience: null,
    branch: null,
    phone: null,
    goal: null,

    // שער הכניסה
    source: null,
    source_confirmed: false,

    summary_sent: false,
  };
}

async function getUser(userId) {
  const result = await pool.query(
    `
      SELECT
        name,
        age,
        city,
        height,
        audience,
        equipment_topic,
        experience,
        branch,
        phone,
        goal,
        source,
        source_confirmed,
        summary_sent
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

  const result = await pool.query(
    `
      INSERT INTO users (
        user_id,
        name,
        age,
        city,
        height,
        audience,
        equipment_topic,
        experience,
        branch,
        phone,
        goal,
        source,
        source_confirmed,
        summary_sent,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        city = EXCLUDED.city,
        height = EXCLUDED.height,
        audience = EXCLUDED.audience,
        equipment_topic =
          EXCLUDED.equipment_topic,
        experience =
          EXCLUDED.experience,
        branch = EXCLUDED.branch,
        phone = EXCLUDED.phone,
        goal = EXCLUDED.goal,
        source = EXCLUDED.source,
        source_confirmed =
          EXCLUDED.source_confirmed,
        summary_sent =
          EXCLUDED.summary_sent,
        updated_at = NOW()
      RETURNING
        name,
        age,
        city,
        height,
        audience,
        equipment_topic,
        experience,
        branch,
        phone,
        goal,
        source,
        source_confirmed,
        summary_sent
    `,
    [
      userId,
      updatedUser.name,
      updatedUser.age,
      updatedUser.city,
      updatedUser.height,
      updatedUser.audience,
      updatedUser.equipment_topic,
      updatedUser.experience,
      updatedUser.branch,
      updatedUser.phone,
      updatedUser.goal,
      updatedUser.source,
      updatedUser.source_confirmed === true,
      updatedUser.summary_sent === true,
    ]
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
        name,
        age,
        city,
        height,
        audience,
        equipment_topic,
        experience,
        branch,
        phone,
        goal,
        source,
        source_confirmed,
        summary_sent
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
  getUser,
  saveUser,
  markSummarySent,
  clearUser,
};