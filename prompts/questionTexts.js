/*
 * =========================================================
 * נוסחי שאלות שהבוט שואל
 * =========================================================
 *
 * הבוט מזהה באיזה שלב השיחה נמצאת לפי השאלה האחרונה ששאל.
 * לכן כל שאלה כזו מוגדרת כאן פעם אחת, ומשמשת גם לשליחה
 * וגם לזיהוי. אסור לשנות נוסח במקום אחר בקוד.
 *
 * LEGACY_* — נוסחים ישנים שעדיין יכולים להופיע בהיסטוריה
 * של לקוחות שהתחילו שיחה לפני העדכון.
 */

const BRANCH_OPTIONS = [
  "• גלי הדר – ראשון לציון",
  "• בית חשמונאי",
];

const QUESTIONS = {
  leadName: "מה שם המתאמן או המתאמנת?",
  leadAge: "מה גיל המתאמן או המתאמנת?",
  leadBranch: "באיזה סניף תרצו להתאמן?",
  leadPhone:
    "לאיזה מספר טלפון נוכל לחזור אליכם?",

  recommendAge:
    "בן או בת כמה המתאמן או המתאמנת?",
  experience:
    "יש ניסיון קודם בטניס, או שמדובר בהתחלה מאפס?",
  childExperienceDetails:
    "כדי שאכוון נכון — כמה זמן נמשך הניסיון בטניס ובאיזו רמה בערך?",
  adultFormat:
    "מה מעדיפים — קבוצה או מסגרת אישית יותר?",
  goal:
    "מה חשוב לך יותר כרגע — שיפור טכניקה, כושר או יותר משחקים?",
  branchPreference:
    "באיזה סניף יהיה לכם הכי נוח להתאמן?",
  trialOffer:
    "תרצו שאעזור להתקדם עם אימון ניסיון?",
  anotherTrainee:
    'אם תרצו לרשום מתאמן או מתאמנת נוספים, כתבו "מתאמן נוסף".',
  source: "איך שמעתם עלינו?",
};

const LEGACY = {
  leadName: ["מה שם הילד או הילדה?"],
  leadAge: ["מה גיל הילד או הילדה?"],
  leadBranch: ["באיזה סניף אתם מעוניינים?"],
  experience: [
    "מתחיל לגמרי",
    "כבר שיחק בעבר",
    "כבר שיחקה בעבר",
    "רמת הניסיון",
  ],
  adultFormat: [
    "אתה מעדיף קבוצה או מסגרת אישית יותר",
  ],
  branchPreference: [
    "באיזה סניף יהיה לך הכי נוח",
    "באיזה סניף יהיה לכם הכי נוח",
  ],
  trialOffer: [
    "תרצה שאעזור להתקדם עם אימון ניסיון",
    "תרצו שאעזור להתקדם עם אימון ניסיון",
  ],
};

/*
 * בודק אם הודעת הבוט מכילה את השאלה (בנוסח החדש או הישן).
 */
function askedQuestion(
  assistantMessage = "",
  key
) {
  const text = String(
    assistantMessage || ""
  );

  const variants = [
    QUESTIONS[key],
    ...(LEGACY[key] || []),
  ].filter(Boolean);

  return variants.some((variant) =>
    text.includes(
      variant.replace(/\?$/, "")
    )
  );
}

function buildBranchQuestion(
  question = QUESTIONS.leadBranch
) {
  return [question, ...BRANCH_OPTIONS].join(
    "\n"
  );
}

module.exports = {
  QUESTIONS,
  LEGACY,
  BRANCH_OPTIONS,
  askedQuestion,
  buildBranchQuestion,
};
