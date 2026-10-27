const express = require("express");

const {
  handlePage,
  handleAdd,
  handleUpdate,
  handleDelete,
} = require("../services/workloadService");

const router = express.Router();

/*
 * שגיאה בדף לא חושפת פרטים פנימיים.
 */
function safe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בדף תחומי העבודה:", error.message);

      if (!res.headersSent) {
        res.status(500).json({ ok: false });
      }
    }
  };
}

router.get("/:token", safe(handlePage));
router.post("/:token/areas", safe(handleAdd));
router.post("/:token/areas/:id", safe(handleUpdate));
router.post("/:token/areas/:id/delete", safe(handleDelete));

module.exports = router;
