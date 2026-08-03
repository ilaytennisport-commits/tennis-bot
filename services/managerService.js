const { sendWhatsAppMessage } = require("./whapiService");

const CLUB_MANAGER_PHONE = process.env.CLUB_MANAGER_PHONE;

function formatManagerLeadMessage(user, conversationHistory = []) {
  const cleanPhone = String(user.phone || "").replace(/\D/g, "");

  let internationalPhone = cleanPhone;

  if (cleanPhone.startsWith("0")) {
    internationalPhone = `972${cleanPhone.substring(1)}`;
  }

  const whatsappLink = internationalPhone
    ? `https://wa.me/${internationalPhone}`
    : "לא זמין";

  const conversation = conversationHistory
    .filter(
      (m) =>
        m?.content &&
        ["user", "assistant"].includes(m.role)
    )
    .map((m) => {
      const speaker =
        m.role === "user"
          ? "👤 לקוח"
          : "🤖 בוט";

      return `${speaker}\n${m.content}`;
    })
    .join("\n\n");

  const receivedAt = new Intl.DateTimeFormat(
    "he-IL",
    {
      timeZone: "Asia/Jerusalem",
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(new Date());

  return [
    "🎾 ליד חדש - Tennis Sport",
    "",
    `👤 שם: ${user.name}`,
    `🎂 גיל: ${user.age}`,
    `📍 סניף: ${user.branch}`,
    `📞 טלפון: ${user.phone}`,
    `🎯 התעניינות: ${user.goal}`,
    `🕒 התקבל: ${receivedAt}`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "💬 השיחה:",
    "",
    conversation || "אין שיחה.",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    whatsappLink,
  ].join("\n");
}

async function sendLeadToManager(
  user,
  conversationHistory
) {
  if (!CLUB_MANAGER_PHONE) {
    console.warn(
      "⚠️ CLUB_MANAGER_PHONE לא הוגדר"
    );

    return false;
  }

  try {
    await sendWhatsAppMessage(
      CLUB_MANAGER_PHONE,
      formatManagerLeadMessage(
        user,
        conversationHistory
      )
    );

    console.log(
      "✅ הליד נשלח למנהל"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ שליחת הליד נכשלה:",
      error.response?.data ||
        error.message
    );

    return false;
  }
}

module.exports = {
  sendLeadToManager,
};