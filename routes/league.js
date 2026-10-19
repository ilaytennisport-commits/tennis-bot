const express = require("express");

const league = require("../services/leagueService");
const views = require("../services/leagueViews");
const { getPublicBaseUrl } = require("../services/attendanceViewService");

/*
 * =========================================================
 * ליגת טניס — כתובות
 * =========================================================
 *
 * /league                    דף הליגה (ציבורי, קישור אחד לכולם)
 * /league/login              התחברות שחקן: טלפון + סיסמה
 * /league/me                 המשחקים שלי
 * /league/match/:id          דיווח / תיקון תוצאה
 * /league/admin/:token/...   ניהול (קישור סודי — "קישור ליגה" בוואטסאפ)
 */

const BASE = "/league";
const SESSION_COOKIE = "lg_s";
const ADMIN_LEAGUE_COOKIE = "lg_al";

const PUBLIC_FLASH = {
  saved: "התוצאה נשמרה והטבלה עודכנה.",
  welcome: "התחברת! מעכשיו הטלפון הזה זוכר אותך.",
  out: "התנתקת.",
};

const router = express.Router();

router.use(express.urlencoded({ extended: false, limit: "100kb" }));

/*
 * טופס שנשלח מאתר אחר — נחסם.
 */
router.use((req, res, next) => {
  if (req.method === "POST" && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        return res.status(403).send("Forbidden");
      }
    } catch {
      return res.status(403).send("Forbidden");
    }
  }

  res.set("Cache-Control", "no-store");
  next();
});

function safe(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error("❌ שגיאה בדף הליגה:", error.message);

      if (!res.headersSent) {
        res
          .status(500)
          .type("html")
          .send(views.renderMessage({ title: "שגיאה", message: "שגיאה זמנית. נסו לרענן בעוד רגע." }));
      }
    }
  };
}

/* =========================================================
 * עוגיות
 * ========================================================= */

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function isHttps(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function setCookie(req, res, name, value, maxAgeSeconds, path = BASE) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isHttps(req)) {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}

/* =========================================================
 * הגבלת ניסיונות התחברות
 * ========================================================= */

const loginFailures = new Map();
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

function isLocked(key) {
  const entry = loginFailures.get(key);

  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }

  return entry.count >= MAX_FAILURES;
}

function recordFailure(key) {
  const entry = loginFailures.get(key);

  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) {
    loginFailures.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

/* =========================================================
 * הקשר משותף לדפים הציבוריים
 * ========================================================= */

async function publicContext(req, activeLeague) {
  const sessionPlayer = await league.getSessionPlayer(readCookie(req, SESSION_COOKIE));
  const me = sessionPlayer && sessionPlayer.league_id === activeLeague.id ? sessionPlayer : null;

  return {
    league: activeLeague,
    base: BASE,
    me,
    points: league.leaguePoints(activeLeague),
    today: league.israelToday(),
    flash: { ok: PUBLIC_FLASH[req.query.ok] || "" },
    byId: {},
  };
}

function pickDivision(divisions, requested, me) {
  return (
    divisions.find((d) => d.id === Number(requested)) ||
    (me && divisions.find((d) => d.id === me.division_id)) ||
    divisions[0] ||
    null
  );
}

const TAB_KEYS = ["table", "matches", "ko", "players", "info"];

async function renderLeagueHome(req, res, activeLeague, extra = {}) {
  const ctx = { ...(await publicContext(req, activeLeague)), ...extra };
  const divisions = await league.getDivisions(activeLeague.id);
  const division = pickDivision(divisions, req.query.d, ctx.me);
  const data = division ? await league.loadDivision(division, activeLeague) : null;
  const tab = TAB_KEYS.includes(req.query.tab) ? req.query.tab : "table";

  if (data) {
    ctx.byId = data.byId;
  }

  res.type("html").send(views.renderHome({ ctx, divisions, data, tab, query: req.query }));
}

async function renderPlayerPage(req, res, activeLeague, extra = {}) {
  const player = await league.getPlayer(req.params.id);

  if (!player || player.league_id !== activeLeague.id || !player.division_id) {
    return res.status(404).type("html").send(views.renderMessage({ title: "לא נמצא", message: "השחקן לא נמצא." }));
  }

  const ctx = { ...(await publicContext(req, activeLeague)), ...extra };
  const division = await league.getDivision(player.division_id);
  const data = await league.loadDivision(division, activeLeague);

  ctx.byId = data.byId;
  res.type("html").send(views.renderPlayer({ ctx, player, data }));
}

/* =========================================================
 * ניהול — חייב להיות לפני הכתובות הציבוריות עם פרמטרים
 * ========================================================= */

const admin = express.Router({ mergeParams: true });

router.use(
  "/admin/:token",
  safe(async (req, res, next) => {
    if (!(await league.isValidAdminToken(req.params.token))) {
      return res.status(404).type("html").send(views.renderMessage({ title: "לא נמצא", message: "הקישור לא תקין או שהוחלף." }));
    }

    req.adminBase = `${BASE}/admin/${req.params.token}`;
    next();
  }),
  admin
);

async function adminLeague(req, res) {
  const requested = Number(req.query.l || req.body?.league_id) || 0;

  if (requested && (await league.getLeague(requested))) {
    setCookie(req, res, ADMIN_LEAGUE_COOKIE, String(requested), 60 * 60 * 24 * 365, req.adminBase);
    return league.getLeague(requested);
  }

  const remembered = Number(readCookie(req, ADMIN_LEAGUE_COOKIE)) || 0;

  return (
    (remembered && (await league.getLeague(remembered))) ||
    (await league.getActiveLeague()) ||
    (await league.listLeagues())[0] ||
    null
  );
}

function adminFlash(req) {
  return {
    ok: String(req.query.ok || "").slice(0, 300),
    err: String(req.query.err || "").slice(0, 300),
  };
}

function back(res, url, { ok, err } = {}) {
  const params = new URLSearchParams();

  if (ok) params.set("ok", ok);
  if (err) params.set("err", err);

  const query = params.toString();

  res.redirect(303, query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url);
}

function adminContext(req, activeLeague, data) {
  return {
    league: activeLeague,
    base: `${req.adminBase}/preview`,
    adminBase: req.adminBase,
    me: null,
    points: league.leaguePoints(activeLeague),
    today: league.israelToday(),
    byId: data ? data.byId : {},
    back: data ? `${req.adminBase}/division/${data.division.id}` : req.adminBase,
  };
}

admin.get(
  "/",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);
    const divisions = current ? await league.getDivisions(current.id) : [];
    const stats = {};

    for (const d of divisions) {
      const data = await league.loadDivision(d, current);
      const groupMatches = data.matches.filter((m) => m.stage === "group");

      stats[d.id] = {
        players: data.players.length,
        groups: data.groups.length,
        total: groupMatches.length,
        done: groupMatches.filter((m) => m.status === "done").length,
      };
    }

    const host = getPublicBaseUrl(req.headers.host) || "";

    res.type("html").send(
      views.renderAdminHome({
        adminBase: req.adminBase,
        league: current,
        leagues: await league.listLeagues(),
        divisions,
        stats,
        publicUrl: `${host}${BASE}`,
        flash: adminFlash(req),
      })
    );
  })
);

admin.post(
  "/league",
  safe(async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return back(res, req.adminBase, { err: "חסר שם לליגה." });
    }

    const id = await league.createLeague({ name, season: req.body.season });

    back(res, `${req.adminBase}?l=${id}`, { ok: "הליגה נפתחה." });
  })
);

admin.post(
  "/activate",
  safe(async (req, res) => {
    const id = Number(req.body.league) || 0;

    if (await league.getLeague(id)) {
      await league.setActiveLeague(id);
    }

    back(res, `${req.adminBase}?l=${id}`, { ok: "זו הליגה שמוצגת עכשיו בקישור לשחקנים." });
  })
);

admin.post(
  "/settings",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);

    await league.updateLeague(current.id, {
      name: req.body.name,
      season: req.body.season,
      points_win: req.body.points_win,
      points_loss: req.body.points_loss,
      points_walkover: req.body.points_walkover,
      rules_url: /^https?:\/\//.test(String(req.body.rules_url || "")) ? req.body.rules_url : "",
      info: String(req.body.info || "").slice(0, 3000),
      sheet_url: current.sheet_url,
    });

    back(res, req.adminBase, { ok: "ההגדרות נשמרו." });
  })
);

admin.post(
  "/import",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);
    const result = await league.importFromSheet(current.id, String(req.body.url || "").trim());

    if (!result.ok) {
      return back(res, req.adminBase, { err: result.error });
    }

    const parts = [`נוספו ${result.added} שחקנים`, `עודכנו ${result.updated}`];

    if (result.skipped.length) {
      parts.push(`דולגו (חסר שם או טלפון): ${result.skipped.join(", ")}`);
    }

    back(res, req.adminBase, { ok: parts.join(" · ") });
  })
);

admin.post(
  "/division",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);
    const name = String(req.body.name || "").trim();

    if (!name) {
      return back(res, req.adminBase, { err: "חסר שם לדרגה." });
    }

    const id = await league.createDivision(current.id, name);

    back(res, `${req.adminBase}/division/${id}`, { ok: "הדרגה נוספה." });
  })
);

/* ---------- שחקנים ---------- */

admin.get(
  "/players",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);

    if (!current) {
      return res.redirect(303, req.adminBase);
    }

    res.type("html").send(
      views.renderAdminPlayers({
        adminBase: req.adminBase,
        league: current,
        divisions: await league.getDivisions(current.id),
        players: await league.getPlayers(current.id),
        filter: req.query.d === "none" ? "none" : Number(req.query.d) || null,
        flash: adminFlash(req),
      })
    );
  })
);

admin.post(
  "/players",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);
    const result = await league.addPlayer(current.id, {
      fullName: req.body.full_name,
      phone: req.body.phone,
      divisionId: req.body.division_id,
    });

    back(res, `${req.adminBase}/players`, result.ok ? { ok: "השחקן נוסף." } : { err: result.error });
  })
);

async function adminPlayer(req, res) {
  const current = await adminLeague(req, res);
  const player = await league.getPlayer(req.params.id);

  return player && current && player.league_id === current.id ? player : null;
}

admin.post(
  "/players/:id",
  safe(async (req, res) => {
    const player = await adminPlayer(req, res);

    if (!player) {
      return back(res, `${req.adminBase}/players`, { err: "השחקן לא נמצא." });
    }

    const result = await league.updatePlayer(player.id, {
      fullName: req.body.full_name,
      phone: req.body.phone,
      divisionId: req.body.division_id,
    });

    back(res, `${req.adminBase}/players`, result.ok ? { ok: `${player.full_name} עודכן.` } : { err: result.error });
  })
);

admin.post(
  "/players/:id/reset",
  safe(async (req, res) => {
    const player = await adminPlayer(req, res);

    if (player) {
      await league.resetPassword(player.id);
    }

    back(res, `${req.adminBase}/players`, {
      ok: player ? `הסיסמה של ${player.full_name} אופסה. בכניסה הבאה הוא יבחר סיסמה חדשה.` : "",
    });
  })
);

admin.post(
  "/players/:id/delete",
  safe(async (req, res) => {
    const player = await adminPlayer(req, res);

    if (!player) {
      return back(res, `${req.adminBase}/players`, { err: "השחקן לא נמצא." });
    }

    const result = await league.deletePlayer(player.id);

    back(res, `${req.adminBase}/players`, result.ok ? { ok: `${player.full_name} נמחק.` } : { err: result.error });
  })
);

/* ---------- דרגה ---------- */

async function adminDivision(req, res) {
  const current = await adminLeague(req, res);
  const division = await league.getDivision(req.params.id);

  return division && current && division.league_id === current.id ? { current, division } : null;
}

admin.get(
  "/division/:id",
  safe(async (req, res) => {
    const found = await adminDivision(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    const data = await league.loadDivision(found.division, found.current);

    res.type("html").send(
      views.renderAdminDivision({
        adminBase: req.adminBase,
        ctx: adminContext(req, found.current, data),
        league: found.current,
        data,
        flash: adminFlash(req),
      })
    );
  })
);

function divisionAction(handler) {
  return safe(async (req, res) => {
    const found = await adminDivision(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    const url = `${req.adminBase}/division/${found.division.id}`;
    const result = (await handler(req, found)) || { ok: true };

    back(res, url, result.ok ? { ok: result.message || "נשמר." } : { err: result.error });
  });
}

admin.post(
  "/division/:id/settings",
  divisionAction(async (req, { division }) => {
    await league.updateDivision(division.id, { name: req.body.name, scoreFormat: req.body.score_format });
    return { ok: true, message: "הדרגה עודכנה." };
  })
);

admin.post(
  "/division/:id/groups",
  divisionAction(async (req, { division }) => {
    const result = await league.createGroups(division.id, req.body.count, req.body.method);

    if (!result.ok) {
      return result;
    }

    const matches = await league.generateGroupMatches(division.id);

    return matches.ok
      ? { ok: true, message: `הבתים נבנו ונוצרו ${matches.created} משחקים.` }
      : matches;
  })
);

admin.post(
  "/division/:id/assign",
  divisionAction(async (req, { division }) => {
    const groups = await league.getGroups(division.id);
    const groupIds = new Set(groups.map((g) => g.id));
    const data = await league.loadDivision(division, await league.getLeague(division.league_id));

    if (data.matches.some((m) => m.stage === "group" && m.status === "done")) {
      return { ok: false, error: "כבר יש תוצאות, ולכן אי אפשר לשנות שיבוץ." };
    }

    let changed = 0;

    for (const player of data.players) {
      const value = Number(req.body[`p${player.id}`]) || null;
      const next = value && groupIds.has(value) ? value : null;

      if (next !== player.group_id) {
        await league.updatePlayer(player.id, { groupId: next });
        changed += 1;
      }
    }

    if (changed) {
      const matches = await league.generateGroupMatches(division.id);

      return matches.ok
        ? { ok: true, message: `השיבוץ נשמר והמשחקים נוצרו מחדש (${matches.created}).` }
        : matches;
    }

    return { ok: true, message: "לא היו שינויים." };
  })
);

admin.post(
  "/division/:id/matches",
  divisionAction(async (req, { division }) => {
    const result = await league.generateGroupMatches(division.id);

    return result.ok ? { ok: true, message: `נוצרו ${result.created} משחקים.` } : result;
  })
);

admin.post(
  "/division/:id/knockout",
  divisionAction(async (req, { division }) => {
    const result = await league.generateKnockout(division.id, req.body.qualifiers, req.body.third !== "0");

    return result.ok ? { ok: true, message: "עץ הנוקאאוט נוצר." } : result;
  })
);

admin.post(
  "/division/:id/knockout/delete",
  divisionAction(async (req, { division }) => {
    await league.deleteKnockout(division.id);
    return { ok: true, message: "הנוקאאוט נמחק." };
  })
);

/* ---------- משחק ---------- */

async function adminMatch(req, res) {
  const current = await adminLeague(req, res);
  const match = await league.getMatch(req.params.id);

  if (!match || !current) {
    return null;
  }

  const division = await league.getDivision(match.division_id);

  if (!division || division.league_id !== current.id) {
    return null;
  }

  return { current, match, division, data: await league.loadDivision(division, current) };
}

function readResultForm(body) {
  const sets = [0, 1, 2].map((i) => [body[`s${i}a`], body[`s${i}b`]]);
  const type = ["sets", "wo_a", "wo_b"].includes(body.type) ? body.type : "sets";

  return {
    type,
    sets,
    playedOn: String(body.played_on || "").trim(),
    input: {
      sets,
      walkover: type === "wo_a" ? "a" : type === "wo_b" ? "b" : null,
      playedOn: String(body.played_on || "").trim(),
    },
  };
}

admin.get(
  "/match/:id",
  safe(async (req, res) => {
    const found = await adminMatch(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    res.type("html").send(
      views.renderAdminMatch({
        adminBase: req.adminBase,
        ctx: adminContext(req, found.current, found.data),
        league: found.current,
        match: found.match,
        data: found.data,
        flash: adminFlash(req),
      })
    );
  })
);

admin.post(
  "/match/:id",
  safe(async (req, res) => {
    const found = await adminMatch(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    const form = readResultForm(req.body);
    const result = await league.saveResult(found.match.id, form.input, { label: "מנהל" });

    if (!result.ok) {
      return res.status(400).type("html").send(
        views.renderAdminMatch({
          adminBase: req.adminBase,
          ctx: adminContext(req, found.current, found.data),
          league: found.current,
          match: found.match,
          data: found.data,
          error: result.error,
          values: form,
        })
      );
    }

    back(res, `${req.adminBase}/division/${found.division.id}`, { ok: "התוצאה נשמרה." });
  })
);

admin.post(
  "/match/:id/clear",
  safe(async (req, res) => {
    const found = await adminMatch(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    await league.clearResult(found.match.id, { label: "מנהל" });
    back(res, `${req.adminBase}/division/${found.division.id}`, { ok: "התוצאה נמחקה." });
  })
);

admin.post(
  "/match/:id/schedule",
  safe(async (req, res) => {
    const found = await adminMatch(req, res);

    if (!found) {
      return res.redirect(303, req.adminBase);
    }

    const result = await league.updateSchedule(found.match.id, {
      scheduledOn: req.body.scheduled_on,
      scheduledTime: req.body.scheduled_time,
      court: req.body.court,
    });

    back(res, `${req.adminBase}/match/${found.match.id}`, result.ok ? { ok: "המועד נשמר." } : { err: result.error });
  })
);

/* ---------- יומן ותצוגה מקדימה ---------- */

admin.get(
  "/log",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);

    if (!current) {
      return res.redirect(303, req.adminBase);
    }

    res.type("html").send(
      views.renderAdminLog({ adminBase: req.adminBase, league: current, entries: await league.getLog(current.id) })
    );
  })
);

function previewExtra(req) {
  return {
    base: `${req.adminBase}/preview`,
    adminBase: req.adminBase,
    me: null,
    adminBar: `<div class="admin-bar"><div class="wrap"><span>תצוגה מקדימה – כך השחקנים רואים את הליגה</span><a href="${req.adminBase}">חזרה לניהול</a></div></div>`,
  };
}

admin.get(
  "/preview",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);

    if (!current) {
      return res.redirect(303, req.adminBase);
    }

    await renderLeagueHome(req, res, current, previewExtra(req));
  })
);

admin.get(
  "/preview/player/:id",
  safe(async (req, res) => {
    const current = await adminLeague(req, res);

    if (!current) {
      return res.redirect(303, req.adminBase);
    }

    await renderPlayerPage(req, res, current, previewExtra(req));
  })
);

/* =========================================================
 * דפים ציבוריים
 * ========================================================= */

async function requireActiveLeague(res) {
  const active = await league.getActiveLeague();

  if (!active) {
    res.status(404).type("html").send(views.renderMessage({ title: "ליגה", message: "הליגה עוד לא נפתחה. חזרו בקרוב." }));
    return null;
  }

  return active;
}

router.get(
  "/",
  safe(async (req, res) => {
    const active = await requireActiveLeague(res);

    if (active) {
      await renderLeagueHome(req, res, active);
    }
  })
);

router.get(
  "/player/:id",
  safe(async (req, res) => {
    const active = await requireActiveLeague(res);

    if (active) {
      await renderPlayerPage(req, res, active);
    }
  })
);

/* ---------- התחברות ---------- */

router.get(
  "/login",
  safe(async (req, res) => {
    const active = await requireActiveLeague(res);

    if (!active) {
      return;
    }

    const ctx = await publicContext(req, active);

    if (ctx.me) {
      return res.redirect(303, `${BASE}/me`);
    }

    res.type("html").send(views.renderLogin({ ctx }));
  })
);

router.post(
  "/login",
  safe(async (req, res) => {
    const active = await requireActiveLeague(res);

    if (!active) {
      return;
    }

    const ctx = await publicContext(req, active);
    const phone = String(req.body.phone || "").trim();
    const player = phone ? await league.findPlayerByPhone(active.id, phone) : null;
    const show = (params, status = 200) => res.status(status).type("html").send(views.renderLogin({ ctx, ...params }));

    if (!player) {
      return show(
        { step: "phone", phone, error: "המספר הזה לא רשום בליגה. בדקו שהקלדתם נכון, או פנו למנהל הליגה." },
        phone ? 404 : 400
      );
    }

    const firstName = player.full_name.split(" ")[0];
    const step = player.password_hash ? "password" : "create";
    const password = String(req.body.password || "");

    if (req.body.step === "phone" || !password) {
      return show({ step, phone, name: firstName });
    }

    if (isLocked(player.phone)) {
      return show({ step, phone, name: firstName, error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." }, 429);
    }

    if (step === "password") {
      if (!league.verifyPassword(password, player.password_hash)) {
        recordFailure(player.phone);
        return show({ step, phone, name: firstName, error: "הסיסמה לא נכונה." }, 401);
      }
    } else {
      if (password.length < 4) {
        return show({ step, phone, name: firstName, error: "הסיסמה צריכה להיות לפחות 4 תווים." }, 400);
      }

      if (password !== String(req.body.confirm || "")) {
        return show({ step, phone, name: firstName, error: "הסיסמאות לא זהות." }, 400);
      }

      await league.setPassword(player.id, password);
      await league.addLog(active.id, null, player.full_name, "כניסה ראשונה", "בחר סיסמה");
    }

    const token = await league.createSession(player.id);

    setCookie(req, res, SESSION_COOKIE, token, 60 * 60 * 24 * 365);
    res.redirect(303, `${BASE}/me?ok=welcome`);
  })
);

router.post(
  "/logout",
  safe(async (req, res) => {
    await league.deleteSession(readCookie(req, SESSION_COOKIE));
    setCookie(req, res, SESSION_COOKIE, "", 0);
    res.redirect(303, `${BASE}?ok=out`);
  })
);

/* ---------- המשחקים שלי ודיווח ---------- */

router.get(
  "/me",
  safe(async (req, res) => {
    const active = await requireActiveLeague(res);

    if (!active) {
      return;
    }

    const ctx = await publicContext(req, active);

    if (!ctx.me) {
      return res.redirect(303, `${BASE}/login`);
    }

    const division = ctx.me.division_id ? await league.getDivision(ctx.me.division_id) : null;
    const data = division ? await league.loadDivision(division, active) : null;

    if (data) {
      ctx.byId = data.byId;
    }

    res.type("html").send(views.renderMe({ ctx, data }));
  })
);

async function playerMatch(req, res) {
  const active = await requireActiveLeague(res);

  if (!active) {
    return null;
  }

  const ctx = await publicContext(req, active);

  if (!ctx.me) {
    res.redirect(303, `${BASE}/login`);
    return null;
  }

  const match = await league.getMatch(req.params.id);
  const division = match ? await league.getDivision(match.division_id) : null;

  if (
    !match ||
    !division ||
    division.league_id !== active.id ||
    !match.player_a ||
    !match.player_b ||
    (match.player_a !== ctx.me.id && match.player_b !== ctx.me.id)
  ) {
    res.status(403).type("html").send(views.renderMessage({ title: "אין גישה", message: "אפשר לדווח רק על משחקים שלך." }));
    return null;
  }

  const data = await league.loadDivision(division, active);

  ctx.byId = data.byId;
  ctx.back = `${BASE}/me`;

  return { ctx, match, data };
}

router.get(
  "/match/:id",
  safe(async (req, res) => {
    const found = await playerMatch(req, res);

    if (found) {
      res.type("html").send(views.renderReport(found));
    }
  })
);

router.post(
  "/match/:id",
  safe(async (req, res) => {
    const found = await playerMatch(req, res);

    if (!found) {
      return;
    }

    const form = readResultForm(req.body);
    const result = await league.saveResult(found.match.id, form.input, { label: found.ctx.me.full_name });

    if (!result.ok) {
      return res.status(400).type("html").send(views.renderReport({ ...found, error: result.error, values: form }));
    }

    res.redirect(303, `${BASE}/me?ok=saved`);
  })
);

module.exports = router;
