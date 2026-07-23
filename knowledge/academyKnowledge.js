const academyKnowledge = {
  name: "האקדמיה לטניס גלי הדר",
  officialPhone: "0559113235",
  website: "https://www.tennis-galey-hadar.com/",

  branches: [
    {
      id: "galey-hadar",
      name: "קאנטרי גלי הדר",
      city: "ראשון לציון",
      address: "רמז 96, ראשון לציון"
    },
    {
      id: "beit-dagan",
      name: "בית דגן",
      city: "בית דגן",
      address: null
    },
    {
      id: "beit-hashmonai",
      name: "בית חשמונאי",
      city: "בית חשמונאי",
      address: null
    }
  ],

  minimumAge: 5,

  services: [
    "חוגי טניס לילדים",
    "חוגי טניס לנוער",
    "אימוני טניס למבוגרים",
    "אימונים קבוצתיים",
    "אימונים אישיים",
    "אימונים זוגיים",
    "כרטיסיות אימון למבוגרים",
    "אימוני ניסיון",
    "אימונים למתחילים",
    "אימונים למתקדמים",
    "אימונים לשיפור כושר גופני",
    "אימונים לשיפור טכניקה ומיומנויות משחק",
    "התאמת מסלול לפי גיל, רמה, מטרה וסניף"
  ],

  trialLessons: {
    children: {
      price: 0,
      description: "אימון ניסיון לילדים ללא עלות, כחלק מקבוצה קיימת."
    },
    adults: {
      price: 50,
      description: "אימון ניסיון למבוגר בעלות של 50 ש״ח, כחלק מקבוצה קיימת."
    }
  },

  pricing: {
    children: [
      { label: "60 דקות בשבוע", price: 240, billing: "בחודש" },
      { label: "שעתיים בשבוע", price: 375, billing: "בחודש" },
      { label: "3 שעות בשבוע", price: 500, billing: "בחודש" },
      { label: "3 פעמים בשבוע, 90 דקות בכל פעם", price: 710, billing: "בחודש" },
      { label: "5.5 שעות בשבוע", price: 890, billing: "בחודש" }
    ],
    adults: [
      { label: "60 דקות פעם בשבוע", price: 320, billing: "בחודש" },
      { label: "פעמיים בשבוע, 60 דקות בכל פעם", price: 600, billing: "בחודש" },
      { label: "כרטיסייה של 10 שעות", price: 800, billing: "" },
      { label: "כרטיסייה של 20 שעות", price: 1550, billing: "" },
      { label: "אימון זוגי של 60 דקות", price: 300, billing: "" },
      { label: "אימון אישי של 60 דקות", price: 250, billing: "" },
      { label: "אימון ניסיון למבוגר", price: 50, billing: "" }
    ]
  },

  policies: {
    trialInsideExistingGroup: true,
    neverPromiseAvailability: true,
    neverPromiseSchedule: true,
    neverPromiseCoach: true,
    neverReferToCompetitors: true,
    onlyPublicPhone: "0559113235"
  },

  fallbackResponse:
    "באקדמיה יש מגוון רחב של אפשרויות והתאמה אישית. כדי לתת תשובה מדויקת, צוות האקדמיה יבדוק את הנושא ויחזור אליכם."
};

module.exports = academyKnowledge;
