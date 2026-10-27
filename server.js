require("dotenv").config();

const {
  validateConfig,
} = require("./services/configService");

/*
 * בודקים הגדרות לפני שטוענים את שאר הקוד.
 */
const config = validateConfig();

for (const warning of config.warnings) {
  console.warn(`⚠️ ${warning}`);
}

if (config.errors.length > 0) {
  for (const error of config.errors) {
    console.error(`❌ ${error}`);
  }

  process.exit(1);
}

const express = require("express");

const {
  pool,
  initializeDatabase,
} = require("./services/databaseService");

const webhookRouter = require("./routes/webhook");
const attendanceRouter = require("./routes/attendance");
const reportRouter = require("./routes/report");
const leagueRouter = require("./routes/league");
const tasksRouter = require("./routes/tasks");
const workloadRouter = require("./routes/workload");
const registrationCheckRouter = require("./routes/registrationCheck");

const {
  retryPendingLeads,
} = require("./services/leadService");

const {
  cleanupProcessedMessages,
} = require("./services/reliabilityService");

const {
  waitForQueues,
} = require("./controllers/webhookController");

const app = express();
const port = process.env.PORT || 3000;

const {
  runMonthlyReportIfDue,
} = require("./services/attendanceReportService");

const LEAD_RETRY_INTERVAL_MS = 5 * 60 * 1000;
const MONTHLY_REPORT_CHECK_INTERVAL_MS =
  60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use("/webhook", webhookRouter);
app.use("/attendance", attendanceRouter);
app.use("/report", reportRouter);
app.use("/league", leagueRouter);
app.use("/tasks", tasksRouter);

/*
 * כתובות קצרות לקישורים שנשלחים ב-WhatsApp.
 */
app.use("/r", reportRouter);
app.use("/a", attendanceRouter);
app.use("/t", tasksRouter);
app.use("/w", workloadRouter);
app.use("/c", registrationCheckRouter);

/*
 * הלוגו של האקדמיה — לדפים של הבוט.
 */
app.get("/logo.png", (req, res) => {
  res.sendFile(require("path").join(__dirname, "public", "logo.png"), {
    maxAge: "7d",
  });
});

app.get("/", (req, res) => {
  res.send("🎾 Tennis Bot עובד!");
});

/*
 * בדיקת תקינות לשרת ולמסד הנתונים (למשל עבור Railway).
 */
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "ok",
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

const timers = [];

function startBackgroundJobs() {
  timers.push(
    setInterval(async () => {
      try {
        const result = await retryPendingLeads();

        if (result.checked > 0) {
          console.log(
            "🔁 שליחה חוזרת של לידים:",
            result
          );
        }
      } catch (error) {
        console.error(
          "❌ שליחה חוזרת של לידים נכשלה:",
          error.message
        );
      }
    }, LEAD_RETRY_INTERVAL_MS)
  );

  /*
   * דוח נוכחות חודשי — נבדק כל שעה, נשלח פעם אחת ב-1 לחודש.
   */
  timers.push(
    setInterval(async () => {
      try {
        const result =
          await runMonthlyReportIfDue();

        if (result.ran) {
          console.log(
            "📊 דוח נוכחות חודשי:",
            result
          );
        }
      } catch (error) {
        console.error(
          "❌ דוח נוכחות חודשי נכשל:",
          error.message
        );
      }
    }, MONTHLY_REPORT_CHECK_INTERVAL_MS)
  );

  timers.push(
    setInterval(async () => {
      try {
        await cleanupProcessedMessages();
      } catch (error) {
        console.error(
          "❌ ניקוי מזהי הודעות נכשל:",
          error.message
        );
      }
    }, CLEANUP_INTERVAL_MS)
  );
}

let server;

async function shutdown(signal) {
  console.log(`🛑 ${signal} — סוגרים את השרת בצורה מסודרת...`);

  timers.forEach(clearInterval);

  const forceExit = setTimeout(
    () => process.exit(1),
    10000
  );

  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) =>
        server.close(resolve)
      );
    }

    await waitForQueues();
    await pool.end();
  } finally {
    process.exit(0);
  }
}

async function startServer() {
  try {
    await initializeDatabase();

    server = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Server started on port ${port}`);
    });

    startBackgroundJobs();

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error(
      "❌ Failed to initialize the database:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
