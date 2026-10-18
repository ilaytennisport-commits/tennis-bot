/*
 * בדיקות לפקודות צוות ולזיהוי ימים ותאריכים בנוכחות.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://test";

const {
  parseAttendanceCommand,
  parseManagerCommand,
} = require("../utils/staffCommandParser");

const {
  getDayOfWeekFromText,
  resolveSessionDate,
  parseSlotsTarget,
  parseGaliHadarSlot,
  findMatchingTrainee,
  parseTimeOnlyGroup,
  parseGroupSchedule,
} = require("../services/attendanceService");

test("נוכחות: פורמט מפורש ומקוצר", () => {
  assert.deepEqual(
    parseAttendanceCommand("נוכחות א+ד 16:00\nדני\nרון, יעל"),
    {
      isAttendanceCommand: true,
      groupName: "א+ד 16:00",
      presentNames: ["דני", "רון", "יעל"],
      dateOffsetDays: 0,
    }
  );

  const short = parseAttendanceCommand("צעירה שלישי\n1. מישל\n- רז");

  assert.equal(short.isAttendanceCommand, true);
  assert.equal(short.groupName, "צעירה שלישי");
  assert.deepEqual(short.presentNames, ["מישל", "רז"]);
});

test("נוכחות: אתמול", () => {
  const result = parseAttendanceCommand("נוכחות צעירה אתמול\nמישל");

  assert.equal(result.groupName, "צעירה");
  assert.equal(result.dateOffsetDays, -1);
});

test("נוכחות: הודעה רגילה אינה דיווח", () => {
  assert.equal(
    parseAttendanceCommand("מה שלומך").isAttendanceCommand,
    false
  );
});

test("פקודות מנהל: שם משפחה שמתחיל ב-ל לא נחתך", () => {
  const command = parseManagerCommand("תוסיף את דני לוי לצעירה");

  assert.equal(command.type, "ADD_TRAINEE");
  assert.equal(command.traineeName, "דני לוי");
  assert.equal(command.groupName, "צעירה");
});

test("פקודות מנהל: 'לקבוצה' מפורש מקבל עדיפות", () => {
  const command = parseManagerCommand(
    "תוסיף את ליאור לנדאו לקבוצה א+ד 16:00"
  );

  assert.equal(command.traineeName, "ליאור לנדאו");
  assert.equal(command.groupName, "א+ד 16:00");
});

test("פקודות מנהל: הסרה עם שם משפחה שמתחיל ב-מ", () => {
  const command = parseManagerCommand("תוריד את דני מזרחי מצעירה");

  assert.equal(command.type, "REMOVE_TRAINEE");
  assert.equal(command.traineeName, "דני מזרחי");
  assert.equal(command.groupName, "צעירה");
});

test("פקודות מנהל: העברה", () => {
  const command = parseManagerCommand(
    "תעביר את דני מזרחי מצעירה לבוגרת"
  );

  assert.equal(command.type, "MOVE_TRAINEE");
  assert.equal(command.traineeName, "דני מזרחי");
  assert.equal(command.fromGroupName, "צעירה");
  assert.equal(command.toGroupName, "בוגרת");

  const explicit = parseManagerCommand(
    "תעביר את ישראל מקבוצה א+ד 16:00 לקבוצה ב+ה 18:00"
  );

  assert.equal(explicit.traineeName, "ישראל");
  assert.equal(explicit.fromGroupName, "א+ד 16:00");
  assert.equal(explicit.toGroupName, "ב+ה 18:00");
});

test("פקודות מנהל: מועמדים חלופיים לבדיקה מול הקבוצות", () => {
  const command = parseManagerCommand("תוסיף את דני לוי לצעירה");

  assert.ok(command.candidates.length >= 2);
  assert.deepEqual(command.candidates[1], {
    traineeName: "דני",
    groupName: "וי לצעירה",
  });
});

test("פקודות מנהל: רשימה, פורמט ישן ושליטה בבוט", () => {
  assert.deepEqual(
    parseManagerCommand("תראה לי את הרשימה של קבוצה א+ד 16:00"),
    { type: "LIST_GROUP", groupName: "א+ד 16:00" }
  );

  assert.equal(
    parseManagerCommand("הוסף מתאמן א+ד 16:00|דני|חדש").notes,
    "חדש"
  );

  assert.deepEqual(parseManagerCommand("עצור בוט 050-123-4567"), {
    type: "PAUSE_BOT",
    phone: "0501234567",
  });

  assert.equal(
    parseManagerCommand("הפעל בוט 0501234567").type,
    "RESUME_BOT"
  );
});

test("פקודות מנהל: פקודה לא מובנת מזוהה (תיקון \\b בעברית)", () => {
  assert.equal(
    parseManagerCommand("תוסיף").type,
    "INVALID_MANAGER_COMMAND"
  );
  assert.equal(parseManagerCommand("בוקר טוב"), null);
});

test("זיהוי יום: ראשון לציון אינו יום ראשון", () => {
  assert.equal(
    getDayOfWeekFromText("גלי הדר ראשון לציון שלישי 18:00"),
    3
  );
  assert.equal(getDayOfWeekFromText("צעירה בחמישי"), 5);
  assert.equal(
    getDayOfWeekFromText("כולל שנה שניה"),
    null
  );
  assert.equal(
    parseGaliHadarSlot("גלי הדר ראשון לציון שלישי 18:00").dayOfWeek,
    3
  );
});

test("תאריך מפגש: יום מפורש = המופע האחרון שלו", () => {
  // יום חמישי 15.10.2026 בשעון ישראל
  const now = new Date("2026-10-15T10:00:00Z");

  assert.deepEqual(resolveSessionDate({ dayOfWeek: 3, now }), {
    sessionDate: "2026-10-13",
    dayOfWeek: 3,
  });

  assert.deepEqual(resolveSessionDate({ dateOffsetDays: -1, now }), {
    sessionDate: "2026-10-14",
    dayOfWeek: 4,
  });

  assert.equal(resolveSessionDate({ now }).sessionDate, "2026-10-15");
  assert.equal(
    resolveSessionDate({ dayOfWeek: 5, now }).sessionDate,
    "2026-10-15"
  );
});

test("תאריך מפגש: אחרי חצות בישראל זה כבר היום הבא", () => {
  // 22:30 UTC = 01:30 בישראל (שעון קיץ)
  const now = new Date("2026-10-14T22:30:00Z");

  assert.equal(resolveSessionDate({ now }).sessionDate, "2026-10-15");
});

test("יעד רשימה: נבחרת / מפגש / קבוצה רגילה", () => {
  assert.equal(parseSlotsTarget("צעירה").type, "team");
  assert.equal(parseSlotsTarget("נבחרת בוגרת חמישי").dayOfWeek, 5);
  assert.equal(
    parseSlotsTarget("גלי הדר שלישי 18:00").type,
    "slot"
  );
  assert.equal(parseSlotsTarget("א+ד 16:45"), null);
});

test("נוכחות לפי שעה בלבד: '18:00:' בשורה הראשונה", () => {
  const result = parseAttendanceCommand(
    "18:00:\nמורל\nשון\nדניאל"
  );

  assert.equal(result.isAttendanceCommand, true);
  assert.equal(result.groupName, "18:00");
  assert.deepEqual(result.presentNames, ["מורל", "שון", "דניאל"]);

  assert.equal(parseAttendanceCommand("נוכחות 18:00\nדני").groupName, "18:00");
  assert.equal(parseAttendanceCommand("בשעה 17\nדני").groupName, "בשעה 17");
  assert.equal(parseAttendanceCommand("18:00 שלישי\nדני").groupName, "18:00 שלישי");
  assert.equal(
    parseAttendanceCommand("נוכחות 18:00 אתמול\nדני").dateOffsetDays,
    -1
  );
});

test("parseTimeOnlyGroup: שעה ויום אופציונלי", () => {
  assert.deepEqual(parseTimeOnlyGroup("18:00"), { time: "18:00", dayOfWeek: null });
  assert.deepEqual(parseTimeOnlyGroup("18"), { time: "18:00", dayOfWeek: null });
  assert.deepEqual(parseTimeOnlyGroup("16.30"), { time: "16:30", dayOfWeek: null });
  assert.deepEqual(parseTimeOnlyGroup("בשעה 17"), { time: "17:00", dayOfWeek: null });
  assert.deepEqual(parseTimeOnlyGroup("18:00 שלישי"), { time: "18:00", dayOfWeek: 3 });
  assert.equal(parseTimeOnlyGroup("א+ד 16:00"), null);
  assert.equal(parseTimeOnlyGroup("צעירה"), null);
  assert.equal(parseTimeOnlyGroup("18:00 משהו"), null);
  assert.equal(parseTimeOnlyGroup("99"), null);
});

test("parseGroupSchedule: ימים ושעות מתוך שם הקבוצה", () => {
  assert.deepEqual(parseGroupSchedule("א+ד 18:00 – ו+"), [
    { days: [1, 4], start: "18:00" },
  ]);

  assert.deepEqual(
    parseGroupSchedule("א+ד 17:00 + ג 18:00 – עתודה"),
    [
      { days: [1, 4], start: "17:00" },
      { days: [3], start: "18:00" },
    ]
  );

  assert.deepEqual(
    parseGroupSchedule("ב+ג+ה 16:30-18:00 – נבחרת צעירה"),
    [{ days: [2, 3, 5], start: "16:30" }]
  );

  assert.deepEqual(
    parseGroupSchedule(
      "א+ד 18:45-20:15 + ב+ה 19:30-20:30 – תחרותי ללא הסעות"
    ),
    [
      { days: [1, 4], start: "18:45" },
      { days: [2, 5], start: "19:30" },
    ]
  );

  assert.deepEqual(parseGroupSchedule("בוגרת"), []);
});

test("התאמת שם מתאמן: שם פרטי ייחודי", () => {
  const trainees = [
    { name: "רז לזרסקי" },
    { name: "מישל אלגריסי" },
    { name: "רז כהן" },
  ];

  assert.equal(findMatchingTrainee("מישל", trainees).name, "מישל אלגריסי");
  assert.equal(findMatchingTrainee("רז", trainees), null);
  assert.equal(
    findMatchingTrainee("רז כהן", trainees).name,
    "רז כהן"
  );
});
