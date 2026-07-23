const academy = require("../knowledge/academyKnowledge");

const formatPrice = (price) => Number(price).toLocaleString("he-IL");

const formatPriceList = (items) =>
  items
    .map((item) => `• ${item.label}: ${formatPrice(item.price)} ש"ח${item.billing ? ` ${item.billing}` : ""}`)
    .join("\n");

function getFaqResponse(intent, context = {}) {
  switch (intent) {
    case "contact":
      return `ניתן ליצור קשר עם האקדמיה בטלפון ${academy.officialPhone}. הצוות ישמח לעזור ולהעביר את הפנייה לגורם המתאים.`;
case "tennis_equipment":
  return [
    "באקדמיה יש מגוון אפשרויות גם בנושא מחבטים וציוד טניס.",
    "צוות האקדמיה יוכל לבדוק מה מתאים לך לפי הגיל, הרמה והצרכים שלך.",
    "",
    "האם המחבט מיועד למתחיל או למישהו שכבר משחק?"
  ].join("\n");
    case "branches":
      return [
        "אנחנו פועלים בשלושה סניפים:",
        "• קאנטרי גלי הדר — רמז 96, ראשון לציון",
        "• בית דגן",
        "• בית חשמונאי",
        "",
        "איזה סניף הכי נוח לכם?"
      ].join("\n");

    case "minimum_age":
      return `ניתן להתחיל להתאמן אצלנו מגיל ${academy.minimumAge}. ההתאמה נעשית לפי גיל ורמת ניסיון. בן או בת כמה המתאמן או המתאמנת?`;

    case "personal_training":
      return `כן, יש אצלנו אימונים אישיים. אימון אישי של 60 דקות למבוגר עולה 250 ש"ח. ניתן גם לבדוק התאמה לילדים ולנוער לפי גיל ומטרה. למי מיועד האימון?`;

    case "adults":
      return [
        "כן, יש אצלנו אימונים למבוגרים ברמות שונות — גם למתחילים וגם למנוסים.",
        "אפשר להתאמן בקבוצה, באימון אישי או באימון זוגי.",
        "",
        "איזו מסגרת מעניינת אותך?"
      ].join("\n");

    case "trial": {
      if (context.audience === "adult") {
        return `${academy.trialLessons.adults.description} באיזה סניף נוח לך להתאמן?`;
      }
      if (context.audience === "child") {
        return `${academy.trialLessons.children.description} מה גיל הילד או הילדה?`;
      }
      return `יש אימוני ניסיון לילדים ולמבוגרים. לילדים האימון ללא עלות, ולמבוגרים בעלות של 50 ש"ח. האימון מתקיים כחלק מקבוצה קיימת. האם מדובר בילד או במבוגר?`;
    }

    case "pricing": {
      if (context.audience === "child") {
        return `מחירון ילדים:\n${formatPriceList(academy.pricing.children)}\n• אימון ניסיון: ללא עלות\n\nבאיזה גיל מדובר?`;
      }
      if (context.audience === "adult") {
        return `מחירון מבוגרים:\n${formatPriceList(academy.pricing.adults)}\n\nאיזו מסגרת מעניינת אותך?`;
      }
      return "בשמחה. המחירון שונה לילדים ולמבוגרים. למי מיועד האימון?";
    }

    case "lead":
      return "בשמחה. כדי להתאים לכם את האפשרות הנכונה, מה שם המתאמן או המתאמנת?";

    default:
      return null;
  }
}

module.exports = { getFaqResponse, formatPriceList };
