const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error(
    "❌ PostgreSQL pool error:",
    error.message
  );
});

async function initializeDatabase() {
  /*
   * =========================================================
   * משתמשים / פרופיל שיחה
   * =========================================================
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      age INTEGER,
      city TEXT,
      height INTEGER,
      audience TEXT,
      equipment_topic TEXT,
      experience TEXT,
      branch TEXT,
      phone TEXT,
      goal TEXT,

      source TEXT,
      source_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

      regular_flow_active BOOLEAN NOT NULL DEFAULT FALSE,

      summary_sent BOOLEAN NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
   * הוספת עמודות גם להתקנות קיימות.
   */
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS city TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS height INTEGER
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS audience TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS equipment_topic TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS experience TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS source TEXT
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS source_confirmed
    BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS regular_flow_active
    BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS summary_sent
    BOOLEAN NOT NULL DEFAULT FALSE
  `);

  /*
   * =========================================================
   * היסטוריית שיחות
   * =========================================================
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversation_user
    ON conversation_messages(
      user_id,
      created_at DESC
    )
  `);

  /*
   * =========================================================
   * מערכת נוכחות
   * =========================================================
   */

  /*
   * קבוצות אימון.
   *
   * לדוגמה:
   * בוגרת
   * צעירה
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_groups (
      id BIGSERIAL PRIMARY KEY,

      name TEXT NOT NULL UNIQUE,

      branch TEXT,

      active BOOLEAN NOT NULL DEFAULT TRUE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
   * מתאמנים.
   *
   * כל מתאמן משויך לקבוצה.
   * notes משמש להערות כגון:
   * חדש
   * ג.ה
   * ב.ד.ה
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainees (
      id BIGSERIAL PRIMARY KEY,

      group_id BIGINT NOT NULL
        REFERENCES training_groups(id)
        ON DELETE CASCADE,

      name TEXT NOT NULL,

      notes TEXT,

      active BOOLEAN NOT NULL DEFAULT TRUE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(group_id, name)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trainees_group
    ON trainees(group_id)
  `);

  /*
   * מפגש נוכחות.
   *
   * לכל קבוצה יכול להיות מפגש אחד
   * לכל תאריך.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id BIGSERIAL PRIMARY KEY,

      group_id BIGINT NOT NULL
        REFERENCES training_groups(id)
        ON DELETE CASCADE,

      session_date DATE NOT NULL,

      submitted_by TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(group_id, session_date)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_sessions_group_date
    ON attendance_sessions(
      group_id,
      session_date DESC
    )
  `);

  /*
   * נוכחות של כל ילד בתוך המפגש.
   *
   * status:
   * present = הגיע
   * absent = לא הגיע
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id BIGSERIAL PRIMARY KEY,

      session_id BIGINT NOT NULL
        REFERENCES attendance_sessions(id)
        ON DELETE CASCADE,

      trainee_id BIGINT NOT NULL
        REFERENCES trainees(id)
        ON DELETE CASCADE,

      status TEXT NOT NULL
        CHECK (
          status IN (
            'present',
            'absent'
          )
        ),

      notes TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(session_id, trainee_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_records_session
    ON attendance_records(session_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_records_trainee
    ON attendance_records(trainee_id)
  `);

  /*
   * =========================================================
   * יצירת קבוצות התחלתיות
   * =========================================================
   */

  await pool.query(`
    INSERT INTO training_groups (
      name
    )
    VALUES
      ('בוגרת'),
      ('צעירה')
    ON CONFLICT (name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * מתאמני קבוצת בוגרת
   * =========================================================
   */

  await pool.query(`
    INSERT INTO trainees (
      group_id,
      name,
      notes
    )
    SELECT
      g.id,
      data.name,
      data.notes
    FROM training_groups g
    CROSS JOIN (
      VALUES
        ('מילי', NULL),
        ('זהר', NULL),
        ('עילאי', NULL),
        ('נועם', NULL),
        ('תומר', NULL),
        ('אופיר', NULL),
        ('אורי', 'ב.ג'),
        ('איתן', 'ה'),
        ('אוהד', 'ה')
    ) AS data(name, notes)
    WHERE g.name = 'בוגרת'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * מתאמני קבוצת צעירה
   * =========================================================
   */

  await pool.query(`
    INSERT INTO trainees (
      group_id,
      name,
      notes
    )
    SELECT
      g.id,
      data.name,
      data.notes
    FROM training_groups g
    CROSS JOIN (
      VALUES
        ('סתיו', NULL),
        ('רז', NULL),
        ('רועי אלקינד', 'חדש'),
        ('יונתן לוי', 'חדש, ג.ה'),
        ('מישל', 'ג.ה'),
        ('ארטיום גוסקוב', 'ג.ה'),
        ('דניאל', 'ב.ד.ה'),
        ('אלון', 'ב.ד.ה')
    ) AS data(name, notes)
    WHERE g.name = 'צעירה'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  console.log(
    "✅ PostgreSQL tables are ready"
  );

  console.log(
    "✅ Attendance tables are ready"
  );
}

module.exports = {
  pool,
  initializeDatabase,
};