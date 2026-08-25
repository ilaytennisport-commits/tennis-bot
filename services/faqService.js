const academy = require(
  "../knowledge/academyKnowledge"
);

const {
  getEquipmentResponse,
} = require("./equipmentService");

const formatPrice = (price) =>
  Number(price).toLocaleString(
    "he-IL"
  );

const formatPriceList = (items) =>
  items
    .map(
      (item) =>
        `• ${item.label}: ${formatPrice(
          item.price
        )} ש"ח${
          item.billing
            ? ` ${item.billing}`
            : ""
        }`
    )
    .join("\n");

function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

function getFaqResponse(
  intent,
  context = {}
) {
  const profile =
    context.profile || {};

  switch (intent) {
    case "contact":
      return `ניתן ליצור קשר עם האקדמיה בטלפון ${academy.officialPhone}. הצוות ישמח לעזור ולהעביר את הפנייה לגורם המתאים.`;

    case "tennis_equipment":
      return getEquipmentResponse(
        context.originalMessage || "",
        profile
      );

    case "branches":
      return [
        "אנחנו פועלים בשני סניפים:",
        "• קאנטרי גלי הדר — רמז 96, ראשון לציון",
        "• בית חשמונאי",
        "",
        hasValue(profile.branch)
          ? `כבר רשום לי שהסניף הרלוונטי הוא ${profile.branch}.`
          : "איזה סניף הכי נוח לכם?"
      ].join("\n");

    case "minimum_age":
      if (hasValue(profile.age)) {
        return `ניתן להתחיל להתאמן אצלנו מגיל ${academy.minimumAge}. לפי הגיל שכבר ציינתם — ${profile.age} — אפשר לבדוק התאמה לקבוצה לפי גיל ורמת ניסיון.`;
      }

      return `ניתן להתחיל להתאמן אצלנו מגיל ${academy.minimumAge}. ההתאמה נעשית לפי גיל ורמת ניסיון. בן או בת כמה המתאמן או המתאמנת?`;

    case "personal_training":
      if (
        context.audience === "adult"
      ) {
        return `כן, יש אצלנו אימונים אישיים. אימון אישי של 60 דקות למבוגר עולה 250 ש"ח.`;
      }

      if (
        context.audience === "child"
      ) {
        return `יש אפשרות לבדוק התאמה לאימון אישי גם לילדים ולנוער, לפי גיל ומטרה.`;
      }

      return `כן, יש אצלנו אימונים אישיים. אימון אישי של 60 דקות למבוגר עולה 250 ש"ח. למי מיועד האימון?`;

    case "adults":
      return [
        "כן, יש אצלנו אימונים למבוגרים ברמות שונות — גם למתחילים וגם למנוסים.",
        "אפשר להתאמן בקבוצה, באימון אישי או באימון זוגי.",
        "",
        hasValue(profile.experience)
          ? profile.experience ===
            "beginner"
            ? "לפי מה שכבר ציינת, מדובר במתחיל."
            : "לפי מה שכבר ציינת, כבר יש ניסיון קודם."
          : "איזו מסגרת מעניינת אותך?"
      ].join("\n");

    case "trial": {
      if (
        context.audience === "adult"
      ) {
        if (
          hasValue(profile.branch)
        ) {
          return `${academy.trialLessons.adults.description} הסניף שכבר רשום לי הוא ${profile.branch}.`;
        }

        return `${academy.trialLessons.adults.description} באיזה סניף נוח לך להתאמן?`;
      }

      if (
        context.audience === "child"
      ) {
        if (
          hasValue(profile.age)
        ) {
          if (
            hasValue(profile.branch)
          ) {
            return `${academy.trialLessons.children.description} לפי גיל ${profile.age} והסניף ${profile.branch}, אפשר לבדוק התאמה לקבוצה קיימת.`;
          }

          return `${academy.trialLessons.children.description} לפי גיל ${profile.age}, אפשר לבדוק התאמה לקבוצה מתאימה. באיזה סניף נוח לכם?`;
        }

        return `${academy.trialLessons.children.description} מה גיל הילד או הילדה?`;
      }

      return `יש אימוני ניסיון לילדים ולמבוגרים. לילדים האימון ללא עלות, ולמבוגרים בעלות של 50 ש"ח. האימון מתקיים כחלק מקבוצה קיימת. האם מדובר בילד או במבוגר?`;
    }

    case "pricing": {
      if (
        context.audience === "child"
      ) {
        const priceList = [
          "מחירון ילדים:",
          formatPriceList(
            academy.pricing.children
          ),
          "• אימון ניסיון: ללא עלות"
        ];

        if (
          hasValue(profile.age)
        ) {
          priceList.push(
            "",
            `לפי הגיל שכבר ציינתם — ${profile.age} — אפשר להתאים את המסלול לפי רמת הניסיון ותדירות האימונים הרצויה.`
          );
        } else {
          priceList.push(
            "",
            "באיזה גיל מדובר?"
          );
        }

        return priceList.join(
          "\n"
        );
      }

      if (
        context.audience === "adult"
      ) {
        const priceList = [
          "מחירון מבוגרים:",
          formatPriceList(
            academy.pricing.adults
          )
        ];

        if (
          hasValue(
            profile.experience
          )
        ) {
          priceList.push(
            "",
            profile.experience ===
              "beginner"
              ? "לפי מה שכבר ציינת, אתה מתחיל, ולכן אפשר להתמקד במסלולים שמתאימים למתחילים."
              : "לפי מה שכבר ציינת, יש לך ניסיון קודם, ולכן אפשר להתאים מסגרת לפי הרמה והמטרה."
          );
        } else {
          priceList.push(
            "",
            "איזו מסגרת מעניינת אותך?"
          );
        }

        return priceList.join(
          "\n"
        );
      }

      return "בשמחה. המחירון שונה לילדים ולמבוגרים. למי מיועד האימון?";
    }

    case "lead":
      return hasValue(profile.name)
        ? "בשמחה. נמשיך מהפרטים שכבר שמורים ונאסוף רק את מה שחסר."
        : "בשמחה. כדי להתאים לכם את האפשרות הנכונה, מה שם המתאמן או המתאמנת?";

    default:
      return null;
  }
}

module.exports = {
  getFaqResponse,
  formatPriceList,
};