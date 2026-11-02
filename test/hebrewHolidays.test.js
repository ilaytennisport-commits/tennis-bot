/*
 * ימים בלי אימונים לפי הלוח העברי.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getNoTrainingHoliday } = require("../utils/hebrewHolidays");

test("חגים, ערבי חג וחול המועד", () => {
  const expected = {
    "2027-04-21": "ערב פסח",
    "2027-04-22": "פסח",
    "2027-04-24": "חול המועד פסח",
    "2027-04-27": "ערב שביעי של פסח",
    "2027-04-28": "שביעי של פסח",
    "2027-06-10": "ערב שבועות",
    "2027-06-11": "שבועות",
    "2027-10-01": "ערב ראש השנה",
    "2027-10-03": "ראש השנה",
    "2027-10-10": "ערב יום כיפור",
    "2027-10-11": "יום כיפור",
    "2027-10-15": "ערב סוכות",
    "2027-10-19": "חול המועד סוכות",
    "2027-10-22": "ערב שמחת תורה",
  };

  for (const [date, name] of Object.entries(expected)) {
    assert.equal(getNoTrainingHoliday(date), name, date);
  }
});

test("חנוכה, פורים, יום הזיכרון, יום העצמאות ותשעה באב", () => {
  assert.equal(getNoTrainingHoliday("2026-12-05"), "חנוכה");
  assert.equal(getNoTrainingHoliday("2026-12-12"), "חנוכה");
  assert.equal(getNoTrainingHoliday("2026-12-13"), null);
  assert.equal(getNoTrainingHoliday("2027-03-23"), "פורים");
  assert.equal(getNoTrainingHoliday("2027-05-11"), "יום הזיכרון");
  assert.equal(getNoTrainingHoliday("2027-05-12"), "יום העצמאות");
  assert.equal(getNoTrainingHoliday("2027-08-12"), "תשעה באב");
});

test("יום העצמאות שזז לפי החוק", () => {
  /* 2025: ה' באייר בשישי ← חמישי 1/5, יום הזיכרון ברביעי */
  assert.equal(getNoTrainingHoliday("2025-04-30"), "יום הזיכרון");
  assert.equal(getNoTrainingHoliday("2025-05-01"), "יום העצמאות");
  assert.equal(getNoTrainingHoliday("2025-05-02"), null);

  /* 2028: ה' באייר בשני ← שלישי 2/5, יום הזיכרון בשני */
  assert.equal(getNoTrainingHoliday("2028-05-01"), "יום הזיכרון");
  assert.equal(getNoTrainingHoliday("2028-05-02"), "יום העצמאות");
  assert.equal(getNoTrainingHoliday("2028-04-30"), null);
});

test("ימים רגילים — יש אימונים", () => {
  for (const date of ["2026-11-02", "2026-11-03", "2027-01-10", "2027-05-13", "2027-07-01"]) {
    assert.equal(getNoTrainingHoliday(date), null, date);
  }
});
