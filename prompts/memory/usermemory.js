const { pool } = require("../../services/databaseService");

function emptyUser() {
  return {
    name: null,
    age: null,
    branch: null,
    phone: null,
    goal: null,
  };
}

async function getUser(userId) {
  const result = await pool.query(
    `
      SELECT name, age, branch, phone, goal
      FROM users
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || emptyUser();
}

async function saveUser(userId, data) {
  const currentUser = await getUser(userId);

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
        branch,
        phone,
        goal,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        branch = EXCLUDED.branch,
        phone = EXCLUDED.phone,
        goal = EXCLUDED.goal,
        updated_at = NOW()
      RETURNING name, age, branch, phone, goal
    `,
    [
      userId,
      updatedUser.name,
      updatedUser.age,
      updatedUser.branch,
      updatedUser.phone,
      updatedUser.goal,
    ]
  );

  return result.rows[0];
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
  clearUser,
};