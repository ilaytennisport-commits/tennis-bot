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

  console.log("✅ PostgreSQL users table is ready");
}

module.exports = {
  pool,
  initializeDatabase,
};