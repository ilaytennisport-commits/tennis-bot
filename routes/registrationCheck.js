const express = require("express");

const {
  handleCheckPage,
} = require("../services/registrationCheckService");

const router = express.Router();

router.get("/:token", async (req, res) => {
  try {
    await handleCheckPage(req, res);
  } catch (error) {
    console.error("❌ שגיאה בדף נוכחים לא רשומים:", error.message);

    if (!res.headersSent) {
      res
        .status(500)
        .type("html")
        .send(
          '<meta charset="utf-8"><p dir="rtl" style="font-family:Arial;padding:20px">שגיאה זמנית — נסו לרענן בעוד רגע.</p>'
        );
    }
  }
});

module.exports = router;
