require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("🎾 Tennis Bot עובד!");
});

app.get("/test-ai", async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "כתוב בעברית משפט קצר: החיבור ל-OpenAI עובד.",
    });

    res.send(response.output_text);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("שגיאה בחיבור ל-OpenAI");
  }
});

app.get("/test-whatsapp", async (req, res) => {
  try {
   const whapiResponse = await axios.post(
      "https://gate.whapi.cloud/messages/text",
      {
        to: "972505209997",
        body: "🎾 בדיקת חיבור: הבוט שלנו מחובר ל-Whapi!",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(whapiResponse.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: "שליחת ההודעה נכשלה",
      details: error.response?.data || error.message,
    });
  }
});
app.post("/webhook", (req, res) => {
  console.log("📩 התקבל Webhook מ-Whapi:");
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).json({
    success: true,
    message: "Webhook received",
  });
});

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});