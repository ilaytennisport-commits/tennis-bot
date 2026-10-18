const express = require("express");

const {
  handleHome,
  handleSession,
  handleSave,
} = require("../services/coachReportService");

const router = express.Router();

/*
 * שגיאה בדף לא חושפת פרטים פנימיים.
 */
function safe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בדף הדיווח:", error.message);

      if (!res.headersSent) {
        res
          .status(500)
          .type("html")
          .send(
            '<meta charset="utf-8"><p dir="rtl" style="font-family:Arial;padding:20px">שגיאה זמנית — הנוכחות לא נשמרה. נסו שוב בעוד רגע.</p>'
          );
      }
    }
  };
}

router.get("/:token", safe(handleHome));
router.get("/:token/session", safe(handleSession));
router.post(
  "/:token/save",
  express.urlencoded({ extended: false, limit: "100kb" }),
  safe(handleSave)
);

module.exports = router;
