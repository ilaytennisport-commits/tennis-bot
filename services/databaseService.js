const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing"
  );
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
});

pool.on(
  "error",
  (error) => {
    console.error(
      "❌ PostgreSQL pool error:",
      error.message
    );
  }
);

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
   * מערכת נוכחות קיימת
   * =========================================================
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
   * שיבוצי אימונים בפועל
   *
   * הטבלה הזו מאפשרת לילד להיות בכמה ימים ושעות.
   * לדוגמה:
   *
   * שי-לי:
   * ראשון 17
   * שלישי 18
   * רביעי 17
   *
   * בלי ליצור בעיה במערכת הנוכחות הישנה.
   * =========================================================
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainee_training_slots (
      id BIGSERIAL PRIMARY KEY,

      trainee_name TEXT NOT NULL,

      branch TEXT NOT NULL,

      group_label TEXT,

      day_of_week INTEGER NOT NULL
        CHECK (
          day_of_week BETWEEN 1 AND 7
        ),

      start_time TIME NOT NULL,

      notes TEXT,

      active BOOLEAN NOT NULL DEFAULT TRUE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (
        trainee_name,
        branch,
        day_of_week,
        start_time,
        group_label
      )
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_training_slots_branch_day_time
    ON trainee_training_slots(
      branch,
      day_of_week,
      start_time
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_training_slots_trainee
    ON trainee_training_slots(
      trainee_name
    )
  `);

  /*
   * =========================================================
   * קבוצות גלי הדר
   * =========================================================
   */

  await pool.query(`
    INSERT INTO training_groups (
      name,
      branch
    )
    VALUES
      (
        'בוגרת',
        'גלי הדר – ראשון לציון'
      ),
      (
        'צעירה',
        'גלי הדר – ראשון לציון'
      ),
      (
        'א+ד 16:00 – מתחילים כיתות ג-ו',
        'גלי הדר – ראשון לציון'
      ),
      (
        'א+ד 17:00 + ג 18:00 – עתודה',
        'גלי הדר – ראשון לציון'
      ),
      (
        'א+ד 17:00 – מתחילים כיתות א-ג',
        'גלי הדר – ראשון לציון'
      ),
      (
        'א+ד 18:00 – ו+',
        'גלי הדר – ראשון לציון'
      ),
      (
        'ב+ג+ה 16:30-18:00 – נבחרת בוגרת',
        'גלי הדר – ראשון לציון'
      ),
      (
        'ב+ג+ה 16:30-18:00 – נבחרת צעירה',
        'גלי הדר – ראשון לציון'
      ),
      (
        'ב+ה 18:00 – מתחילים כיתות ג-ו',
        'גלי הדר – ראשון לציון'
      )
    ON CONFLICT (name)
    DO UPDATE SET
      branch = EXCLUDED.branch,
      active = TRUE,
      updated_at = NOW()
  `);

  /*
   * =========================================================
   * קבוצות בית חשמונאי
   * =========================================================
   */

  await pool.query(`
    INSERT INTO training_groups (
      name,
      branch
    )
    VALUES
      (
        'א+ד 15:30-16:30 – ג-ו מתחילים ומתקדמים',
        'בית חשמונאי'
      ),
      (
        'א+ד 16:45-17:45 – ז-יב',
        'בית חשמונאי'
      ),
      (
        'א+ד 17:45-18:45 – עתודה תחרותי ללא הסעות',
        'בית חשמונאי'
      ),
      (
        'א+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות',
        'בית חשמונאי'
      ),
      (
        'ב+ה 16:45-17:30 – א-ג מתחילים כולל שנה שניה',
        'בית חשמונאי'
      ),
      (
        'ב+ה 17:45-18:45 – עתודה תחרותי ללא הסעות',
        'בית חשמונאי'
      )
    ON CONFLICT (name)
    DO UPDATE SET
      branch = EXCLUDED.branch,
      active = TRUE,
      updated_at = NOW()
  `);

  /*
   * =========================================================
   * קבוצת בוגרת הישנה
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
   * קבוצת צעירה הישנה
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

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 1
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
        ('יעל מילר', NULL),
        ('ליבי רוט', NULL),
        ('ארבל דובובסקי', NULL),
        ('גל רוט', NULL),
        ('דפנה עברון', NULL),
        ('נדב זאדה', NULL),
        ('ניב מרום', NULL),
        ('שחר אברבוך', NULL),
        ('אלה בן דהן', NULL),
        ('כרמל גלבנד', NULL),
        ('שני אורן', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'א+ד 15:30-16:30 – ג-ו מתחילים ומתקדמים'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 2
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
        ('שהם מרום', NULL),
        ('ריאן אברהם וולף', NULL),
        ('אלון בן יוסף', NULL),
        ('אלעד כהן', NULL),
        ('מעיין גלמן', NULL),
        ('עמית הרץ', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'א+ד 16:45-17:45 – ז-יב'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 3
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
        ('עידן בוייביץ', NULL),
        ('עומר בן שושן', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'א+ד 17:45-18:45 – עתודה תחרותי ללא הסעות'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 4
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
        ('דותן שניידר', NULL),
        ('דניאל שלו', NULL),
        ('אמיר זיידמן', NULL),
        ('עופרי טל', NULL),
        ('שחר מילר', NULL),
        ('תומר דיאמנט', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'א+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 5
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
        ('תבל חג''ג''', NULL),
        ('גבע רגיל', NULL),
        ('דותן שחר', NULL),
        ('יעל מילר', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'ב+ה 16:45-17:30 – א-ג מתחילים כולל שנה שניה'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * בית חשמונאי – קבוצה 6
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
        ('נועם חג''ג''', NULL),
        ('דורין מור', NULL),
        ('עופרי יחזקיה', NULL)
    ) AS data(name, notes)
    WHERE
      g.name =
        'ב+ה 17:45-18:45 – עתודה תחרותי ללא הסעות'
    ON CONFLICT (group_id, name)
    DO NOTHING
  `);

  /*
   * =========================================================
   * גלי הדר – שיבוצים מדויקים
   *
   * יום:
   * 1 = ראשון
   * 2 = שני
   * 3 = שלישי
   * 4 = רביעי
   * 5 = חמישי
   * =========================================================
   */

  await pool.query(`
    INSERT INTO trainee_training_slots (
      trainee_name,
      branch,
      group_label,
      day_of_week,
      start_time,
      notes
    )
    VALUES

      /*
       * קטנים – שלישי 18
       */
      (
        'לוקא מגלשוילי',
        'גלי הדר – ראשון לציון',
        'קטנים',
        3,
        '18:00',
        NULL
      ),
      (
        'בניה אזרזר',
        'גלי הדר – ראשון לציון',
        'קטנים',
        3,
        '18:00',
        NULL
      ),

      /*
       * צעירה
       */
      (
        'מישל אלגריסי',
        'גלי הדר – ראשון לציון',
        'צעירה',
        3,
        '16:30',
        NULL
      ),
      (
        'מישל אלגריסי',
        'גלי הדר – ראשון לציון',
        'צעירה',
        5,
        '16:30',
        NULL
      ),

      (
        'אלון מואטו',
        'גלי הדר – ראשון לציון',
        'צעירה',
        2,
        '16:30',
        NULL
      ),
      (
        'אלון מואטו',
        'גלי הדר – ראשון לציון',
        'צעירה',
        4,
        '16:30',
        NULL
      ),
      (
        'אלון מואטו',
        'גלי הדר – ראשון לציון',
        'צעירה',
        5,
        '16:30',
        NULL
      ),

      (
        'יונתן לוין',
        'גלי הדר – ראשון לציון',
        'צעירה',
        3,
        '16:30',
        NULL
      ),
      (
        'יונתן לוין',
        'גלי הדר – ראשון לציון',
        'צעירה',
        5,
        '16:30',
        NULL
      ),

      (
        'ארטיום גוסקוב',
        'גלי הדר – ראשון לציון',
        'צעירה',
        3,
        '16:30',
        NULL
      ),
      (
        'ארטיום גוסקוב',
        'גלי הדר – ראשון לציון',
        'צעירה',
        5,
        '16:30',
        NULL
      ),

      (
        'דניאל מגד',
        'גלי הדר – ראשון לציון',
        'צעירה',
        1,
        '16:30',
        NULL
      ),
      (
        'דניאל מגד',
        'גלי הדר – ראשון לציון',
        'צעירה',
        4,
        '16:30',
        NULL
      ),
      (
        'דניאל מגד',
        'גלי הדר – ראשון לציון',
        'צעירה',
        5,
        '16:30',
        NULL
      ),

      /*
       * עתודה
       */
      (
        'יובל דוכובני',
        'גלי הדר – ראשון לציון',
        'עתודה',
        1,
        '17:00',
        NULL
      ),
      (
        'יובל דוכובני',
        'גלי הדר – ראשון לציון',
        'עתודה',
        5,
        '18:00',
        NULL
      ),

      (
        'אמיר וייס',
        'גלי הדר – ראשון לציון',
        'עתודה',
        1,
        '17:00',
        NULL
      ),
      (
        'אמיר וייס',
        'גלי הדר – ראשון לציון',
        'עתודה',
        5,
        '18:00',
        NULL
      ),

      (
        'שי-לי שושן',
        'גלי הדר – ראשון לציון',
        'עתודה',
        1,
        '17:00',
        NULL
      ),
      (
        'שי-לי שושן',
        'גלי הדר – ראשון לציון',
        'עתודה',
        3,
        '18:00',
        NULL
      ),
      (
        'שי-לי שושן',
        'גלי הדר – ראשון לציון',
        'עתודה',
        4,
        '17:00',
        NULL
      ),

      (
        'מילי מועלם',
        'גלי הדר – ראשון לציון',
        'עתודה',
        1,
        '17:00',
        'כמו שי-לי'
      ),
      (
        'מילי מועלם',
        'גלי הדר – ראשון לציון',
        'עתודה',
        3,
        '18:00',
        'כמו שי-לי'
      ),
      (
        'מילי מועלם',
        'גלי הדר – ראשון לציון',
        'עתודה',
        4,
        '17:00',
        'כמו שי-לי'
      ),

      (
        'יונתן מילבסקי',
        'גלי הדר – ראשון לציון',
        'עתודה',
        1,
        '17:00',
        'כמו שי-לי'
      ),
      (
        'יונתן מילבסקי',
        'גלי הדר – ראשון לציון',
        'עתודה',
        3,
        '18:00',
        'כמו שי-לי'
      ),
      (
        'יונתן מילבסקי',
        'גלי הדר – ראשון לציון',
        'עתודה',
        4,
        '17:00',
        'כמו שי-לי'
      ),

      /*
       * מתחילים ראשון 16
       */
      (
        'מריה וייזר',
        'גלי הדר – ראשון לציון',
        'מתחילים',
        1,
        '16:00',
        NULL
      ),

      /*
       * ראשון / רביעי 16
       */
      (
        'שירה קנדלקר',
        'גלי הדר – ראשון לציון',
        'מתחילים',
        1,
        '16:00',
        'ראשון או רביעי'
      ),
      (
        'שירה קנדלקר',
        'גלי הדר – ראשון לציון',
        'מתחילים',
        4,
        '16:00',
        'ראשון או רביעי'
      ),

      (
        'נבו אמסלם',
        'גלי הדר – ראשון לציון',
        'מתחילים',
        4,
        '16:00',
        NULL
      ),
      (
        'בן מילמן',
        'גלי הדר – ראשון לציון',
        'מתחילים',
        4,
        '16:00',
        NULL
      ),

      /*
       * קטנים 17
       */
      (
        'מיכל לוקובסקי',
        'גלי הדר – ראשון לציון',
        'קטנים',
        4,
        '17:00',
        NULL
      ),
      (
        'מיכל לוקובסקי',
        'גלי הדר – ראשון לציון',
        'קטנים',
        3,
        '18:00',
        NULL
      ),

      (
        'אימרי גולריז',
        'גלי הדר – ראשון לציון',
        'קטנים',
        1,
        '17:00',
        NULL
      ),
      (
        'אימרי גולריז',
        'גלי הדר – ראשון לציון',
        'קטנים',
        4,
        '17:00',
        NULL
      ),

      (
        'כריסטופר אלפרין',
        'גלי הדר – ראשון לציון',
        'קטנים',
        4,
        '17:00',
        NULL
      ),

      (
        'רוי לנצנר',
        'גלי הדר – ראשון לציון',
        'קטנים',
        1,
        '17:00',
        NULL
      ),
      (
        'רוי לנצנר',
        'גלי הדר – ראשון לציון',
        'קטנים',
        3,
        '18:00',
        NULL
      ),

      /*
       * 17:00 – ללא תווית נוספת
       */
      (
        'אופק מזוז',
        'גלי הדר – ראשון לציון',
        '17:00',
        1,
        '17:00',
        NULL
      ),
      (
        'אופק מזוז',
        'גלי הדר – ראשון לציון',
        '17:00',
        4,
        '17:00',
        NULL
      ),

      (
        'איתן סבן',
        'גלי הדר – ראשון לציון',
        '17:00',
        1,
        '17:00',
        NULL
      ),
      (
        'איתן סבן',
        'גלי הדר – ראשון לציון',
        '17:00',
        4,
        '17:00',
        NULL
      ),

      (
        'אלמוג דור',
        'גלי הדר – ראשון לציון',
        '17:00',
        1,
        '17:00',
        NULL
      ),

      (
        'אופיר מעוז',
        'גלי הדר – ראשון לציון',
        '17:00',
        4,
        '17:00',
        NULL
      ),
      (
        'אופיר מעוז',
        'גלי הדר – ראשון לציון',
        '18:00',
        3,
        '18:00',
        NULL
      ),

      /*
       * גדולים 18
       */
      (
        'עידו ברודר',
        'גלי הדר – ראשון לציון',
        'גדולים',
        1,
        '18:00',
        NULL
      ),
      (
        'עידו ברודר',
        'גלי הדר – ראשון לציון',
        'גדולים',
        4,
        '18:00',
        NULL
      ),

      (
        'יסמין וולוכוב',
        'גלי הדר – ראשון לציון',
        'גדולים',
        1,
        '18:00',
        NULL
      ),
      (
        'יסמין וולוכוב',
        'גלי הדר – ראשון לציון',
        'גדולים',
        4,
        '18:00',
        NULL
      ),

      (
        'שון יזבין',
        'גלי הדר – ראשון לציון',
        'גדולים',
        1,
        '18:00',
        NULL
      ),
      (
        'שון יזבין',
        'גלי הדר – ראשון לציון',
        'גדולים',
        4,
        '18:00',
        NULL
      ),

      (
        'גבריאל טטרב',
        'גלי הדר – ראשון לציון',
        'גדולים',
        1,
        '18:00',
        NULL
      ),
      (
        'גבריאל טטרב',
        'גלי הדר – ראשון לציון',
        'גדולים',
        4,
        '18:00',
        NULL
      ),

      /*
       * איתן סבן – השיוך הנוסף ששלחת
       */
      (
        'איתן סבן',
        'גלי הדר – ראשון לציון',
        'גדולים',
        3,
        '18:00',
        'שיוך נוסף לפי הרשימה'
      ),
      (
        'איתן סבן',
        'גלי הדר – ראשון לציון',
        'גדולים',
        4,
        '18:00',
        'שיוך נוסף לפי הרשימה'
      ),

      /*
       * 18:00 – ללא תווית ברורה
       */
      (
        'רות יוסף',
        'גלי הדר – ראשון לציון',
        '18:00',
        3,
        '18:00',
        NULL
      ),

      (
        'אביה אנתבי',
        'גלי הדר – ראשון לציון',
        '18:00',
        2,
        '18:00',
        NULL
      ),
      (
        'אביה אנתבי',
        'גלי הדר – ראשון לציון',
        '18:00',
        3,
        '18:00',
        NULL
      ),

      (
        'אריאל ניניו',
        'גלי הדר – ראשון לציון',
        '18:00',
        2,
        '18:00',
        NULL
      ),
      (
        'אריאל ניניו',
        'גלי הדר – ראשון לציון',
        '18:00',
        5,
        '18:00',
        NULL
      )

    ON CONFLICT (
      trainee_name,
      branch,
      day_of_week,
      start_time,
      group_label
    )
    DO UPDATE SET
      notes = EXCLUDED.notes,
      active = TRUE,
      updated_at = NOW()
  `);

  /*
   * =========================================================
   * שמות עם קבוצה ידועה אבל בלי ימים מדויקים
   *
   * נשמור אותם בנפרד, ולא נמציא יום אימון.
   * =========================================================
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainee_group_profiles (
      id BIGSERIAL PRIMARY KEY,

      trainee_name TEXT NOT NULL,

      branch TEXT NOT NULL,

      group_label TEXT NOT NULL,

      notes TEXT,

      active BOOLEAN NOT NULL DEFAULT TRUE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (
        trainee_name,
        branch,
        group_label
      )
    )
  `);

  await pool.query(`
    INSERT INTO trainee_group_profiles (
      trainee_name,
      branch,
      group_label,
      notes
    )
    VALUES
      (
        'רבזון עילאי',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        NULL
      ),
      (
        'רז לזרסקי',
        'גלי הדר – ראשון לציון',
        'צעירה',
        NULL
      ),
      (
        'מילי אנגר',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        NULL
      ),
      (
        'תומר יוספזון',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        NULL
      ),
      (
        'רועי אלקינד',
        'גלי הדר – ראשון לציון',
        'צעירה',
        NULL
      ),
      (
        'אריאל דדי',
        'גלי הדר – ראשון לציון',
        'עתודה',
        NULL
      ),
      (
        'סתיו טנסקי',
        'גלי הדר – ראשון לציון',
        'צעירה',
        NULL
      ),
      (
        'זהר קלופר',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        NULL
      ),
      (
        'אופיר אריאל כהן',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        NULL
      )
    ON CONFLICT (
      trainee_name,
      branch,
      group_label
    )
    DO UPDATE SET
      notes = EXCLUDED.notes,
      active = TRUE,
      updated_at = NOW()
  `);

  /*
   * =========================================================
   * בוגרת – ימים שכן צוינו
   * =========================================================
   */

  await pool.query(`
    INSERT INTO trainee_training_slots (
      trainee_name,
      branch,
      group_label,
      day_of_week,
      start_time,
      notes
    )
    VALUES
      (
        'איתן פראן',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        5,
        '16:30',
        NULL
      ),
      (
        'אוהד פראן',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        5,
        '16:30',
        NULL
      ),
      (
        'אורי רבינוביץ',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        3,
        '16:30',
        NULL
      ),
      (
        'אורי רבינוביץ',
        'גלי הדר – ראשון לציון',
        'בוגרת',
        5,
        '16:30',
        NULL
      )
    ON CONFLICT (
      trainee_name,
      branch,
      day_of_week,
      start_time,
      group_label
    )
    DO UPDATE SET
      notes = EXCLUDED.notes,
      active = TRUE,
      updated_at = NOW()
  `);

  /*
   * =========================================================
   * מבוטלים זמנית
   * =========================================================
   */

  await pool.query(`
    INSERT INTO trainee_group_profiles (
      trainee_name,
      branch,
      group_label,
      notes,
      active
    )
    VALUES (
      'Bini Krug',
      'גלי הדר – ראשון לציון',
      'לא פעיל',
      'מבוטל בינתיים',
      FALSE
    )
    ON CONFLICT (
      trainee_name,
      branch,
      group_label
    )
    DO UPDATE SET
      notes = EXCLUDED.notes,
      active = FALSE,
      updated_at = NOW()
  `);

  console.log(
    "✅ PostgreSQL tables are ready"
  );

  console.log(
    "✅ Attendance groups and trainees are ready"
  );

  console.log(
    "✅ Gali Hadar training slots are ready"
  );
}

module.exports = {
  pool,
  initializeDatabase,
};