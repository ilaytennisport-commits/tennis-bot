const { pool } = require("./databaseService");

/*
 * כמה הודעות שומרים לכל לקוח
 * (כדי שהמנהל יקבל את השיחה המלאה בליד).
 */
const MAX_STORED_MESSAGES = 40;

/*
 * כמה הודעות אחרונות משמשות להבנת ההקשר
 * ולשליחה ל-OpenAI.
 */
const CONTEXT_MESSAGES = 12;

async function getConversation(
  userId,
  limit = CONTEXT_MESSAGES
) {
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
    [userId, limit]
  );

  return result.rows.reverse();
}

async function getFullConversation(userId) {
  return getConversation(
    userId,
    MAX_STORED_MESSAGES
  );
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
    [userId, MAX_STORED_MESSAGES]
  );
}

/*
 * האם הבוט שלח את הטקסט הזה לאחרונה לאותה שיחה.
 * נשמר במסד הנתונים, ולכן עובד גם אחרי הפעלה מחדש של השרת
 * (למשל כשהודעה של הבוט חוזרת ב-Webhook אחרי העלאת גרסה).
 */
async function wasRecentlySentByBot(
  userId,
  content,
  minutes = 30
) {
  if (!userId || !content) {
    return false;
  }

  const result = await pool.query(
    `
      SELECT 1
      FROM conversation_messages
      WHERE user_id = $1
        AND role = 'assistant'
        AND content = $2
        AND created_at > NOW() - ($3::TEXT || ' minutes')::INTERVAL
      LIMIT 1
    `,
    [userId, String(content).trim(), String(minutes)]
  );

  return result.rows.length > 0;
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
  MAX_STORED_MESSAGES,
  CONTEXT_MESSAGES,
  getConversation,
  getFullConversation,
  addMessage,
  clearConversation,
  wasRecentlySentByBot,
};
