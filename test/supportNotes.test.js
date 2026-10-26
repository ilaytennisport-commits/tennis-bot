/*
 * בדיקות להערות ובקשות מהצוות.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  setupHarness,
  textMessage,
  sentTo,
  lastSentTo,
} = require("./helpers/harness");

const state = setupHarness({
  MANAGER_PHONES: "0500000001,0500000003",
  STAFF_NAMES: "0500000003:יוסי,0500000002:אבי",
});

const {
  parseSupportNote,
  resolveSupportNote,
} = require("../services/supportNotesService");

const {
  processIncomingMessage,
} = require("../controllers/webhookController");

const OWNER = "972500000001@s.whatsapp.net";
const SECOND_MANAGER = "972500000003@s.whatsapp.net";
const COACH = "972500000002@s.whatsapp.net";
const CUSTOMER = "972521234567@s.whatsapp.net";

test.beforeEach(() => {
  state.sent.length = 0;
});

test("פענוח: הערה / בעיה / בקשה, גם בכמה שורות", () => {
  assert.deepEqual(parseSupportNote("הערה: הבוט לא זיהה את הקבוצה"), {
    kind: "הערה",
    body: "הבוט לא זיהה את הקבוצה",
  });

  assert.equal(parseSupportNote("תקלה - הקישור לא נפתח").kind, "בעיה");
  assert.equal(parseSupportNote("בקשה לבוט: להוסיף שעה 19:00").kind, "בקשה");
  assert.equal(
    parseSupportNote("הצעה:\nשורה ראשונה\nשורה שנייה").body,
    "שורה ראשונה\nשורה שנייה"
  );

  assert.equal(parseSupportNote("בעיה"), null);
  assert.equal(parseSupportNote("נוכחות 18:00\nדני"), null);
  assert.equal(parseSupportNote("הערכה של המאמן"), null);
});

test("מנהל שני כותב הערה — נשמרת, מקבל אישור, והמנהל השני מקבל התראה", async () => {
  await processIncomingMessage(
    textMessage(
      SECOND_MANAGER,
      "הערה: הדף החי לא מראה את קבוצת 19:30"
    )
  );

  const note = state.notes[state.notes.length - 1];

  assert.equal(note.body, "הדף החי לא מראה את קבוצת 19:30");
  assert.equal(note.from_name, "יוסי");
  assert.match(lastSentTo(state, SECOND_MANAGER), new RegExp(`נשמרה \\(#${note.id}\\)`));
  assert.match(lastSentTo(state, OWNER), /הערה חדשה #\d+ מיוסי/);
  assert.match(lastSentTo(state, OWNER), /קבוצת 19:30/);
});

test("גם מדריך יכול לשלוח בעיה", async () => {
  await processIncomingMessage(
    textMessage(COACH, "בעיה: הבוט אמר שהשם שירה לא קיים")
  );

  assert.match(lastSentTo(state, COACH), /הבעיה נשמרה/);
  assert.equal(state.notes[state.notes.length - 1].from_name, "אבי");
});

test("לקוח שכותב 'בעיה:' לא נכנס למערכת ההערות", async () => {
  const before = state.notes.length;

  await processIncomingMessage(textMessage(CUSTOMER, "היי"));
  await processIncomingMessage(textMessage(CUSTOMER, "פייסבוק"));
  await processIncomingMessage(
    textMessage(CUSTOMER, "בעיה: לא הבנתי את המחירים")
  );

  assert.equal(state.notes.length, before);
});

test("'הערות פתוחות' — רשימה למנהל", async () => {
  await processIncomingMessage(
    textMessage(OWNER, "הערות פתוחות")
  );

  const reply = lastSentTo(state, OWNER);

  assert.match(reply, /הערות פתוחות \(\d+\)/);
  assert.match(reply, /קבוצת 19:30/);
});

test("טיפול בהערה — מי שכתב אותה מקבל הודעה, והיא יוצאת מהרשימה", async () => {
  const note = state.notes.find((item) =>
    item.body.includes("19:30")
  );

  await resolveSupportNote(
    note.id,
    "תוקן — הקבוצה מופיעה עכשיו בדף"
  );

  const message = lastSentTo(state, SECOND_MANAGER);

  assert.match(message, new RegExp(`טופלה \\(#${note.id}\\)`));
  assert.match(message, /תוקן — הקבוצה מופיעה עכשיו בדף/);

  assert.equal(await resolveSupportNote(note.id, "שוב"), null);

  await processIncomingMessage(textMessage(OWNER, "הערות פתוחות"));
  assert.doesNotMatch(lastSentTo(state, OWNER), /קבוצת 19:30/);
});

test("עזרה למדריך מזכירה את אפשרות ההערות", async () => {
  await processIncomingMessage(textMessage(COACH, "עזרה"));

  assert.match(sentTo(state, COACH).pop().body, /הערה: \.\.\./);
});

test("מנהל מבקש קישור דיווח של מאמן — מקבל את הקישור כדי להעביר", async () => {
  process.env.RAILWAY_PUBLIC_DOMAIN = "bot.example.com";

  await processIncomingMessage(textMessage(OWNER, "קישור דיווח של אבי"));

  const reply = lastSentTo(state, OWNER);

  assert.match(reply, /הקישור האישי של אבי/);
  assert.match(reply, /https:\/\/bot\.example\.com\/report\/[a-f0-9]{48}/);

  await processIncomingMessage(textMessage(OWNER, "קישור דיווח ל-0500000002"));
  assert.match(lastSentTo(state, OWNER), /הקישור האישי של אבי/);

  await processIncomingMessage(textMessage(OWNER, "קישור דיווח של 0541112222"));
  assert.match(lastSentTo(state, OWNER), /לא מוגדר כמאמן/);

  /*
   * הקישור של המנהל עצמו ממשיך לעבוד כרגיל.
   */
  await processIncomingMessage(textMessage(OWNER, "קישור דיווח"));
  assert.match(lastSentTo(state, OWNER), /הקישור האישי שלך/);

  /*
   * מאמן לא יכול לבקש קישור של מישהו אחר.
   */
  await processIncomingMessage(textMessage(COACH, "קישור של יוסי"));
  assert.doesNotMatch(lastSentTo(state, COACH) || "", /הקישור האישי של יוסי/);
});

test("'שלח לי מדריך למדריכים' — המנהל מקבל את המדריך הקצר", async () => {
  for (const text of ["שלח לי מדריך למדריכים", "מדריך למאמנים", "תשלח את המדריך הקצר למדריכים", "מדריך למדריכים!"]) {
    state.sent.length = 0;
    await processIncomingMessage(textMessage(OWNER, text));

    const reply = lastSentTo(state, OWNER);

    assert.match(reply, /נוכחות – מהיום רק בקישור/, text);
    assert.match(reply, /קישור דיווח/);
    assert.match(reply, /ילד שלא ברשימה/);
  }
});
