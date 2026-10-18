const { pool } = require("./databaseService");

const {
  sendWhatsAppMessage,
} = require("./whapiService");

/*
 * =========================================================
 * הערות ובקשות מהצוות
 * =========================================================
 *
 * מנהל או מדריך כותב לבוט:
 *   הערה: הבוט לא זיהה את הקבוצה של יום שני
 *   בעיה: ...   /   בקשה: ...   /   הצעה: ...
 *
 * ההערה נשמרת בטבלת support_notes, ושאר המנהלים מקבלים התראה.
 * כשההערה מטופלת (scripts/notes.js done) — מי שכתב אותה מקבל עדכון.
 */

const NOTE_KINDS = ["הערה", "בעיה", "תקלה", "בקשה", "הצעה", "תמיכה"];

/*
 * "הערה: טקסט" / "בעיה - טקסט" / "בקשה טקסט" (גם בכמה שורות).
 */
function parseSupportNote(message = "") {
  const text = String(message).trim();

  const match = text.match(
    new RegExp(
      `^(${NOTE_KINDS.join("|")})(?:\\s+לבוט)?\\s*[:\\-–—]?\\s*([\\s\\S]+)$`
    )
  );

  if (!match) {
    return null;
  }

  const body = match[2].trim();

  /*
   * לפחות כמה מילים — כדי ש"בעיה" לבד לא תישמר כהערה.
   */
  if (body.length < 5) {
    return null;
  }

  return {
    kind: match[1] === "תקלה" ? "בעיה" : match[1],
    body: body.slice(0, 2000),
  };
}

async function createSupportNote(
  { fromPhone, fromName, chatId, kind, body },
  db = pool
) {
  const result = await db.query(
    `
      INSERT INTO support_notes (
        from_phone,
        from_name,
        chat_id,
        kind,
        body
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, kind, body, created_at
    `,
    [fromPhone, fromName, chatId, kind, body]
  );

  return result.rows[0];
}

async function listOpenSupportNotes(db = pool) {
  const result = await db.query(
    `
      SELECT
        id,
        from_name,
        from_phone,
        chat_id,
        kind,
        body,
        created_at
      FROM support_notes
      WHERE status = 'open'
      ORDER BY created_at
    `
  );

  return result.rows;
}

function formatNoteDate(value) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildOpenNotesMessage(notes = []) {
  if (notes.length === 0) {
    return "✅ אין הערות פתוחות.";
  }

  return [
    `📝 הערות פתוחות (${notes.length}):`,
    "",
    ...notes.map(
      (note) =>
        `#${note.id} · ${note.kind} · ${note.from_name || "צוות"} · ${formatNoteDate(note.created_at)}\n${note.body}`
    ),
  ].join("\n\n");
}

/*
 * סימון הערה כמטופלת + עדכון למי שכתב אותה.
 */
async function resolveSupportNote(
  id,
  resolution,
  db = pool
) {
  const result = await db.query(
    `
      UPDATE support_notes
      SET
        status = 'done',
        resolution = $2,
        resolved_at = NOW()
      WHERE id = $1
        AND status = 'open'
      RETURNING id, chat_id, kind, body
    `,
    [id, resolution]
  );

  const note = result.rows[0];

  if (!note) {
    return null;
  }

  await sendWhatsAppMessage(
    note.chat_id,
    [
      `✅ ה${note.kind} שלך טופלה (#${note.id})`,
      "",
      `📝 ${note.body}`,
      "",
      `🔧 ${resolution}`,
    ].join("\n")
  );

  return note;
}

module.exports = {
  NOTE_KINDS,
  parseSupportNote,
  createSupportNote,
  listOpenSupportNotes,
  buildOpenNotesMessage,
  resolveSupportNote,
};
