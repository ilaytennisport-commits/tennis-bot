/*
 * =========================================================
 * ליגת טניס — חישובים בלי מסד נתונים
 * =========================================================
 *
 * בדיקת תוצאה, טבלת דירוג, מחזורים (כל אחד נגד כל אחד),
 * שיבוץ נוקאאוט, וקריאת טופס ההרשמה מ-Google Sheets.
 */

/* =========================================================
 * טלפון
 * ========================================================= */

function normalizePhone(phone = "") {
  let value = String(phone).replace(/\D/g, "");

  if (value.startsWith("972") && value.length >= 11) {
    value = "0" + value.slice(3);
  }

  if (value.length === 9 && value.startsWith("5")) {
    value = "0" + value;
  }

  return value;
}

function isValidPhone(phone) {
  return /^0\d{8,9}$/.test(normalizePhone(phone));
}

/* =========================================================
 * תוצאה
 * =========================================================
 *
 * sets: [[משחקונים של א', משחקונים של ב'], ...]
 * פורמט "stb": שתי מערכות, ובמצב 1:1 סופר טייברייק עד 10.
 * פורמט "full": שלוש מערכות מלאות.
 */

function isRegularSet(a, b) {
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  return (
    (high === 6 && low <= 4) ||
    (high === 7 && (low === 5 || low === 6))
  );
}

function isSuperTiebreak(a, b) {
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  return high >= 10 && high - low >= 2 && (high === 10 || high - low === 2);
}

function setLabel(index, format) {
  return index === 2 && format === "stb"
    ? "הסופר טייברייק"
    : `מערכה ${index + 1}`;
}

/*
 * מחזיר { ok, sets, winner: "a"|"b" } או { ok: false, error }.
 */
function validateSets(rawSets, format = "stb") {
  const sets = [];

  for (let i = 0; i < 3; i += 1) {
    const pair = rawSets[i] || [];
    const a = String(pair[0] ?? "").trim();
    const b = String(pair[1] ?? "").trim();

    if (a === "" && b === "") {
      continue;
    }

    if (a === "" || b === "") {
      return { ok: false, error: `ב${setLabel(i, format)} חסרה תוצאה לאחד השחקנים.` };
    }

    if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) {
      return { ok: false, error: "אפשר להזין רק מספרים." };
    }

    if (sets.length !== i) {
      return { ok: false, error: `חסרה ${setLabel(sets.length, format)}.` };
    }

    sets.push([Number(a), Number(b)]);
  }

  if (sets.length < 2) {
    return { ok: false, error: "צריך להזין לפחות שתי מערכות." };
  }

  let winsA = 0;
  let winsB = 0;

  for (let i = 0; i < sets.length; i += 1) {
    const [a, b] = sets[i];

    if (winsA === 2 || winsB === 2) {
      return { ok: false, error: `המשחק הוכרע כבר בשתי מערכות. מחקו את ${setLabel(i, format)}.` };
    }

    if (a === b) {
      return { ok: false, error: `${setLabel(i, format)} לא יכולה להסתיים בתיקו.` };
    }

    const tiebreak = i === 2 && format === "stb";

    if (tiebreak ? !isSuperTiebreak(a, b) : !isRegularSet(a, b)) {
      return {
        ok: false,
        error: tiebreak
          ? `תוצאת הסופר טייברייק (${a}-${b}) לא תקינה. מנצחים ב-10 עם הפרש של 2 לפחות.`
          : `תוצאת ${setLabel(i, format)} (${a}-${b}) לא תקינה. מערכה מסתיימת ב-6 (עם הפרש 2) או ב-7-5 / 7-6.`,
      };
    }

    if (a > b) {
      winsA += 1;
    } else {
      winsB += 1;
    }
  }

  if (winsA < 2 && winsB < 2) {
    return {
      ok: false,
      error: `המצב 1:1 במערכות. הזינו את ${setLabel(2, format)}.`,
    };
  }

  return { ok: true, sets, winner: winsA > winsB ? "a" : "b" };
}

function formatScore(sets = [], fromSide = "a") {
  return sets
    .map(([a, b]) => (fromSide === "a" ? `${a}-${b}` : `${b}-${a}`))
    .join(", ");
}

/* =========================================================
 * טבלת דירוג
 * ========================================================= */

const DEFAULT_POINTS = { win: 3, loss: 1, walkover: 0 };

/*
 * players: [{ id, full_name }]
 * matches: משחקי הבית שהסתיימו — { player_a, player_b, sets, walkover_winner, winner_id, played_on }
 */
function computeStandings(players, matches, points = DEFAULT_POINTS) {
  const rows = new Map(
    players.map((player) => [
      player.id,
      {
        player,
        played: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0,
        form: [],
      },
    ])
  );

  const done = matches
    .filter((m) => m.winner_id && rows.has(m.player_a) && rows.has(m.player_b))
    .sort((x, y) => String(x.played_on || "").localeCompare(String(y.played_on || "")) || x.id - y.id);

  for (const match of done) {
    const a = rows.get(match.player_a);
    const b = rows.get(match.player_b);
    const aWon = match.winner_id === match.player_a;
    const winner = aWon ? a : b;
    const loser = aWon ? b : a;

    a.played += 1;
    b.played += 1;
    winner.wins += 1;
    loser.losses += 1;
    winner.points += points.win;
    winner.form.push("w");
    loser.form.push("l");

    if (match.walkover_winner) {
      loser.points += points.walkover;
      winner.setsWon += 2;
      loser.setsLost += 2;
      winner.gamesWon += 12;
      loser.gamesLost += 12;
      continue;
    }

    loser.points += points.loss;

    (match.sets || []).forEach(([ga, gb], index) => {
      const superTiebreak = index === 2 && Math.max(ga, gb) >= 10;
      const gamesA = superTiebreak ? (ga > gb ? 1 : 0) : ga;
      const gamesB = superTiebreak ? (gb > ga ? 1 : 0) : gb;

      a.gamesWon += gamesA;
      a.gamesLost += gamesB;
      b.gamesWon += gamesB;
      b.gamesLost += gamesA;

      if (ga > gb) {
        a.setsWon += 1;
        b.setsLost += 1;
      } else {
        b.setsWon += 1;
        a.setsLost += 1;
      }
    });
  }

  /*
   * בשוויון נקודות בין שני שחקנים — המפגש ביניהם קובע.
   * בשוויון של שלושה ומעלה — מאזן מערכות, ואז מאזן משחקונים.
   */
  const headToHead = (x, y) => {
    const match = done.find(
      (m) =>
        (m.player_a === x.player.id && m.player_b === y.player.id) ||
        (m.player_a === y.player.id && m.player_b === x.player.id)
    );

    if (!match) {
      return 0;
    }

    return match.winner_id === x.player.id ? -1 : 1;
  };

  const list = [...rows.values()];
  const tiedCount = (row) => list.filter((other) => other.points === row.points).length;

  list.sort((x, y) => {
    if (y.points !== x.points) {
      return y.points - x.points;
    }

    if (tiedCount(x) === 2) {
      const h2h = headToHead(x, y);

      if (h2h) {
        return h2h;
      }
    }

    return (
      y.setsWon - y.setsLost - (x.setsWon - x.setsLost) ||
      y.gamesWon - y.gamesLost - (x.gamesWon - x.gamesLost) ||
      y.wins - x.wins ||
      String(x.player.full_name).localeCompare(String(y.player.full_name), "he")
    );
  });

  list.forEach((row, index) => {
    row.rank = index + 1;
  });

  return list;
}

/* =========================================================
 * מחזורים — כל אחד נגד כל אחד
 * ========================================================= */

/*
 * שיטת המעגל: מחזירה מחזורים, וכל מחזור הוא רשימת זוגות.
 * במספר אי-זוגי של שחקנים — בכל מחזור שחקן אחד נח.
 */
function roundRobin(ids) {
  const list = [...ids];

  if (list.length < 2) {
    return [];
  }

  if (list.length % 2 === 1) {
    list.push(null);
  }

  const rounds = [];
  const n = list.length;
  let order = list;

  for (let r = 0; r < n - 1; r += 1) {
    const pairs = [];

    for (let i = 0; i < n / 2; i += 1) {
      const a = order[i];
      const b = order[n - 1 - i];

      if (a !== null && b !== null) {
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }

    rounds.push(pairs);
    order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
  }

  return rounds;
}

/* =========================================================
 * נוקאאוט
 * ========================================================= */

function nextPowerOfTwo(n) {
  let size = 1;

  while (size < n) {
    size *= 2;
  }

  return size;
}

/*
 * סדר המדורגים בעץ, כך שהמדורגים 1 ו-2 נפגשים רק בגמר.
 * 8 → [1, 8, 4, 5, 2, 7, 3, 6]
 */
function bracketOrder(size) {
  let order = [1];

  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }

  return order;
}

/*
 * groupRankings: לכל בית — רשימת מזהי השחקנים לפי מקום.
 * מחזיר את זוגות הסיבוב הראשון (null = עולה ישר).
 *
 * בשני בתים עם 4 עולים: א1–ב4, ב2–א3, ב1–א4, א2–ב3.
 */
function seedKnockout(groupRankings, qualifiers) {
  const seeds = [];

  for (let rank = 0; rank < qualifiers; rank += 1) {
    for (const ranking of groupRankings) {
      if (ranking[rank] !== undefined) {
        seeds.push(ranking[rank]);
      }
    }
  }

  if (seeds.length < 2) {
    return [];
  }

  const size = nextPowerOfTwo(seeds.length);
  const order = bracketOrder(size);
  const pairs = [];

  for (let i = 0; i < size; i += 2) {
    pairs.push([seeds[order[i] - 1] ?? null, seeds[order[i + 1] - 1] ?? null]);
  }

  return pairs;
}

function knockoutRoundName(playersInRound) {
  return (
    {
      2: "גמר",
      4: "חצי גמר",
      8: "רבע גמר",
      16: "שמינית גמר",
      32: "סיבוב 32",
    }[playersInRound] || `סיבוב ${playersInRound}`
  );
}

/* =========================================================
 * טופס ההרשמה (Google Sheets)
 * ========================================================= */

/*
 * קורא CSV כולל שדות במרכאות, פסיקים וירידות שורה בתוך תא.
 */
function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text).replace(/^﻿/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") {
        i += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => String(value).trim() !== ""));
}

/*
 * קישור לגיליון → קישור להורדת CSV.
 */
function sheetCsvUrl(url = "") {
  const match = String(url).match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);

  if (!match) {
    return null;
  }

  const gid = String(url).match(/[#&?]gid=(\d+)/);

  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid[1]}` : ""}`;
}

const LEVEL_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו"];

/*
 * "ליגת על" / "א" / "דרגה ב'" → { key, name, order }
 */
function mapLevel(text = "") {
  const value = String(text).trim().replace(/["'׳״]/g, "");

  if (!value) {
    return null;
  }

  if (/(^|\s)על($|\s)/.test(value)) {
    return { key: "על", name: "ליגת על", order: 0 };
  }

  const letter = value.match(/(?:^|\s)([א-ו])$/) || value.match(/^([א-ו])(?:\s|$)/);

  if (letter) {
    return {
      key: letter[1],
      name: `דרגה ${letter[1]}׳`,
      order: LEVEL_LETTERS.indexOf(letter[1]) + 1,
    };
  }

  return { key: value, name: value, order: 50 };
}

const HEADER_HINTS = {
  fullName: ["שם מלא"],
  firstName: ["שם פרטי"],
  lastName: ["שם משפחה"],
  phone: ["טלפון", "נייד", "פלאפון"],
  level: ["רמה", "דרגה", "ליגה"],
  city: ["עיר"],
  club: ["מועדון"],
};

/*
 * שורות הגיליון (כולל כותרת) → רשימת נרשמים.
 */
function readRegistrations(rows) {
  if (!rows.length) {
    return { players: [], missing: ["כותרות"] };
  }

  const header = rows[0].map((h) => String(h).trim());
  const column = {};

  for (const [field, hints] of Object.entries(HEADER_HINTS)) {
    const index = header.findIndex((h) => hints.some((hint) => h.includes(hint)));

    if (index >= 0) {
      column[field] = index;
    }
  }

  const missing = [];

  if (column.phone === undefined) {
    missing.push("טלפון");
  }

  if (column.fullName === undefined && column.firstName === undefined) {
    missing.push("שם");
  }

  if (missing.length) {
    return { players: [], missing };
  }

  const cell = (row, field) =>
    column[field] === undefined ? "" : String(row[column[field]] ?? "").replace(/\s+/g, " ").trim();

  const players = rows.slice(1).map((row) => {
    const fullName =
      cell(row, "fullName") ||
      [cell(row, "firstName"), cell(row, "lastName")].filter(Boolean).join(" ");

    return {
      fullName,
      phone: normalizePhone(cell(row, "phone")),
      level: mapLevel(cell(row, "level")),
      city: cell(row, "city"),
      club: cell(row, "club").replace(/^-$/, ""),
    };
  });

  return { players, missing: [] };
}

module.exports = {
  normalizePhone,
  isValidPhone,
  validateSets,
  formatScore,
  DEFAULT_POINTS,
  computeStandings,
  roundRobin,
  bracketOrder,
  seedKnockout,
  knockoutRoundName,
  parseCsv,
  sheetCsvUrl,
  mapLevel,
  readRegistrations,
};
