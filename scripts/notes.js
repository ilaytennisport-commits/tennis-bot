/*
 * =========================================================
 * כלי לטיפול בהערות הצוות (מהמחשב)
 * =========================================================
 *
 * רשימת הערות פתוחות:
 *   node scripts/notes.js list
 *
 * סימון הערה כמטופלת + הודעת WhatsApp למי שכתב אותה:
 *   node scripts/notes.js done 3 "תוקן — עכשיו אפשר לכתוב רק את השעה"
 *
 * משתמש ב-DATABASE_URL ו-WHAPI_TOKEN מקובץ .env.
 */

require("dotenv").config({ quiet: true });

const { pool } = require("../services/databaseService");

const {
  listOpenSupportNotes,
  buildOpenNotesMessage,
  resolveSupportNote,
} = require("../services/supportNotesService");

async function main() {
  const [command, id, ...resolutionParts] =
    process.argv.slice(2);

  if (command === "list") {
    console.log(
      buildOpenNotesMessage(await listOpenSupportNotes())
    );
    return;
  }

  if (command === "done" && id && resolutionParts.length) {
    const note = await resolveSupportNote(
      Number(id),
      resolutionParts.join(" ")
    );

    console.log(
      note
        ? `✅ הערה #${note.id} סומנה כמטופלת ונשלחה הודעה לכותב/ת.`
        : `⚠️ לא נמצאה הערה פתוחה #${id}.`
    );
    return;
  }

  console.log(
    'שימוש:\n  node scripts/notes.js list\n  node scripts/notes.js done <מספר> "מה תוקן"'
  );
}

main()
  .catch((error) => {
    console.error("❌", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
