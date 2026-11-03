const express = require("express");

const {
  handlePage,
  handleSave,
} = require("../services/playerDiaryService");

const router = express.Router();

function safe(handler, asJson = false) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה ביומן האימון:", error.message);

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
router.post("/:token/save", safe(handleSave, true));

module.exports = router;
