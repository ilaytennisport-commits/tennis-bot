const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("❌ PostgreSQL pool error:", error.message);
});

async function initializeDatabase() {
  // טבלת משתמשים
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      age INTEGER,
      branch TEXT,
      phone TEXT,
      goal TEXT,
      summary_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS summary_sent BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // טבלת היסטוריית שיחות
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // אינדקס לשיפור הביצועים
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversation_user
    ON conversation_messages(user_id, created_at DESC)
  `);

  console.log("✅ PostgreSQL tables are ready");
}

module.exports = {
  pool,
  initializeDatabase,
};