/*
 * בדיקות שיחה מלאות: הודעה נכנסת → הקוד האמיתי של הבוט →
 * מה נשלח ללקוח ולמנהל. בלי מסד נתונים, WhatsApp או OpenAI אמיתיים.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  setupHarness,
  textMessage,
  sentTo,
  lastSentTo,
} = require("./helpers/harness");

const state = setupHarness();

const {
  processIncomingMessage,
  handleWebhook,
  waitForQueues,
} = require("../controllers/webhookController");

const {
  retryPendingLeads,
} = require("../services/leadService");

const {
  resetReliabilityStateForTests,
} = require("../services/reliabilityService");

const MANAGER = "0500000001";

let customerCounter = 0;

function newCustomer() {
  customerCounter += 1;

  return `97252${String(customerCounter).padStart(7, "0")}@s.whatsapp.net`;
}

async function say(chatId, body, extra) {
  await processIncomingMessage(
    textMessage(chatId, body, extra)
  );

  return lastSentTo(state, chatId);
}

/*
 * לקוח שכבר עבר את שאלת "איך שמעתם עלינו".
 */
async function regularCustomer() {
  const chatId = newCustomer();

  await say(chatId, "היי");
  await say(chatId, "פייסבוק");

  return chatId;
}

test.beforeEach(() => {
  state.sent.length = 0;
  state.leads.length = 0;
  state.failRecipients.clear();
  resetReliabilityStateForTests();
});

test("ליד 'תחזרו אליי' מגיע למנהל (הבאג המרכזי)", async () => {
  const chatId = await regularCustomer();

  assert.match(await say(chatId, "תחזרו אליי"), /מה שם המתאמן/);
  assert.match(await say(chatId, "דני כהן"), /מה גיל/);
  assert.match(await say(chatId, "9"), /באיזה סניף/);

  const finalReply = await say(chatId, "גלי הדר");

  assert.match(finalReply, /הועברו לצוות|קיבלתי את הפרטים/);

  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].status, "sent");
  assert.equal(state.leads[0].details.name, "דני כהן");
  assert.equal(state.leads[0].details.goal, "בקשה לחזרה מנציג");

  const managerMessage = lastSentTo(state, MANAGER);

  assert.match(managerMessage, /ליד חדש/);
  assert.match(managerMessage, /דני כהן/);
  assert.match(managerMessage, /wa\.me\/972/);
});

test("שיחה אמיתית (ליזה): בקשת חזרה עם שגיאת הקלדה הופכת לליד", async () => {
  const chatId = newCustomer();

  await say(chatId, "היי");
  await say(chatId, "דרך הפייסבוק");

  assert.match(
    await say(chatId, "אשמח שצחזור אלי טלפונית"),
    /מה שם המתאמן/
  );

  assert.match(
    await say(chatId, "ליזה, מתעניינת בחוג טניס"),
    /מה גיל/
  );

  assert.match(await say(chatId, "40"), /באיזה סניף/);
  await say(chatId, "גלי הדר");

  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].details.name, "ליזה");
  assert.equal(state.leads[0].details.age, 40);
  assert.match(lastSentTo(state, MANAGER), /ליזה/);
});

test("'מבוגרים' כתשובה ל'למי מיועד האימון?' מחזיר מחירון", async () => {
  const chatId = await regularCustomer();

  assert.match(await say(chatId, "מחירים"), /למי מיועד האימון/);

  const reply = await say(chatId, "מבוגרים");

  assert.match(reply, /מחירון מבוגרים/);
  assert.match(reply, /320/);
});

test("'כן' להצעה של הבינה המלאכותית שיחזרו — פותח ליד אמיתי", async () => {
  const chatId = await regularCustomer();

  state.openaiReplies.push(
    "כרגע אין לי את המידע הזה.\n\nתרצו שצוות האקדמיה יחזור אליכם?"
  );

  await say(chatId, "יש לכם משהו בשישי בבוקר לגיל הזהב?");

  assert.match(await say(chatId, "כן"), /מה שם המתאמן/);
});

test("'מתי יש?' — מציע שיחזרו, ו'כן' פותח ליד", async () => {
  const chatId = await regularCustomer();

  assert.match(
    await say(chatId, "מתי יש?"),
    /תרצו שצוות האקדמיה יחזור אליכם/
  );

  assert.match(await say(chatId, "כן"), /מה שם המתאמן/);
});

test("גיל כתשובה לא מקבל תשובה כללית 'מה היית רוצה לדעת'", async () => {
  const chatId = await regularCustomer();

  await say(chatId, "אני מתעניינת בחוג למבוגרים");

  const reply = await say(chatId, "40");

  assert.doesNotMatch(reply, /מה היית רוצה לדעת קודם/);
});

test("ליד הרשמה רגיל נשלח פעם אחת בלבד", async () => {
  const chatId = await regularCustomer();

  await say(chatId, "רוצה להירשם");
  await say(chatId, "נועה לוי");
  await say(chatId, "12");
  await say(chatId, "בית חשמונאי");
  await say(chatId, "תודה רבה");

  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].details.branch, "בית חשמונאי");
  assert.equal(sentTo(state, MANAGER).length, 1);
});

test("לקוח שכבר נשלח עליו ליד יכול לרשום מתאמן נוסף", async () => {
  const chatId = await regularCustomer();

  await say(chatId, "רוצה להירשם");
  await say(chatId, "נועה לוי");
  await say(chatId, "12");
  await say(chatId, "גלי הדר");

  assert.match(
    await say(chatId, "רוצה להירשם"),
    /כבר אצל צוות האקדמיה/
  );

  assert.match(await say(chatId, "מתאמן נוסף"), /מה שם המתאמן/);
  await say(chatId, "יואב לוי");
  await say(chatId, "8");
  await say(chatId, "גלי הדר");

  assert.equal(state.leads.length, 2);
  assert.equal(state.leads[1].details.name, "יואב לוי");
});

test("שאלה באמצע איסוף ליד נענית, והבוט חוזר לשאלה", async () => {
  const chatId = await regularCustomer();

  await say(chatId, "רוצה להירשם");

  const reply = await say(chatId, "כמה עולה לילד?");

  assert.match(reply, /מחירון ילדים/);
  assert.match(reply, /מה שם המתאמן/);
  assert.equal(state.leads.length, 0);
});

test("ההודעה הראשונה של לקוח חדש נענית אחרי שאלת המקור", async () => {
  const chatId = newCustomer();

  assert.match(
    await say(chatId, "כמה עולה חוג לילד בן 8?"),
    /איך שמעתם עלינו/
  );

  const reply = await say(chatId, "מגוגל");

  assert.match(reply, /תודה/);
  assert.match(reply, /מחירון ילדים/);
  assert.equal(state.users.get(chatId).age, 8);
});

test("לקוח שמתעלם משאלת המקור ושואל שאלה — מקבל תשובה", async () => {
  const chatId = newCustomer();

  await say(chatId, "היי");

  assert.match(
    await say(chatId, "איפה אתם נמצאים?"),
    /רמז 96/
  );
});

test("'חבר שלי עמית המליץ' נשאר במסלול הרגיל", async () => {
  const chatId = newCustomer();

  await say(chatId, "היי");
  await say(chatId, "חבר שלי עמית המליץ");

  assert.equal(state.users.get(chatId).source, "regular");
});

test("מסלול עמית: בסיום ההרשמה המנהל מקבל ליד", async () => {
  const chatId = newCustomer();

  await say(chatId, "היי");
  assert.match(await say(chatId, "דרך עמית"), /דרך עמית/);
  await say(chatId, "רון אברהם");
  await say(chatId, "35");
  await say(chatId, "ראשון לציון");

  const rules = await say(chatId, "ללא ניסיון");

  assert.match(rules, /חשוב לדעת/);
  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].kind, "special");
  assert.match(lastSentTo(state, MANAGER), /דרך עמית/);
});

test("ליד שנכשל בשליחה נשמר ונשלח שוב", async () => {
  state.failRecipients.add("972500000001");

  const chatId = await regularCustomer();

  await say(chatId, "תחזרו אליי");
  await say(chatId, "דני כהן");
  await say(chatId, "9");
  await say(chatId, "גלי הדר");

  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0].status, "failed");

  state.failRecipients.clear();

  const result = await retryPendingLeads();

  assert.equal(result.sent, 1);
  assert.equal(state.leads[0].status, "sent");
});

test("הבוט לא עונה בקבוצות", async () => {
  await processIncomingMessage(
    textMessage("120363052512345678@g.us", "כמה עולה?")
  );

  assert.equal(state.sent.length, 0);
});

test("הודעה קולית מקבלת מענה (פעם אחת ב-10 דקות)", async () => {
  const chatId = newCustomer();
  const voice = {
    id: "voice-1",
    from_me: false,
    type: "voice",
    chat_id: chatId,
    voice: {},
  };

  await processIncomingMessage(voice);
  await processIncomingMessage({ ...voice, id: "voice-2" });

  assert.equal(sentTo(state, chatId).length, 1);
  assert.match(lastSentTo(state, chatId), /רק הודעות כתובות/);
});

test("נציג שענה ידנית משתיק את הבוט מול הלקוח", async () => {
  const chatId = await regularCustomer();

  await processIncomingMessage({
    id: "human-1",
    from_me: true,
    type: "text",
    chat_id: chatId,
    source: "mobile",
    text: { body: "היי, כאן אסף מהאקדמיה" },
  });

  const before = sentTo(state, chatId).length;

  await say(chatId, "כמה עולה?");

  assert.equal(sentTo(state, chatId).length, before);
  assert.ok(state.users.get(chatId).bot_paused_until);
});

test("ההודעות של הבוט עצמו לא משתיקות אותו", async () => {
  const chatId = await regularCustomer();
  const botMessage = state.sent[state.sent.length - 1];

  await processIncomingMessage({
    id: botMessage.id,
    from_me: true,
    type: "text",
    chat_id: chatId,
    text: { body: botMessage.body },
  });

  assert.equal(state.users.get(chatId).bot_paused_until ?? null, null);
});

test("מנהל יכול להחזיר את הבוט ללקוח", async () => {
  const chatId = await regularCustomer();
  const phone = `0${chatId.slice(3, 12)}`;

  await say("972500000001@s.whatsapp.net", `עצור בוט ${phone}`);
  assert.ok(state.users.get(chatId).bot_paused_until);

  await say("972500000001@s.whatsapp.net", `הפעל בוט ${phone}`);
  assert.equal(state.users.get(chatId).bot_paused_until, null);

  assert.match(await say(chatId, "כמה עולה לילד?"), /מחירון/);
});

test("תקלה בעיבוד: הלקוח מקבל תשובה והמנהל התראה", async () => {
  const chatId = await regularCustomer();

  state.dbDown = true;

  try {
    await say(chatId, "שאלה כלשהי");
  } finally {
    state.dbDown = false;
  }

  assert.match(lastSentTo(state, chatId), /תקלה רגעית/);
  assert.match(lastSentTo(state, MANAGER), /תקלה בבוט/);
});

test("הגבלת קצב: הודעות רבות ברצף נחסמות עם הודעה אחת", async () => {
  const chatId = await regularCustomer();

  for (let index = 0; index < 30; index += 1) {
    await say(chatId, `שאלה מספר ${index}`);
  }

  const warnings = sentTo(state, chatId).filter((message) =>
    /הרבה הודעות ברצף/.test(message.body)
  );

  assert.equal(warnings.length, 1);
});

test("איפוס שיחה זמין רק למספרי בדיקה", async () => {
  const customer = await regularCustomer();

  await say(customer, "איפוס שיחה");
  assert.ok(state.users.has(customer));

  const tester = "972500000009@s.whatsapp.net";

  await say(tester, "היי");
  assert.match(await say(tester, "איפוס שיחה"), /אופסו/);
  assert.equal(state.users.has(tester), false);
});

/*
 * ---------------- Webhook ----------------
 */

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function fakeReq({ token, messages }) {
  return {
    query: token ? { token } : {},
    get: () => undefined,
    body: {
      event: { type: "messages" },
      messages,
    },
  };
}

test("Webhook: בלי טוקן נכון — נדחה (401)", async () => {
  process.env.WEBHOOK_SECRET = "s3cret";

  try {
    const res = fakeRes();

    await handleWebhook(
      fakeReq({
        token: "wrong",
        messages: [textMessage(newCustomer(), "היי")],
      }),
      res
    );

    await waitForQueues();

    assert.equal(res.statusCode, 401);
    assert.equal(state.sent.length, 0);
  } finally {
    delete process.env.WEBHOOK_SECRET;
  }
});

test("Webhook: טוקן נכון + הודעה כפולה מטופלת פעם אחת", async () => {
  process.env.WEBHOOK_SECRET = "s3cret";

  try {
    const chatId = newCustomer();
    const message = textMessage(chatId, "היי");
    const res = fakeRes();

    await handleWebhook(
      fakeReq({ token: "s3cret", messages: [message, message] }),
      res
    );

    await handleWebhook(
      fakeReq({ token: "s3cret", messages: [message] }),
      fakeRes()
    );

    await waitForQueues();

    assert.equal(res.statusCode, 200);
    assert.equal(sentTo(state, chatId).length, 1);
  } finally {
    delete process.env.WEBHOOK_SECRET;
  }
});
