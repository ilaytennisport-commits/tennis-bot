const { pool } = require("./databaseService");

const {
  sendWhatsAppMessage,
} = require("./whapiService");

const {
  getManagerPhones,
} = require("./attendanceService");

/*
 * =========================================================
 * הגנה מטיפול כפול באותה הודעה
 * =========================================================
 *
 * Whapi עלול לשלוח את אותה הודעה יותר מפעם אחת.
 * שומרים את מזהה ההודעה במסד הנתונים, כך שההגנה
 * נשמרת גם אחרי הפעלה מחדש של השרת.
 */

const memoryProcessedIds = new Set();
const MAX_MEMORY_IDS = 5000;

function rememberInMemory(messageId) {
  memoryProcessedIds.add(messageId);

  if (memoryProcessedIds.size > MAX_MEMORY_IDS) {
    memoryProcessedIds.delete(
      memoryProcessedIds.values().next().value
    );
  }
}

/*
 * מחזיר true אם ההודעה חדשה (וסומנה עכשיו כמטופלת),
 * false אם כבר טופלה.
 */
async function claimMessage(messageId) {
  if (!messageId) {
    return true;
  }

  if (memoryProcessedIds.has(messageId)) {
    return false;
  }

  rememberInMemory(messageId);

  try {
    const result = await pool.query(
      `
        INSERT INTO processed_messages (message_id)
        VALUES ($1)
        ON CONFLICT (message_id) DO NOTHING
        RETURNING message_id
      `,
      [String(messageId)]
    );

    /*
     * בקונפליקט (הודעה שכבר טופלה) Postgres לא מחזיר שורה.
     */
    return result.rows.length > 0;
  } catch (error) {
    /*
     * אם מסד הנתונים לא זמין — ממשיכים עם ההגנה בזיכרון.
     */
    console.error(
      "⚠️ לא ניתן לבדוק כפילות הודעה במסד הנתונים:",
      error.message
    );

    return true;
  }
}

async function cleanupProcessedMessages(days = 7) {
  const result = await pool.query(
    `
      DELETE FROM processed_messages
      WHERE created_at < NOW() - ($1::TEXT || ' days')::INTERVAL
    `,
    [String(days)]
  );

  return result.rowCount;
}

/*
 * =========================================================
 * הגבלת קצב לכל לקוח
 * =========================================================
 *
 * מונע מלקוח (או מתקפה) להציף את הבוט ואת OpenAI.
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_MESSAGES = 25;
const rateBuckets = new Map();

function checkRateLimit(userId, now = Date.now()) {
  const bucket = rateBuckets.get(userId) || {
    windowStart: now,
    count: 0,
    warned: false,
  };

  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    bucket.windowStart = now;
    bucket.count = 0;
    bucket.warned = false;
  }

  bucket.count += 1;
  rateBuckets.set(userId, bucket);

  if (bucket.count <= RATE_LIMIT_MAX_MESSAGES) {
    return { allowed: true };
  }

  const shouldWarn = !bucket.warned;
  bucket.warned = true;

  return {
    allowed: false,
    shouldWarn,
  };
}

/*
 * =========================================================
 * התראה למנהלים על תקלה
 * =========================================================
 *
 * לכל היותר התראה אחת ברבע שעה, כדי לא להציף.
 */

const ALERT_INTERVAL_MS = 15 * 60 * 1000;
let lastAlertAt = 0;

async function notifyManagersOfError(
  description,
  now = Date.now()
) {
  if (now - lastAlertAt < ALERT_INTERVAL_MS) {
    return false;
  }

  lastAlertAt = now;

  const managerPhones = getManagerPhones();

  if (managerPhones.length === 0) {
    return false;
  }

  const message = [
    "⚠️ תקלה בבוט ה-WhatsApp",
    "",
    description,
    "",
    "הלקוח קיבל הודעה שנחזור אליו. כדאי לבדוק את השיחה.",
  ].join("\n");

  for (const phone of managerPhones) {
    try {
      await sendWhatsAppMessage(phone, message);
    } catch (error) {
      console.error(
        "❌ שליחת התראת תקלה נכשלה:",
        error.message
      );
    }
  }

  return true;
}

function resetReliabilityStateForTests() {
  memoryProcessedIds.clear();
  rateBuckets.clear();
  lastAlertAt = 0;
}

module.exports = {
  claimMessage,
  cleanupProcessedMessages,
  checkRateLimit,
  notifyManagersOfError,
  resetReliabilityStateForTests,
  RATE_LIMIT_MAX_MESSAGES,
};
