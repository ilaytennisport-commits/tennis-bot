/*
 * בדיקות לזיהוי טקסט — כל בדיקה כאן מכסה באג שנמצא בסקירה.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://test";

const {
  containsWord,
  looksLikeQuestion,
  isGreetingOnly,
} = require("../utils/text");

const {
  classifyIntent,
} = require("../utils/intentClassifier");

const {
  detectSpecialSource,
} = require("../services/sourceRoutingService");

const {
  getChatKind,
  isPrivateChat,
  chatIdToPhone,
  maskId,
} = require("../utils/whatsappIds");

const {
  whatsappIdToPhone,
  extractUserDetails,
} = require("../utils/leadUtils");

const {
  detectEquipmentCategory,
} = require("../services/equipmentService");

test("containsWord מזהה מילה שלמה ולא חלק ממילה", () => {
  assert.equal(containsWord("תגיד יש חניה", "גיד"), false);
  assert.equal(containsWord("צריך להחליף גיד", "גיד"), true);
  assert.equal(
    containsWord("שחקן ותיק", "תיק", { prefixes: "הבל" }),
    false
  );
  assert.equal(
    containsWord("כמה עולה התיק", "תיק", { prefixes: "הבל" }),
    true
  );
});

test("looksLikeQuestion ו-isGreetingOnly", () => {
  assert.equal(looksLikeQuestion("כמה עולה חוג"), true);
  assert.equal(looksLikeQuestion("יש חניה"), true);
  assert.equal(looksLikeQuestion("דני כהן"), false);
  assert.equal(isGreetingOnly("היי"), true);
  assert.equal(isGreetingOnly("שלום!"), true);
  assert.equal(isGreetingOnly("שלום, כמה עולה?"), false);
});

test("סיווג כוונות: באגים שתוקנו", () => {
  assert.notEqual(
    classifyIntent("תגיד, יש חניה?").intent,
    "tennis_equipment"
  );
  assert.notEqual(
    classifyIntent("הוא שחקן ותיק").intent,
    "tennis_equipment"
  );
  assert.notEqual(
    classifyIntent("יש לו ניסיון של שנתיים").intent,
    "trial"
  );
  assert.notEqual(
    classifyIntent("אשמח לפרטים").intent,
    "personal_training"
  );
});

test("סיווג כוונות: זיהוי נכון נשמר", () => {
  assert.equal(classifyIntent("כמה עולה חוג?").intent, "pricing");
  assert.equal(classifyIntent("מה המחיר?").intent, "pricing");
  assert.equal(classifyIntent("יש אימון ניסיון?").intent, "trial");
  assert.equal(classifyIntent("איפה אתם נמצאים?").intent, "branches");
  assert.equal(classifyIntent("מאיזה גיל אפשר?").intent, "minimum_age");
  assert.equal(
    classifyIntent("איזה מחבט לקנות לילד?").intent,
    "tennis_equipment"
  );
  assert.equal(
    classifyIntent("צריך להחליף גידים").intent,
    "tennis_equipment"
  );
  assert.equal(
    classifyIntent("יש לכם שיעור פרטי?").intent,
    "personal_training"
  );
});

test("קטגוריית ציוד: ותיק אינו תיק", () => {
  assert.equal(
    detectEquipmentCategory("שחקן ותיק צריך מחבט").category,
    "rackets"
  );
  assert.equal(
    detectEquipmentCategory("יש לכם תיק למחבט?").item,
    "bag"
  );
});

test("מקור הגעה: עמית כשם פרטי אינו מסלול עמית", () => {
  assert.equal(detectSpecialSource("חבר שלי עמית המליץ"), null);
  assert.equal(detectSpecialSource("שמעתי מעמית מהעבודה"), null);
  assert.equal(detectSpecialSource("עמית"), "amit");
  assert.equal(detectSpecialSource("דרך עמית"), "amit");
  assert.equal(detectSpecialSource("בעמית"), "amit");
  assert.equal(detectSpecialSource("ראיתי בתוכנית עמית"), "amit");
});

test("מקור הגעה: קופות חולים רק בהקשר ברור", () => {
  assert.equal(detectSpecialSource("זו שאלה כללית"), null);
  assert.equal(detectSpecialSource("כללית"), "move");
  assert.equal(detectSpecialSource("דרך מכבי"), "move");
  assert.equal(detectSpecialSource("במאוחדת"), "move");
  assert.equal(detectSpecialSource("דרך קופת חולים"), "move");
  assert.equal(detectSpecialSource("MOVE"), "move");
  assert.equal(detectSpecialSource("פריפיט"), "freefit");
  assert.equal(detectSpecialSource("שיקומי"), "shikumi");
  assert.equal(detectSpecialSource("דרך שיקומי"), "shikumi");
  assert.equal(detectSpecialSource("בשיקומי"), "shikumi");
  assert.equal(detectSpecialSource("הגעתי דרך שיקומי"), "shikumi");
  assert.equal(detectSpecialSource("פייסבוק"), null);
});

test("מזהי WhatsApp: קבוצות לא נחשבות שיחה פרטית", () => {
  assert.equal(getChatKind("120363052512345678@g.us"), "group");
  assert.equal(isPrivateChat("120363052512345678@g.us"), false);
  assert.equal(isPrivateChat("status@broadcast"), false);
  assert.equal(isPrivateChat("123@newsletter"), false);
  assert.equal(isPrivateChat("972501234567@s.whatsapp.net"), true);
  assert.equal(isPrivateChat("215987650512345@lid"), true);
});

test("מזהי WhatsApp: טלפון מזויף לא נוצר מקבוצה או lid", () => {
  assert.equal(chatIdToPhone("120363052512345678@g.us"), null);
  assert.equal(chatIdToPhone("215987650512345@lid"), null);
  assert.equal(whatsappIdToPhone("215987650512345@lid"), null);
  assert.equal(
    chatIdToPhone("972501234567@s.whatsapp.net"),
    "0501234567"
  );
  assert.equal(
    chatIdToPhone("447700900123@s.whatsapp.net"),
    "+447700900123"
  );
});

test("maskId מסתיר מספרים בלוגים", () => {
  assert.equal(maskId("972501234567@s.whatsapp.net"), "9725****567");
  assert.equal(maskId(""), "");
});

test("חילוץ פרטים: ניסיון קודם אינו בקשה לשיעור ניסיון", () => {
  assert.equal(extractUserDetails("יש לו ניסיון").goal, undefined);
  assert.equal(
    extractUserDetails("אשמח לשיעור ניסיון").goal,
    "שיעור ניסיון"
  );
  assert.equal(
    extractUserDetails("רוצה להירשם").goal,
    "הרשמה לחוג"
  );
  assert.equal(
    extractUserDetails("הטלפון שלי 052-123-4567").phone,
    "0521234567"
  );
});
