const { pool } = require("./databaseService");

const {
  sendWhatsAppMessage,
} = require("./whapiService");

const {
  getManagerPhones,
  getStaffName,
} = require("./attendanceService");

const { hasValue, looksLikeQuestion } = require("../utils/text");

const {
  isLeadComplete,
} = require("./leadConversationService");

/*
 * =========================================================
 * לידים
 * =========================================================
 *
 * כל ליד נשמר קודם בטבלת leads, ורק אחר כך נשלח.
 * אם השליחה נכשלה — הליד נשאר בסטטוס failed,
 * ו-retryPendingLeads ינסה שוב כל כמה דקות.
 */

const MAX_LEAD_ATTEMPTS = 10;
const MAX_CONVERSATION_CHARS = 3500;

/*
 * ליד רגיל מוכן לשליחה כאשר יש שם, גיל, סניף, טלפון
 * ומטרת פנייה (המטרה נקבעת אוטומטית בכל כניסה למסלול הליד).
 */
function isLeadReadyToSend(user = {}) {
  return (
    isLeadComplete(user) &&
    hasValue(user.goal)
  );
}

/*
 * למי נשלחים לידים:
 * CLUB_MANAGER_PHONE (מנהל הלידים), ואם לא הוגדר — כל המנהלים.
 */
function getLeadRecipients() {
  if (process.env.CLUB_MANAGER_PHONE) {
    return process.env.CLUB_MANAGER_PHONE
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return getManagerPhones();
}

function toWhatsAppLink(phone = "") {
  const value = String(phone || "");
  let digits = value.replace(/\D/g, "");

  if (!digits) {
    return "לא זמין";
  }

  if (digits.startsWith("0")) {
    digits = `972${digits.substring(1)}`;
  }

  return `https://wa.me/${digits}`;
}

function formatReceivedAt(date = new Date()) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/*
 * השיחה לליד — מהסוף להתחלה, עד גבול תווים,
 * כדי שההודעה למנהל לא תהיה ארוכה מדי.
 */
function formatConversation(
  conversationHistory = []
) {
  const parts = conversationHistory
    .filter(
      (message) =>
        message?.content &&
        ["user", "assistant"].includes(message.role)
    )
    .map(
      (message) =>
        `${message.role === "user" ? "👤 לקוח" : "🤖 בוט"}:\n${message.content}`
    );

  const selected = [];
  let length = 0;

  for (
    let index = parts.length - 1;
    index >= 0;
    index -= 1
  ) {
    length += parts[index].length + 2;

    if (
      length > MAX_CONVERSATION_CHARS &&
      selected.length > 0
    ) {
      selected.unshift("… (תחילת השיחה קוצרה)");
      break;
    }

    selected.unshift(parts[index]);
  }

  return selected.join("\n\n");
}

const SOURCE_NAMES = {
  move: "MOVE",
  amit: "עמית",
  freefit: "FreeFit",
  shikumi: "שיקומי",
};

/*
 * =========================================================
 * סיכום הפנייה — הודעה מוכנה שהמנהל שולח ללקוח
 * =========================================================
 *
 * בוואטסאפ אין הערה פרטית בתוך צ'אט, ולכן הסיכום נכנס לשיחה של
 * המנהל עם הלקוח כהודעה אליו: קישור wa.me עם טקסט מוכן לעריכה.
 */

const MAX_QUESTION_CHARS = 90;

function customerQuestions(conversationHistory = []) {
  return conversationHistory
    .filter(
      (message) =>
        message?.role === "user" &&
        typeof message.content === "string" &&
        looksLikeQuestion(message.content)
    )
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 4)
    .slice(-2)
    .map((text) =>
      text.length > MAX_QUESTION_CHARS
        ? `${text.slice(0, MAX_QUESTION_CHARS - 1)}…`
        : text
    );
}

function buildLeadIntroText({
  user,
  kind = "regular",
  conversationHistory = [],
  senderName = null,
}) {
  const isSpecial = kind === "special";
  const sender = senderName && senderName !== "מנהל" ? `כאן ${senderName} ` : "כאן ";

  const details = [
    user.name ? `• מתאמן/ת: ${user.name}` : null,
    user.age ? `• גיל: ${user.age}` : null,
    isSpecial && user.city ? `• עיר: ${user.city}` : null,
    !isSpecial && user.branch ? `• סניף: ${user.branch}` : null,
    isSpecial ? `• הגעת דרך: ${SOURCE_NAMES[user.source] || user.source}` : null,
    isSpecial && user.experience ? `• ניסיון: ${user.experience}` : null,
    !isSpecial && user.goal ? `• תחום התעניינות: ${user.goal}` : null,
    ...customerQuestions(conversationHistory).map((question) => `• שאלת: ${question}`),
  ].filter(Boolean);

  return [
    `היי, ${sender}מהאקדמיה לטניס גלי הדר 🎾`,
    "",
    "קיבלתי את הפנייה שלך:",
    ...details,
    "",
    "אשמח לעזור, מתי נוח לדבר?",
  ].join("\n");
}

function toWhatsAppLinkWithText(phone = "", text = "") {
  const link = toWhatsAppLink(phone);

  return link.startsWith("https://")
    ? `${link}?text=${encodeURIComponent(text)}`
    : null;
}

function formatManagerLeadMessage({
  user,
  kind = "regular",
  conversationHistory = [],
  receivedAt = new Date(),
}) {
  const divider = "━━━━━━━━━━━━━━━━━━";

  const isSpecial = kind === "special";

  const title = isSpecial
    ? `🎾 נרשם/ה חדש/ה דרך ${SOURCE_NAMES[user.source] || user.source}`
    : "🎾 ליד חדש מהבוט";

  const leadRecipient = getLeadRecipients()[0];
  const summaryLink = toWhatsAppLinkWithText(
    user.phone,
    buildLeadIntroText({
      user,
      kind,
      conversationHistory,
      senderName: leadRecipient ? getStaffName(leadRecipient) : null,
    })
  );

  const detailLines = isSpecial
    ? [
        `👤 שם: ${user.name}`,
        `🎂 גיל: ${user.age}`,
        `🏙️ עיר: ${user.city}`,
        `🎾 ניסיון: ${user.experience}`,
        `📍 סניף: ${user.branch || "גלי הדר – ראשון לציון"}`,
        `📞 טלפון: ${user.phone || "לא ידוע"}`,
      ]
    : [
        `👤 שם: ${user.name}`,
        `🎂 גיל: ${user.age}`,
        `📍 סניף: ${user.branch}`,
        `📞 טלפון: ${user.phone}`,
        `🎯 תחום התעניינות: ${user.goal || "לא צוין"}`,
      ];

  return [
    title,
    "",
    divider,
    "",
    ...detailLines,
    `🕒 התקבל: ${formatReceivedAt(receivedAt)}`,
    "",
    divider,
    "",
    "💬 השיחה עם הלקוח:",
    "",
    formatConversation(conversationHistory) ||
      "לא קיימת היסטוריית שיחה.",
    "",
    divider,
    "",
    ...(summaryLink
      ? ["💬 לפתיחת שיחה עם הלקוח כולל סיכום הפנייה:", summaryLink, ""]
      : []),
    summaryLink ? "📲 שיחה בלי סיכום:" : "📲 לפתיחת שיחה עם הלקוח:",
    toWhatsAppLink(user.phone),
  ].join("\n");
}

async function deliverLead(lead) {
  const recipients = getLeadRecipients();

  if (recipients.length === 0) {
    throw new Error(
      "No lead recipients configured (CLUB_MANAGER_PHONE / MANAGER_PHONES)"
    );
  }

  const errors = [];

  for (const recipient of recipients) {
    try {
      await sendWhatsAppMessage(
        recipient,
        lead.message
      );
    } catch (error) {
      errors.push(error.message);
    }
  }

  /*
   * מספיק שמנהל אחד קיבל את הליד.
   */
  if (errors.length === recipients.length) {
    throw new Error(errors.join(" | "));
  }
}

async function markLead(
  leadId,
  { status, error = null }
) {
  await pool.query(
    `
      UPDATE leads
      SET
        status = $2,
        attempts = attempts + 1,
        last_error = $3,
        sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
      WHERE id = $1
    `,
    [leadId, status, error]
  );
}

async function attemptDelivery(lead) {
  try {
    await deliverLead(lead);
    await markLead(lead.id, { status: "sent" });

    console.log("✅ ליד נשלח למנהל:", {
      leadId: lead.id,
    });

    return true;
  } catch (error) {
    await markLead(lead.id, {
      status: "failed",
      error: String(error.message).slice(0, 500),
    });

    console.error("❌ שליחת ליד נכשלה, ננסה שוב:", {
      leadId: lead.id,
      message: error.message,
    });

    return false;
  }
}

/*
 * שומר ליד ומנסה לשלוח אותו מיד.
 * מחזיר את רשומת הליד (גם אם השליחה נכשלה — הליד לא אבד).
 */
async function createLead({
  userId,
  user,
  kind = "regular",
  conversationHistory = [],
}) {
  const message = formatManagerLeadMessage({
    user,
    kind,
    conversationHistory,
  });

  const details = {
    name: user.name ?? null,
    age: user.age ?? null,
    branch: user.branch ?? null,
    phone: user.phone ?? null,
    goal: user.goal ?? null,
    city: user.city ?? null,
    experience: user.experience ?? null,
    source: user.source ?? null,
  };

  const result = await pool.query(
    `
      INSERT INTO leads (
        user_id,
        kind,
        message,
        details
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, kind, message
    `,
    [userId, kind, message, details]
  );

  const lead = result.rows[0];

  const sent = await attemptDelivery(lead);

  return {
    ...lead,
    sent,
  };
}

/*
 * שליחה חוזרת של לידים שנכשלו.
 * רץ כל כמה דקות מתוך server.js.
 */
async function retryPendingLeads() {
  const result = await pool.query(
    `
      SELECT id, user_id, kind, message
      FROM leads
      WHERE status IN ('pending', 'failed')
        AND attempts < $1
        AND updated_at < NOW() - INTERVAL '2 minutes'
      ORDER BY created_at
      LIMIT 20
    `,
    [MAX_LEAD_ATTEMPTS]
  );

  let sentCount = 0;

  for (const lead of result.rows) {
    if (await attemptDelivery(lead)) {
      sentCount += 1;
    }
  }

  return {
    checked: result.rows.length,
    sent: sentCount,
  };
}

module.exports = {
  isLeadReadyToSend,
  getLeadRecipients,
  formatManagerLeadMessage,
  buildLeadIntroText,
  formatConversation,
  createLead,
  retryPendingLeads,
  MAX_LEAD_ATTEMPTS,
};
