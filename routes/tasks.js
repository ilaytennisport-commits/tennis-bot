const express = require("express");

const {
  handleBoard,
  handleAdd,
  handleEdit,
  handleStatus,
  handleDelete,
} = require("../services/taskBoardService");

const router = express.Router();

/*
 * שגיאה בדף לא חושפת פרטים פנימיים.
 */
function safe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בדף המשימות:", error.message);

      if (!res.headersSent) {
        res
          .status(500)
          .type("html")
          .send(
            '<meta charset="utf-8"><p dir="rtl" style="font-family:Arial;padding:20px">שגיאה זמנית — השינוי לא נשמר. חזרו אחורה ונסו שוב בעוד רגע.</p>'
          );
      }
    }
  };
}

const form = express.urlencoded({ extended: false, limit: "50kb" });

router.get("/:token", safe(handleBoard));
router.post("/:token/add", form, safe(handleAdd));
router.post("/:token/task/:id/edit", form, safe(handleEdit));
router.post("/:token/task/:id/status", form, safe(handleStatus));
router.post("/:token/task/:id/delete", form, safe(handleDelete));

module.exports = router;
