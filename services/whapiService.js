const axios = require("axios");

const { maskId } = require("../utils/whatsappIds");

const WHAPI_URL =
  process.env.WHAPI_API_URL ||
  "https://gate.whapi.cloud";

const MAX_ATTEMPTS = 3;

/*
 * מזהי הודעות שהבוט עצמו שלח לאחרונה.
 * Whapi מחזיר גם אותן ב-Webhook (from_me),
 * וכך מבדילים בינן לבין תשובה ידנית של הצוות.
 */
const recentBotMessageIds = new Map();
const RECENT_BOT_MESSAGE_TTL_MS =
  10 * 60 * 1000;

function rememberBotMessage(messageId) {
  if (!messageId) {
    return;
  }

  const now = Date.now();

  recentBotMessageIds.set(messageId, now);

  for (const [id, sentAt] of recentBotMessageIds) {
    if (now - sentAt > RECENT_BOT_MESSAGE_TTL_MS) {
      recentBotMessageIds.delete(id);
    } else {
      break;
    }
  }
}

function isRecentBotMessage(messageId) {
  return Boolean(
    messageId &&
      recentBotMessageIds.has(messageId)
  );
}

/*
 * גם את תוכן ההודעה שומרים לפני השליחה:
 * לפעמים ה-Webhook של ההודעה שלנו מגיע לפני
 * שהתקבל מזהה ההודעה מ-Whapi.
 */
const recentBotBodies = new Map();

function chatKey(chatId = "") {
  return String(chatId)
    .split("@")[0]
    .replace(/\D/g, "");
}

function rememberOutgoingBody(recipient, body) {
  const key = `${chatKey(recipient)}|${String(body).trim()}`;
  const now = Date.now();

  recentBotBodies.set(key, now);

  for (const [entry, sentAt] of recentBotBodies) {
    if (now - sentAt > RECENT_BOT_MESSAGE_TTL_MS) {
      recentBotBodies.delete(entry);
    } else {
      break;
    }
  }
}

/*
 * האם הודעת from_me שהגיעה ב-Webhook נשלחה ע"י הבוט עצמו.
 */
function isBotEcho(message = {}) {
  if (isRecentBotMessage(message.id)) {
    return true;
  }

  if (message.source === "api") {
    return true;
  }

  const body = message.text?.body;

  if (!body) {
    return false;
  }

  return recentBotBodies.has(
    `${chatKey(message.chat_id)}|${String(body).trim()}`
  );
}

function normalizeWhatsAppRecipient(to) {
  const value = String(to || "").trim();

  if (!value) {
    return "";
  }

  // אם כבר התקבל Chat ID מלא, לא משנים אותו.
  if (value.includes("@")) {
    return value;
  }

  // משאירים ספרות בלבד.
  let digits = value.replace(/\D/g, "");

  // המרה ממספר ישראלי מקומי לפורמט בינלאומי.
  if (digits.startsWith("0")) {
    digits = `972${digits.substring(1)}`;
  }

  return digits;
}

function isRetryableError(error) {
  const status = error.response?.status;

  if (!status) {
    // שגיאת רשת / timeout
    return true;
  }

  return status === 429 || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function sendWhatsAppMessage(to, body) {
  const recipient = normalizeWhatsAppRecipient(to);

  if (!recipient || !body) {
    throw new Error(
      "Missing WhatsApp recipient or message body"
    );
  }

  if (!process.env.WHAPI_TOKEN) {
    throw new Error(
      "WHAPI_TOKEN is not defined"
    );
  }

  rememberOutgoingBody(recipient, body);

  let lastError;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response = await axios.post(
        `${WHAPI_URL}/messages/text`,
        {
          to: recipient,
          body,
        },
        {
          headers: {
            Authorization:
              `Bearer ${process.env.WHAPI_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      const messageId =
        response.data?.message?.id ||
        response.data?.id ||
        null;

      rememberBotMessage(messageId);

      console.log("📤 הודעת WhatsApp נשלחה:", {
        recipient: maskId(recipient),
        status: response.status,
        bodyLength: body.length,
        attempt,
      });

      return response.data;
    } catch (error) {
      lastError = error;

      console.error("❌ שגיאת Whapi:", {
        recipient: maskId(recipient),
        status: error.response?.status,
        message: error.message,
        attempt,
      });

      if (
        attempt < MAX_ATTEMPTS &&
        isRetryableError(error)
      ) {
        await wait(1000 * attempt);
        continue;
      }

      break;
    }
  }

  throw lastError;
}

module.exports = {
  sendWhatsAppMessage,
  normalizeWhatsAppRecipient,
  isRecentBotMessage,
  rememberBotMessage,
  isBotEcho,
};
