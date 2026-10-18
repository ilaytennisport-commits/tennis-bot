const express = require("express");

const {
  handleAttendancePage,
  handleAttendanceExcel,
} = require("../services/attendanceViewService");

const router = express.Router();

/*
 * שגיאה בדף לא חושפת פרטים פנימיים.
 */
function safe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("❌ שגיאה בדף הנוכחות:", error.message);

      if (!res.headersSent) {
        res.status(500).send("שגיאה זמנית, נסו לרענן בעוד רגע.");
      }
    }
  };
}

router.get("/:token", safe(handleAttendancePage));
router.get("/:token/excel", safe(handleAttendanceExcel));

module.exports = router;
