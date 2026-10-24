const { pool } = require("./databaseService");

const attendance = require("./attendanceService");

const {
  sendWhatsAppMessage,
} = require("./whapiService");

const { maskId } = require("../utils/whatsappIds");

/*
 * =========================================================
 * ילדים שלא ברשימה (שיעור ניסיון / חדשים)
 * =========================================================
 *
 * מדריך מוסיף בדף הדיווח שם של ילד שלא מופיע ברשימה.
 * כל מנהל מקבל הודעה עם מספר, ועונה:
 *   הוסף 12  → הילד נכנס לרשימה של אותו אימון ומסומן "הגיע"
 *   לא 12    → הבקשה נסגרת
 */

const BRANCH_GALI_HADAR = "גלי הדר – ראשון לציון";
const MAX_EXTRAS = 10;

const DAY_NAMES = {
  1: "ראשון",
  2: "שני",
  3: "שלישי",
  4: "רביעי",
  5: "חמישי",
  6: "שישי",
  7: "שבת",
};

async function createPendingTraineesTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_trainees (
      id BIGSERIAL PRIMARY KEY,
      ref TEXT NOT NULL,
      session_date DATE NOT NULL,
      group_title TEXT,
      trainee_name TEXT NOT NULL,
      notes TEXT,
      submitted_by TEXT,
      submitted_phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      handled_by TEXT,
      handled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/* =========================================================
 * מהטופס של המדריך
 * ========================================================= */

function cleanText(value = "", max = 200) {
  return String(value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/*
 * extra_name_0 / extra_note_0 ... → [{ name, notes }]
 */
function readExtrasFromBody(body = {}) {
  const extras = [];
  const seen = new Set();

  for (let i = 0; i < MAX_EXTRAS; i += 1) {
    const name = cleanText(body[`extra_name_${i}`], 60);

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    extras.push({
      name,
      notes: cleanText(body[`extra_note_${i}`], 300) || null,
    });
  }

  return extras;
}

function formatShortDate(dateString) {
  const [, month, day] = String(dateString).slice(0, 10).split("-");

  return `${Number(day)}/${Number(month)}`;
}

function buildRequestMessage(request) {
  return [
    `🆕 ילד שלא ברשימה (#${request.id})`,
    "",
    `👥 ${request.group_title}`,
    `📅 ${formatShortDate(request.session_date)}`,
    `👤 דווח על ידי: ${request.submitted_by}`,
    "",
    `🧒 ${request.trainee_name}`,
    ...(request.notes ? [`📝 ${request.notes}`] : []),
    "",
    `להוספה לרשימה ענו: הוסף ${request.id}`,
    `אם לא: לא ${request.id}`,
  ].join("\n");
}

async function sendToAllManagers(message) {
  for (const recipient of attendance.getManagerPhones()) {
    try {
      await sendWhatsAppMessage(recipient, message);
    } catch (error) {
      console.error("❌ שליחת בקשת ילד חדש למנהל נכשלה:", {
        recipient: maskId(recipient),
        message: error.message,
      });
    }
  }
}

/*
 * שומר את הילדים שהמדריך הוסיף ושולח לכל המנהלים.
 * ילד שכבר ממתין לאותו אימון ובאותו תאריך לא נשלח שוב.
 */
async function submitExtras({
  ref,
  dateString,
  groupTitle,
  staff,
  extras,
}) {
  const created = [];

  for (const extra of extras) {
    const existing = await pool.query(
      `
        SELECT id FROM pending_trainees
        WHERE ref = $1
          AND session_date = $2::DATE
          AND trainee_name = $3
          AND status = 'pending'
      `,
      [ref, dateString, extra.name]
    );

    if (existing.rows[0]) {
      continue;
    }

    const result = await pool.query(
      `
        INSERT INTO pending_trainees (
          ref,
          session_date,
          group_title,
          trainee_name,
          notes,
          submitted_by,
          submitted_phone
        )
        VALUES ($1, $2::DATE, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        ref,
        dateString,
        groupTitle,
        extra.name,
        extra.notes,
        staff.name,
        attendance.normalizePhone(staff.phone),
      ]
    );

    created.push(result.rows[0]);
  }

  for (const request of created) {
    await sendToAllManagers(buildRequestMessage(request));
  }

  return created;
}

/* =========================================================
 * תשובת המנהל
 * ========================================================= */

/*
 * "הוסף 12" / "תוסיף 12" / "לא 12" / "דחה 12" / "ממתינים"
 */
function parsePendingReply(message = "") {
  const text = String(message)
    .replace(/[!.?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:ממתינים|ילדים ממתינים|בקשות ממתינות|ממתינים לאישור)$/.test(text)) {
    return { action: "list" };
  }

  let match = text.match(/^(?:הוסף|תוסיף|אשר|לאשר|כן)(?:\s*#?(\d+))?$/);

  if (match) {
    return { action: "add", id: match[1] ? Number(match[1]) : null };
  }

  match = text.match(/^(?:לא|דחה|לדחות|אל תוסיף)(?:\s*#?(\d+))?$/);

  if (match) {
    return { action: "reject", id: match[1] ? Number(match[1]) : null };
  }

  return null;
}

async function listPending() {
  const result = await pool.query(
    `
      SELECT *
      FROM pending_trainees
      WHERE status = 'pending'
      ORDER BY id
    `
  );

  return result.rows;
}

function buildPendingListMessage(rows) {
  if (rows.length === 0) {
    return "✅ אין ילדים שממתינים לאישור.";
  }

  return [
    `🆕 ילדים שממתינים לאישור (${rows.length}):`,
    "",
    ...rows.map(
      (row) =>
        `#${row.id} · ${row.trainee_name} · ${row.group_title} · ${formatShortDate(row.session_date)}${row.notes ? `\n   📝 ${row.notes}` : ""}`
    ),
    "",
    "עונים: הוסף <מספר> / לא <מספר>",
  ].join("\n");
}

function dayOfWeekOf(dateString) {
  const [year, month, day] = String(dateString).slice(0, 10).split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() + 1;
}

function toDateString(value) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return attendance.getIsraelDateString(0, new Date(value));
}

/*
 * הרשימה שאליה נכנס הילד, לפי האימון שבו דווח.
 */
async function scopeForRequest(request) {
  const dateString = toDateString(request.session_date);
  const dayOfWeek = dayOfWeekOf(dateString);
  let match = String(request.ref).match(/^g:(\d+)$/);

  if (match) {
    const group = (await attendance.getActiveGroups()).find(
      (item) => String(item.id) === match[1]
    );

    if (!group) {
      return null;
    }

    const teamLabel = attendance.getTeamLabelFromGroupName(group.name);

    if (!teamLabel) {
      return { kind: "group", key: `group:${group.id}`, group };
    }

    match = [null, teamLabel];
  } else {
    match = String(request.ref).match(/^t:(צעירה|בוגרת)$/);
  }

  if (match) {
    return {
      kind: "slots",
      target: {
        type: "team",
        teamLabel: match[1],
        dayOfWeek,
        displayName: `נבחרת ${match[1]} (${DAY_NAMES[dayOfWeek]})`,
      },
      group: { name: `נבחרת ${match[1]} (${DAY_NAMES[dayOfWeek]})`, branch: BRANCH_GALI_HADAR },
    };
  }

  match = String(request.ref).match(/^s:(\d{2}:\d{2})$/);

  if (match) {
    const slot = {
      branch: BRANCH_GALI_HADAR,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      startTime: match[1],
      displayName: `${DAY_NAMES[dayOfWeek]} ${match[1]}`,
    };

    return {
      kind: "slots",
      target: { type: "slot", slot, displayName: `גלי הדר – ${slot.displayName}` },
      group: { name: `גלי הדר – ${slot.displayName}`, branch: BRANCH_GALI_HADAR },
    };
  }

  return null;
}

/*
 * אחרי ההוספה: אם כבר יש דיווח לאותו אימון ותאריך — מסמנים את הילד "הגיע".
 */
async function markPresentInExistingReport(request, traineeName) {
  const { resolveSessionRef } = require("./coachReportService");
  const dateString = toDateString(request.session_date);
  const session = await resolveSessionRef(request.ref, dateString);

  if (!session) {
    return false;
  }

  const trainee = attendance.findMatchingTrainee(traineeName, session.trainees);

  if (!trainee) {
    return false;
  }

  const existing = await pool.query(
    `SELECT id FROM attendance_sessions WHERE group_id = $1 AND session_date = $2::DATE`,
    [session.group.id, dateString]
  );

  if (!existing.rows[0]) {
    return false;
  }

  await pool.query(
    `
      INSERT INTO attendance_records (session_id, trainee_id, status)
      VALUES ($1, $2, 'present')
      ON CONFLICT (session_id, trainee_id)
      DO UPDATE SET status = 'present', updated_at = NOW()
    `,
    [existing.rows[0].id, trainee.id]
  );

  return true;
}

async function closeRequest(id, status, managerName) {
  const result = await pool.query(
    `
      UPDATE pending_trainees
      SET status = $2, handled_by = $3, handled_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `,
    [id, status, managerName]
  );

  return result.rows[0] || null;
}

async function findRequest(id) {
  const result = await pool.query(`SELECT * FROM pending_trainees WHERE id = $1`, [id]);

  return result.rows[0] || null;
}

/*
 * מטפל בתשובה של מנהל. מחזיר את ההודעה שצריך לשלוח לו,
 * או null אם ההודעה לא קשורה לבקשות (ואז הבוט ממשיך כרגיל).
 */
async function handlePendingReply({ reply, managerPhone }) {
  const managerName = attendance.getStaffName(managerPhone);

  if (reply.action === "list") {
    return { message: buildPendingListMessage(await listPending()) };
  }

  let id = reply.id;

  if (!id) {
    const pending = await listPending();

    /*
     * "לא" / "כן" בלי מספר — רק אם יש בדיוק בקשה אחת פתוחה.
     */
    if (pending.length === 0) {
      return null;
    }

    if (pending.length > 1) {
      return { message: buildPendingListMessage(pending) };
    }

    id = Number(pending[0].id);
  }

  const request = await findRequest(id);

  if (!request) {
    return { message: `❌ לא מצאתי בקשה מספר ${id}. לרשימה: ממתינים` };
  }

  if (request.status !== "pending") {
    return {
      message: `ℹ️ בקשה #${id} (${request.trainee_name}) כבר טופלה${request.handled_by ? ` על ידי ${request.handled_by}` : ""}.`,
    };
  }

  if (reply.action === "reject") {
    await closeRequest(id, "rejected", managerName);

    await notifyOtherManagers(
      managerPhone,
      `❎ ${managerName} סימן ש${request.trainee_name} לא נכנס/ת לרשימה (#${id}, ${request.group_title}).`
    );

    return { message: `❎ ${request.trainee_name} לא נוסף/ה לרשימה (#${id}).` };
  }

  const scope = await scopeForRequest(request);

  if (!scope) {
    return {
      message: `❌ לא מצאתי את הקבוצה של בקשה #${id} (${request.group_title}). אפשר להוסיף ידנית: תוסיף את ${request.trainee_name} ל<קבוצה>`,
    };
  }

  const added = await attendance.addToScope(scope, request.trainee_name, null);

  if (!added.success && added.code !== "TRAINEE_ALREADY_EXISTS") {
    return { message: added.message || "❌ לא הצלחתי להוסיף את הילד." };
  }

  await closeRequest(id, "added", managerName);

  const traineeName = added.trainee?.name || request.trainee_name;
  let markedPresent = false;

  try {
    markedPresent = await markPresentInExistingReport(request, traineeName);
  } catch (error) {
    console.error("❌ סימון נוכחות לילד שנוסף נכשל:", error.message);
  }

  const dateText = formatShortDate(request.session_date);
  const lines = [
    added.success
      ? `✅ ${traineeName} נוסף/ה ל${scope.group.name} (#${id}).`
      : `ℹ️ ${traineeName} כבר היה/ה ב${scope.group.name} (#${id}).`,
    ...(markedPresent ? [`✔ סומן/ה "הגיע" בדיווח של ${dateText}.`] : []),
  ];

  await notifyOtherManagers(
    managerPhone,
    `✅ ${managerName} הוסיף את ${traineeName} ל${scope.group.name} (#${id}).`
  );

  return { message: lines.join("\n") };
}

async function notifyOtherManagers(managerPhone, message) {
  const me = attendance.normalizePhone(managerPhone);

  for (const recipient of attendance.getManagerPhones()) {
    if (attendance.normalizePhone(recipient) === me) {
      continue;
    }

    try {
      await sendWhatsAppMessage(recipient, message);
    } catch (error) {
      console.error("❌ עדכון מנהל על בקשת ילד חדש נכשל:", {
        recipient: maskId(recipient),
        message: error.message,
      });
    }
  }
}

module.exports = {
  MAX_EXTRAS,
  createPendingTraineesTable,
  readExtrasFromBody,
  submitExtras,
  parsePendingReply,
  handlePendingReply,
  listPending,
  buildRequestMessage,
};
