const axios = require("axios");

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

  console.log("📤 שולח הודעת WhatsApp:", {
    originalRecipient: to,
    normalizedRecipient: recipient,
    bodyLength: body.length,
  });

  try {
    const response = await axios.post(
      "https://gate.whapi.cloud/messages/text",
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

    console.log("✅ תשובת Whapi:", {
      recipient,
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("❌ שגיאת Whapi:", {
      recipient,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });

    throw error;
  }
}

module.exports = {
  sendWhatsAppMessage,
};