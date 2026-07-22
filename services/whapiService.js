const axios = require("axios");

async function sendWhatsAppMessage(to, body) {
  if (!to || !body) {
    throw new Error("Missing WhatsApp recipient or message body");
  }

  const response = await axios.post(
    "https://gate.whapi.cloud/messages/text",
    {
      to,
      body,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

module.exports = {
  sendWhatsAppMessage,
};