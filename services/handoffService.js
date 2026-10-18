const { pool } = require("./databaseService");

/*
 * =========================================================
 * העברה לנציג אנושי
 * =========================================================
 *
 * כאשר מישהו מהצוות עונה ידנית ללקוח מהמספר העסקי,
 * הבוט שותק מול אותו לקוח למשך HANDOFF_PAUSE_HOURS
 * (ברירת מחדל 12 שעות), כדי שהלקוח לא יקבל תשובות סותרות.
 */

function getPauseHours() {
  const hours = Number(
    process.env.HANDOFF_PAUSE_HOURS
  );

  return Number.isFinite(hours) && hours > 0
    ? hours
    : 12;
}

function isBotPaused(user = {}, now = new Date()) {
  if (!user.bot_paused_until) {
    return false;
  }

  return new Date(user.bot_paused_until) > now;
}

async function pauseBot(
  userId,
  hours = getPauseHours()
) {
  const result = await pool.query(
    `
      INSERT INTO users (
        user_id,
        bot_paused_until,
        updated_at
      )
      VALUES (
        $1,
        NOW() + ($2::TEXT || ' hours')::INTERVAL,
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        bot_paused_until = EXCLUDED.bot_paused_until,
        updated_at = NOW()
      RETURNING bot_paused_until
    `,
    [userId, String(hours)]
  );

  return result.rows[0]?.bot_paused_until || null;
}

async function resumeBot(userId) {
  const result = await pool.query(
    `
      UPDATE users
      SET
        bot_paused_until = NULL,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rowCount > 0;
}

module.exports = {
  getPauseHours,
  isBotPaused,
  pauseBot,
  resumeBot,
};
