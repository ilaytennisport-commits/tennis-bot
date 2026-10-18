/*
 * =========================================================
 * סביבת בדיקות — בלי מסד נתונים, בלי WhatsApp ובלי OpenAI
 * =========================================================
 *
 * מחליף את המודולים החיצוניים בגרסאות בזיכרון, כך שאפשר
 * להריץ שיחות שלמות מול הקוד האמיתי של הבוט.
 * יש לקרוא ל-setupHarness() לפני require של קוד הבוט.
 */

const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function installModule(relativePath, exports) {
  const fullPath = require.resolve(
    path.join(ROOT, relativePath)
  );

  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

function installPackage(name, exports) {
  const fullPath = require.resolve(name, {
    paths: [ROOT],
  });

  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

function createState() {
  return {
    users: new Map(),
    messages: new Map(),
    leads: [],
    processed: new Set(),
    sent: [],
    failRecipients: new Set(),
    openaiReplies: [],
    openaiCalls: 0,
    dbDown: false,
    nextId: 1,
  };
}

function setupHarness(env = {}) {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test",
    OPENAI_API_KEY: "test",
    WHAPI_TOKEN: "test",
    MANAGER_PHONES: "0500000001",
    CLUB_MANAGER_PHONE: "0500000001",
    COACH_PHONES: "0500000002",
    TEST_PHONES: "0500000009",
    HANDOFF_PAUSE_HOURS: "12",
    ...env,
  });

  const state = createState();

  /* ---------- מסד נתונים ---------- */

  async function query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim();

    if (/^SELECT 1$/.test(text)) {
      return { rows: [{}], rowCount: 1 };
    }

    if (/^INSERT INTO leads/.test(text)) {
      const lead = {
        id: state.nextId++,
        user_id: params[0],
        kind: params[1],
        message: params[2],
        details: params[3],
        status: "pending",
        attempts: 0,
        last_error: null,
      };

      state.leads.push(lead);

      return { rows: [lead], rowCount: 1 };
    }

    if (/^UPDATE leads/.test(text)) {
      const lead = state.leads.find(
        (item) => item.id === params[0]
      );

      lead.status = params[1];
      lead.attempts += 1;
      lead.last_error = params[2];

      return { rows: [], rowCount: 1 };
    }

    if (/^SELECT id, user_id, kind, message FROM leads/.test(text)) {
      const rows = state.leads.filter(
        (lead) =>
          ["pending", "failed"].includes(lead.status) &&
          lead.attempts < params[0]
      );

      return { rows, rowCount: rows.length };
    }

    if (/^INSERT INTO processed_messages/.test(text)) {
      if (state.processed.has(params[0])) {
        return { rows: [], rowCount: 0 };
      }

      state.processed.add(params[0]);

      return { rows: [{ message_id: params[0] }], rowCount: 1 };
    }

    if (/^DELETE FROM processed_messages/.test(text)) {
      return { rows: [], rowCount: 0 };
    }

    if (/^INSERT INTO users \( user_id, bot_paused_until/.test(text)) {
      const until = new Date(
        Date.now() + Number(params[1]) * 3600 * 1000
      );

      const user = state.users.get(params[0]) || {};

      state.users.set(params[0], {
        ...user,
        bot_paused_until: until,
      });

      return { rows: [{ bot_paused_until: until }], rowCount: 1 };
    }

    if (/^UPDATE users SET bot_paused_until = NULL/.test(text)) {
      const user = state.users.get(params[0]);

      if (!user) {
        return { rows: [], rowCount: 0 };
      }

      user.bot_paused_until = null;

      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in test: ${text.slice(0, 80)}`);
  }

  const pool = {
    query,
    connect: async () => ({
      query,
      release() {},
    }),
    end: async () => {},
    on() {},
  };

  installModule("services/databaseService.js", {
    pool,
    initializeDatabase: async () => {},
  });

  /* ---------- פרופיל משתמש ---------- */

  function emptyUser() {
    return {
      name: null,
      age: null,
      city: null,
      height: null,
      audience: null,
      equipment_topic: null,
      experience: null,
      branch: null,
      phone: null,
      goal: null,
      source: null,
      source_confirmed: false,
      regular_flow_active: false,
      summary_sent: false,
      bot_paused_until: null,
      pending_message: null,
    };
  }

  async function getUser(userId) {
    if (state.dbDown) {
      throw new Error("DB down");
    }

    return {
      ...emptyUser(),
      ...(state.users.get(userId) || {}),
    };
  }

  async function saveUser(userId, data = {}) {
    const updated = {
      ...(await getUser(userId)),
      ...data,
    };

    state.users.set(userId, updated);

    return { ...updated };
  }

  installModule("prompts/memory/usermemory.js", {
    emptyUser,
    getUser,
    saveUser,
    markSummarySent: (userId) =>
      saveUser(userId, { summary_sent: true }),
    clearUser: async (userId) => {
      state.users.delete(userId);
    },
  });

  /* ---------- היסטוריית שיחה ---------- */

  function history(userId) {
    if (!state.messages.has(userId)) {
      state.messages.set(userId, []);
    }

    return state.messages.get(userId);
  }

  installModule("services/conversationService.js", {
    getConversation: async (userId, limit = 12) =>
      history(userId).slice(-limit),
    getFullConversation: async (userId) =>
      history(userId).slice(-40),
    addMessage: async (userId, role, content) => {
      if (userId && role && content) {
        history(userId).push({ role, content });
      }
    },
    clearConversation: async (userId) => {
      state.messages.delete(userId);
    },
  });

  /* ---------- WhatsApp (axios) ---------- */

  installPackage("axios", {
    post: async (url, payload) => {
      if (state.failRecipients.has(payload.to)) {
        const error = new Error("Whapi rejected");
        error.response = { status: 400, data: {} };
        throw error;
      }

      const id = `bot-${state.nextId++}`;

      state.sent.push({
        to: payload.to,
        body: payload.body,
        id,
      });

      return {
        status: 200,
        data: { sent: true, message: { id } },
      };
    },
  });

  /* ---------- OpenAI ---------- */

  installModule("services/openaiService.js", {
    generateReply: async () => {
      state.openaiCalls += 1;

      return (
        state.openaiReplies.shift() ||
        "תשובה כללית מהבינה המלאכותית."
      );
    },
    OPENAI_FALLBACK_REPLY: "fallback",
  });

  return state;
}

let messageCounter = 0;

function textMessage(chatId, body, extra = {}) {
  messageCounter += 1;

  return {
    id: `in-${messageCounter}`,
    from_me: false,
    type: "text",
    chat_id: chatId,
    text: { body },
    ...extra,
  };
}

/*
 * מחזיר את ההודעות שנשלחו לנמען מסוים (לפי ספרות המספר).
 */
function sentTo(state, recipient) {
  const digits = String(recipient)
    .split("@")[0]
    .replace(/\D/g, "")
    .replace(/^0/, "972");

  return state.sent.filter(
    (message) =>
      String(message.to)
        .split("@")[0]
        .replace(/\D/g, "") === digits
  );
}

function lastSentTo(state, recipient) {
  const messages = sentTo(state, recipient);

  return messages[messages.length - 1]?.body || "";
}

module.exports = {
  setupHarness,
  textMessage,
  sentTo,
  lastSentTo,
};
