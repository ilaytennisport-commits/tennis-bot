const { pool } = require("./databaseService");

const MAX_MESSAGES = 12;

async function getConversation(userId) {
  if (!userId) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT role, content
      FROM conversation_messages
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [userId, MAX_MESSAGES]
  );

  return result.rows.reverse();
}

async function addMessage(userId, role, content) {
  if (!userId || !role || !content) {
    return;
  }

  await pool.query(
    `
      INSERT INTO conversation_messages (
        user_id,
        role,
        content
      )
      VALUES ($1, $2, $3)
    `,
    [userId, role, content]
  );

  await pool.query(
    `
      DELETE FROM conversation_messages
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id
          FROM conversation_messages
          WHERE user_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
        )
    `,
    [userId, MAX_MESSAGES]
  );
}

async function clearConversation(userId) {
  if (!userId) {
    return;
  }

  await pool.query(
    `
      DELETE FROM conversation_messages
      WHERE user_id = $1
    `,
    [userId]
  );
}

module.exports = {
  getConversation,
  addMessage,
  clearConversation,
};