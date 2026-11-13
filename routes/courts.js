const express = require("express");

const {
  handlePage,
  handleSave,
  handleDelete,
  handleCopy,
} = require("../services/courtsBoardService");

const router = express.Router();

function safe(handler, asJson = false) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בלוח המגרשים:", error.message);

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
router.post("/:token/slot", safe(handleSave, true));
router.post("/:token/slot/:id/delete", safe(handleDelete, true));
router.post("/:token/copy", safe(handleCopy, true));

module.exports = router;
