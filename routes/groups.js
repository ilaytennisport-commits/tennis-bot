const express = require("express");

const {
  handlePage,
  handleChange,
} = require("../services/groupsManagerService");

const router = express.Router();

/*
 * שגיאה בדף לא חושפת פרטים פנימיים.
 */
function safe(handler, asJson = false) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בדף ניהול הקבוצות:", error.message);

      if (res.headersSent) {
        return;
      }

      if (asJson) {
        res.status(500).json({ ok: false });
      } else {
        res
          .status(500)
          .type("html")
          .send(
            '<meta charset="utf-8"><p dir="rtl" style="font-family:Arial;padding:20px">שגיאה זמנית — נסו לרענן בעוד רגע.</p>'
          );
      }
    }
  };
}

router.get("/:token", safe(handlePage));
router.post("/:token/change", safe(handleChange, true));

module.exports = router;
