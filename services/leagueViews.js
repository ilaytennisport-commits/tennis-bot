const core = require("./leagueCore");

/*
 * =========================================================
 * ליגת טניס — דפי HTML
 * =========================================================
 *
 * דפים שנבנים בשרת, בלי JavaScript חיצוני.
 * עובדים בטלפון, בעברית, במצב בהיר וכהה.
 */

function esc(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function formatDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `יום ${DAYS[dow]} ${day}.${month}`;
}

/* =========================================================
 * עיצוב
 * ========================================================= */

const CSS = `
:root{
  --bg:#EEF2F5;--surface:#FFFFFF;--surface-2:#F5F7FA;--ink:#0F2232;--muted:#5A6B79;--line:#D9E1E8;
  --court:#1E5AA0;--court-deep:#16467E;--on-court:#FFFFFF;--ball:#D4E43A;--on-ball:#25300A;
  --win:#1B8A57;--win-bg:#E3F4EB;--loss:#BF3D36;--loss-bg:#FBE8E6;--warn:#9A6200;--warn-bg:#FFF3D9;
  --link:#1E5AA0;
  --f-display:"Secular One","Assistant",system-ui,sans-serif;
  --f-body:"Assistant",system-ui,"Segoe UI",Arial,sans-serif;
  --f-num:"Rubik","Assistant",system-ui,sans-serif;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0B151E;--surface:#122030;--surface-2:#0F1B28;--ink:#E6EDF3;--muted:#93A5B4;--line:#22364A;
  --court:#1B4F8C;--court-deep:#123A68;--win:#4FC48C;--win-bg:#123A2A;--loss:#F07B73;--loss-bg:#3A1C1C;
  --warn:#F2B84B;--warn-bg:#3A2D12;--link:#8DB8EE;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.5}
a{color:var(--link)}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ball);outline-offset:2px;border-radius:6px}
.wrap{max-width:1180px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
.num{font-family:var(--f-num);font-variant-numeric:tabular-nums}
.hero{background:var(--court);color:var(--on-court);position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(90deg,transparent calc(50% - 1px),rgba(255,255,255,.16) calc(50% - 1px),rgba(255,255,255,.16) calc(50% + 1px),transparent calc(50% + 1px)),
  linear-gradient(0deg,transparent 22px,rgba(255,255,255,.16) 22px,rgba(255,255,255,.16) 24px,transparent 24px)}
.hero .wrap{padding-top:calc(18px + env(safe-area-inset-top));padding-bottom:34px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between;position:relative;z-index:1}
.hero a{color:inherit}
.eyebrow{font-size:13px;letter-spacing:.03em;opacity:.85;font-weight:600}
h1{font-family:var(--f-display);font-weight:400;font-size:clamp(24px,4.4vw,38px);line-height:1.15;margin:2px 0 0;text-wrap:balance}
h2{font-family:var(--f-display);font-weight:400;font-size:21px;margin:0 0 4px;text-wrap:balance}
h3{font-size:16px;margin:0 0 8px}
.userbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);border-radius:10px;padding:8px 14px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn.primary{background:var(--court);border-color:var(--court);color:var(--on-court)}
.btn.ball{background:var(--ball);border-color:var(--ball);color:var(--on-ball)}
.btn.ghost{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);color:var(--on-court)}
.btn.danger{color:var(--loss)}
.btn.small{padding:5px 10px;font-size:13px}
.divbar{background:var(--court-deep)}
.divbar .wrap{display:flex;gap:6px;overflow-x:auto;padding-top:10px;padding-bottom:10px;scrollbar-width:none}
.divpill{color:var(--on-court);text-decoration:none;font-weight:700;font-size:14px;padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);white-space:nowrap}
.divpill[aria-current="page"]{background:var(--ball);color:var(--on-ball);border-color:var(--ball)}
.tabs{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--line);box-shadow:0 2px 10px rgba(15,34,50,.06)}
.tabs .wrap{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}
.tab{padding:13px 13px 11px;font-weight:700;color:var(--muted);text-decoration:none;border-bottom:3px solid transparent;white-space:nowrap}
.tab[aria-current="page"]{color:var(--ink);border-bottom-color:var(--ball)}
main .wrap{padding-top:22px;padding-bottom:60px}
.sub{color:var(--muted);font-size:14px;margin:0 0 14px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,500px),1fr));gap:18px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.panel + .panel,.stack > * + *{margin-top:16px}
.panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14.5px}
th{font-size:12px;font-weight:700;color:var(--muted);text-align:center;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 6px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}
th.l,td.l{text-align:right}
tr:last-child td{border-bottom:0}
.pos{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--surface-2);font-family:var(--f-num);font-size:13px}
tr.q .pos{background:var(--ball);color:var(--on-ball)}
td.pts{font-weight:800;font-size:16px}
.plus{color:var(--win)}.minus{color:var(--loss)}
.form{display:inline-flex;gap:3px}
.dot{width:16px;height:16px;border-radius:4px;font-size:10px;font-weight:800;display:inline-grid;place-items:center;color:#fff}
.dot.w{background:var(--win)}.dot.l{background:var(--loss)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:12px}
.legend span{display:inline-flex;gap:6px;align-items:center}
.sq{width:12px;height:12px;border-radius:3px;background:var(--ball);display:inline-block}
.pname{font-weight:700;color:var(--ink);text-decoration:none}
.pname:hover{text-decoration:underline;text-underline-offset:3px}
.me-row td{background:var(--warn-bg)}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.pill{border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:6px 12px;border-radius:999px;font-size:13.5px;font-weight:600;text-decoration:none}
.pill[aria-current="true"]{background:var(--court);color:var(--on-court);border-color:var(--court)}
.round-h{font-weight:800;margin:18px 0 10px;display:flex;gap:8px;align-items:baseline}
.round-h small{color:var(--muted);font-weight:600}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.card.mine{border-color:var(--court);box-shadow:0 0 0 1px var(--court) inset}
.meta{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.status{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.status.done{background:var(--win-bg);color:var(--win)}
.status.wait{background:var(--warn-bg);color:var(--warn)}
.status.tbd{background:var(--surface-2);color:var(--muted);border:1px solid var(--line)}
.sc{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:4px 0}
.sc + .sc{border-top:1px solid var(--line)}
.sc .pname{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sc.win .pname{font-weight:800;color:var(--win)}
.sc.lose .pname{color:var(--muted)}
.sc .tbd{color:var(--muted)}
.sets{display:flex;gap:4px;flex-shrink:0}
.set{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;background:var(--surface-2);font-family:var(--f-num);font-variant-numeric:tabular-nums;font-size:14px;color:var(--muted)}
.set.won{background:var(--court);color:var(--on-court)}
.wo{font-size:12px;font-weight:800;color:var(--win)}
.card-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);min-height:30px}
.empty{color:var(--muted);padding:22px;text-align:center;background:var(--surface);border:1px dashed var(--line);border-radius:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin:14px 0 18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center}
.stat .v{font-family:var(--f-num);font-size:26px;font-weight:600;line-height:1.1}
.stat .k{font-size:12.5px;color:var(--muted);font-weight:600}
.stat.w{background:var(--win-bg);border-color:transparent}.stat.w .v{color:var(--win)}
.stat.l{background:var(--loss-bg);border-color:transparent}.stat.l .v{color:var(--loss)}
.stat.warn{background:var(--warn-bg);border-color:transparent}.stat.warn .v{color:var(--warn)}
.bracket{display:flex;gap:26px;overflow-x:auto;padding-bottom:8px}
.bround{display:flex;flex-direction:column;justify-content:space-around;gap:14px;min-width:220px}
.bround h3{font-size:13px;color:var(--muted);text-align:center;margin:0}
.bm{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.bm .sc{padding:8px 10px}
.bm.final{border:2px solid var(--ball)}
.bm .foot{border-top:1px solid var(--line);padding:6px 10px;display:flex;justify-content:flex-end}
.plist{display:flex;flex-direction:column}
.prow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--line)}
.prow:last-child{border-bottom:0}
.prow small{color:var(--muted)}
.notice{border-radius:10px;padding:10px 14px;margin-bottom:16px;font-weight:600}
.notice.ok{background:var(--win-bg);color:var(--win)}
.notice.err{background:var(--loss-bg);color:var(--loss)}
.notice.info{background:var(--surface);border:1px solid var(--line);color:var(--muted);font-weight:500}
form.box{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;max-width:480px}
label{display:block;font-weight:700;font-size:14px;margin:12px 0 6px}
input[type=text],input[type=tel],input[type=password],input[type=date],input[type=time],input[type=number],input[type=url],select,textarea{width:100%;border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:10px 12px;font-size:16px}
textarea{min-height:90px}
.hint{color:var(--muted);font-size:13px;margin-top:4px}
.score-grid{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,56px);gap:8px;align-items:center;margin:8px 0}
.score-grid .h{font-size:11.5px;color:var(--muted);font-weight:800;text-align:center;line-height:1.2}
.score-grid input{text-align:center;padding:10px 0;font-family:var(--f-num);font-size:18px}
.score-grid .pn{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.choice{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.choice label{display:flex;gap:8px;align-items:center;margin:0;font-weight:600;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface-2)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin:0}
.facts dt{color:var(--muted);font-weight:600}.facts dd{margin:0;font-weight:600}
.inline{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.inline > *{flex:1 1 140px;min-width:0}
.inline > .btn{flex:0 0 auto}
.admin-bar{background:var(--ink);color:var(--bg)}
.admin-bar .wrap{display:flex;gap:14px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px;font-size:14px;font-weight:700}
.admin-bar a{color:var(--bg)}
.tag{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.tag.on{background:var(--win-bg);color:var(--win);border-color:transparent}
footer{color:var(--muted);font-size:12.5px;text-align:center;padding:10px 16px 30px}
@media (max-width:520px){.hide-sm{display:none}}
`;

function page({ title, head = "", body }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Rubik:wght@500;600&family=Secular+One&display=swap">
<style>${CSS}</style>
${head}
</head>
<body>
${body}
</body>
</html>`;
}

function notice({ ok, err } = {}) {
  return [
    ok ? `<div class="notice ok" role="status">${esc(ok)}</div>` : "",
    err ? `<div class="notice err" role="alert">${esc(err)}</div>` : "",
  ].join("");
}

/* =========================================================
 * רכיבים משותפים
 * ========================================================= */

function nameLink(ctx, id) {
  const player = ctx.byId[id];

  if (!player) {
    return `<span class="tbd">ייקבע</span>`;
  }

  return `<a class="pname" href="${ctx.base}/player/${player.id}">${esc(player.full_name)}</a>`;
}

function matchStatus(match) {
  if (match.status === "done") {
    return { cls: "done", label: "הסתיים" };
  }

  if (match.status === "bye") {
    return { cls: "tbd", label: "עולה ישר" };
  }

  if (!match.player_a || !match.player_b) {
    return { cls: "tbd", label: "ממתין לשלב הקודם" };
  }

  return { cls: "wait", label: "טרם שוחק" };
}

function canReport(me, match) {
  return Boolean(
    me &&
      match.player_a &&
      match.player_b &&
      match.status !== "bye" &&
      (me.id === match.player_a || me.id === match.player_b)
  );
}

function scoreRows(ctx, match) {
  const row = (side) => {
    const id = side === "a" ? match.player_a : match.player_b;
    const done = match.status === "done";
    const won = done && match.winner_id === id;
    let cells = "";

    if (done && !match.walkover_winner) {
      cells = match.sets
        .map(([a, b]) => {
          const mine = side === "a" ? a : b;
          const theirs = side === "a" ? b : a;
          return `<span class="set${mine > theirs ? " won" : ""}">${mine}</span>`;
        })
        .join("");
    } else if (done && won) {
      cells = `<span class="wo">ניצחון טכני</span>`;
    }

    return `<div class="sc${won ? " win" : done ? " lose" : ""}">${nameLink(ctx, id)}<div class="sets">${cells}</div></div>`;
  };

  return row("a") + row("b");
}

/*
 * כרטיס משחק בסגנון לוח תוצאות.
 */
function matchCard(ctx, match, { label = "" } = {}) {
  const status = matchStatus(match);
  const mine = canReport(ctx.me, match);
  const when =
    match.status === "done"
      ? match.played_on
        ? `שוחק ב${formatDate(match.played_on)}`
        : ""
      : [match.scheduled_on ? formatDate(match.scheduled_on) : "", match.scheduled_time || "", match.court || ""]
          .filter(Boolean)
          .join(" · ");

  let action = "";

  if (ctx.adminBase) {
    action = `<a class="btn small" href="${ctx.adminBase}/match/${match.id}">עריכה</a>`;
  } else if (mine) {
    action = `<a class="btn small ${match.status === "done" ? "" : "ball"}" href="${ctx.base}/match/${match.id}">${match.status === "done" ? "תיקון תוצאה" : "דיווח תוצאה"}</a>`;
  }

  return `<article class="card${mine ? " mine" : ""}">
    <div class="meta"><span>${esc(label)}</span><span class="status ${status.cls}">${status.label}</span></div>
    ${scoreRows(ctx, match)}
    <div class="card-foot"><span class="num">${esc(when)}</span>${action}</div>
  </article>`;
}

function formDots(form) {
  return `<span class="form">${form
    .slice(-5)
    .map((f) => `<span class="dot ${f}" title="${f === "w" ? "ניצחון" : "הפסד"}">${f === "w" ? "נ" : "ה"}</span>`)
    .join("")}</span>`;
}

function standingsTable(ctx, groupView, qualifiers) {
  const played = groupView.matches.filter((m) => m.status === "done").length;

  return `<section class="panel">
    <div class="panel-head"><h2>${esc(groupView.group.name)}</h2><span class="sub" style="margin:0">${played} מתוך ${groupView.matches.length} משחקים שוחקו</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th class="l">שם</th><th>מש׳</th><th>נ׳</th><th>ה׳</th><th>מערכות</th><th>נק׳</th><th class="hide-sm">כושר</th></tr></thead>
      <tbody>${groupView.standings
        .map((row) => {
          const diff = row.setsWon - row.setsLost;
          const classes = [row.rank <= qualifiers ? "q" : "", ctx.me && ctx.me.id === row.player.id ? "me-row" : ""]
            .filter(Boolean)
            .join(" ");

          return `<tr class="${classes}">
            <td><span class="pos">${row.rank}</span></td>
            <td class="l">${nameLink(ctx, row.player.id)}</td>
            <td class="num">${row.played}</td><td class="num">${row.wins}</td><td class="num">${row.losses}</td>
            <td class="num ${diff > 0 ? "plus" : diff < 0 ? "minus" : ""}">${row.setsWon}:${row.setsLost}</td>
            <td class="num pts">${row.points}</td>
            <td class="hide-sm">${formDots(row.form)}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function bracket(ctx, data) {
  if (!data.koRounds.length) {
    return `<div class="empty">שלב הנוקאאוט ייפתח בסיום שלב הבתים.</div>`;
  }

  const total = data.koRounds.length;

  const columns = data.koRounds.map((matches, index) => {
    const playersInRound = 2 ** (total - index);
    const isFinal = index === total - 1;

    return `<div class="bround"><h3>${core.knockoutRoundName(playersInRound)}</h3>${matches
      .sort((a, b) => a.slot - b.slot)
      .map((match) => {
        const action = ctx.adminBase
          ? `<a class="btn small" href="${ctx.adminBase}/match/${match.id}">עריכה</a>`
          : canReport(ctx.me, match)
            ? `<a class="btn small ball" href="${ctx.base}/match/${match.id}">${match.status === "done" ? "תיקון" : "דיווח תוצאה"}</a>`
            : "";

        return `<div class="bm${isFinal ? " final" : ""}">${scoreRows(ctx, match)}${action ? `<div class="foot">${action}</div>` : ""}</div>`;
      })
      .join("")}</div>`;
  });

  if (data.third) {
    const action = ctx.adminBase
      ? `<a class="btn small" href="${ctx.adminBase}/match/${data.third.id}">עריכה</a>`
      : canReport(ctx.me, data.third)
        ? `<a class="btn small ball" href="${ctx.base}/match/${data.third.id}">דיווח תוצאה</a>`
        : "";

    columns.push(
      `<div class="bround"><h3>מקום שלישי</h3><div class="bm">${scoreRows(ctx, data.third)}${action ? `<div class="foot">${action}</div>` : ""}</div></div>`
    );
  }

  return `<div class="panel"><div class="bracket">${columns.join("")}</div></div>`;
}

function qualifiersOf(data) {
  const first = data.koRounds[0];

  if (!first || !data.groups.length) {
    return 0;
  }

  return Math.ceil((first.length * 2) / data.groups.length);
}

/* =========================================================
 * דף ציבורי
 * ========================================================= */

const TABS = [
  ["table", "טבלאות"],
  ["matches", "משחקים"],
  ["ko", "נוקאאוט"],
  ["players", "מתחרים"],
  ["info", "מידע"],
];

function publicHeader(ctx) {
  const userbox = ctx.me
    ? `<a class="btn ghost" href="${ctx.base}/me">המשחקים שלי</a>`
    : `<a class="btn ball" href="${ctx.base}/login">התחברות לדיווח תוצאות</a>`;

  return `<header class="hero"><div class="wrap">
    <div><div class="eyebrow">${esc(ctx.league.season || "")}</div><h1><a href="${ctx.base}" style="text-decoration:none">${esc(ctx.league.name)}</a></h1></div>
    <div class="userbox">${ctx.me ? `<span style="font-weight:700">שלום ${esc(ctx.me.full_name.split(" ")[0])}</span>` : ""}${userbox}</div>
  </div></header>`;
}

function divisionBar(ctx, divisions, current, tab) {
  if (divisions.length < 2) {
    return "";
  }

  return `<nav class="divbar" aria-label="דרגות"><div class="wrap">${divisions
    .map(
      (d) =>
        `<a class="divpill" href="${ctx.base}?d=${d.id}${tab ? `&tab=${tab}` : ""}"${current && d.id === current.id ? ' aria-current="page"' : ""}>${esc(d.name)}</a>`
    )
    .join("")}</div></nav>`;
}

function tabBar(ctx, current, tab) {
  return `<nav class="tabs" aria-label="לשוניות"><div class="wrap">${TABS.map(
    ([key, label]) =>
      `<a class="tab" href="${ctx.base}?d=${current.id}&tab=${key}"${key === tab ? ' aria-current="page"' : ""}>${label}</a>`
  ).join("")}</div></nav>`;
}

function tableTab(ctx, data) {
  if (!data.groups.length) {
    return `<h2>${esc(data.division.name)}</h2>
      <p class="sub">הבתים עוד לא נקבעו. אלה השחקנים שנרשמו לדרגה:</p>
      ${playersList(ctx, data.players)}`;
  }

  const qualifiers = qualifiersOf(data);
  const recent = data.matches
    .filter((m) => m.stage === "group" && m.status === "done")
    .sort((a, b) => String(b.played_on).localeCompare(String(a.played_on)) || b.id - a.id)
    .slice(0, 6);

  const groupName = Object.fromEntries(data.groups.map((g) => [g.group.id, g.group.name]));

  return `<h2>טבלאות · ${esc(data.division.name)}</h2>
    <p class="sub">ניצחון ${ctx.points.win} נק׳ · הפסד ${ctx.points.loss} · הפסד טכני ${ctx.points.walkover}. בשוויון בין שניים קובע המפגש ביניהם, ואחריו מאזן המערכות.</p>
    <div class="grid2">${data.groups.map((g) => standingsTable(ctx, g, qualifiers)).join("")}</div>
    <div class="legend">${qualifiers ? `<span><i class="sq"></i> עולים לנוקאאוט</span>` : ""}<span><i class="dot w">נ</i> ניצחון</span><span><i class="dot l">ה</i> הפסד</span></div>
    ${
      recent.length
        ? `<h2 style="margin-top:28px">תוצאות אחרונות</h2><div class="cards" style="margin-top:10px">${recent
            .map((m) => matchCard(ctx, m, { label: `${groupName[m.group_id] || ""} · מחזור ${m.round}` }))
            .join("")}</div>`
        : ""
    }`;
}

function matchesTab(ctx, data, query) {
  const show = ["pending", "done"].includes(query.show) ? query.show : "all";
  const groupFilter = Number(query.g) || 0;
  const groupName = Object.fromEntries(data.groups.map((g) => [g.group.id, g.group.name]));

  const list = data.matches.filter(
    (m) =>
      m.stage === "group" &&
      (!groupFilter || m.group_id === groupFilter) &&
      (show === "all" || (show === "done" ? m.status === "done" : m.status !== "done"))
  );

  const link = (params) => {
    const merged = { d: data.division.id, tab: "matches", show, g: groupFilter || "", ...params };
    return `${ctx.base}?${Object.entries(merged)
      .filter(([, v]) => v !== "" && v !== "all")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&")}`;
  };

  const pill = (params, label, active) => `<a class="pill" href="${link(params)}" aria-current="${active}">${label}</a>`;

  const filters = `<div class="filters">
    ${pill({ show: "all" }, "הכל", show === "all")}${pill({ show: "pending" }, "טרם שוחקו", show === "pending")}${pill({ show: "done" }, "הסתיימו", show === "done")}
    ${
      data.groups.length > 1
        ? `<span style="width:8px"></span>${pill({ g: "" }, "כל הבתים", !groupFilter)}${data.groups
            .map((g) => pill({ g: g.group.id }, esc(g.group.name), groupFilter === g.group.id))
            .join("")}`
        : ""
    }
  </div>`;

  if (!data.matches.some((m) => m.stage === "group")) {
    return `<h2>משחקים</h2><div class="empty">המשחקים עוד לא פורסמו.</div>`;
  }

  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);

  return `<h2>משחקים · ${esc(data.division.name)}</h2>
    <p class="sub">השחקנים מתאמים ביניהם את מועד המשחק. אחרי המשחק אחד מהשניים מדווח את התוצאה.</p>
    ${filters}
    ${
      rounds.length
        ? rounds
            .map((round) => {
              const items = list.filter((m) => m.round === round);
              const done = items.filter((m) => m.status === "done").length;

              return `<div class="round-h">מחזור ${round} <small>${done}/${items.length} שוחקו</small></div>
              <div class="cards">${items
                .map((m) => matchCard(ctx, m, { label: data.groups.length > 1 ? groupName[m.group_id] : "" }))
                .join("")}</div>`;
            })
            .join("")
        : `<div class="empty">אין משחקים שמתאימים לסינון.</div>`
    }`;
}

function playersList(ctx, players, recordOf = () => "") {
  if (!players.length) {
    return `<div class="empty">אין שחקנים.</div>`;
  }

  return `<div class="panel"><div class="plist">${players
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "he"))
    .map(
      (p) =>
        `<div class="prow"><a class="pname" href="${ctx.base}/player/${p.id}">${esc(p.full_name)}</a><small>${esc(
          recordOf(p) || p.club || p.city || ""
        )}</small></div>`
    )
    .join("")}</div></div>`;
}

function playersTab(ctx, data) {
  if (!data.groups.length) {
    return `<h2>מתחרים</h2>${playersList(ctx, data.players)}`;
  }

  return `<h2>מתחרים · ${esc(data.division.name)}</h2>
    <p class="sub">לחצו על שם כדי לראות את כל המשחקים והסטטיסטיקה.</p>
    <div class="grid2">${data.groups
      .map((g) => {
        const rank = Object.fromEntries(g.standings.map((r) => [r.player.id, r]));

        return `<section><h3>${esc(g.group.name)}</h3>${playersList(ctx, g.players, (p) =>
          rank[p.id] ? `מקום ${rank[p.id].rank} · ${rank[p.id].wins}–${rank[p.id].losses}` : ""
        )}</section>`;
      })
      .join("")}</div>`;
}

function infoTab(ctx, data, divisions) {
  const done = data.matches.filter((m) => m.status === "done").length;
  const pending = data.matches.filter((m) => m.status === "pending" && m.player_a && m.player_b).length;
  const format =
    data.division.score_format === "full"
      ? "2 מערכות מתוך 3 (מערכה שלישית מלאה)"
      : "2 מערכות, ובמצב 1:1 סופר טייברייק עד 10";

  return `<h2>מידע על הליגה</h2>
    <div class="stats">
      <div class="stat"><div class="v">${data.players.length}</div><div class="k">שחקנים בדרגה</div></div>
      <div class="stat w"><div class="v">${done}</div><div class="k">משחקים שהסתיימו</div></div>
      <div class="stat warn"><div class="v">${pending}</div><div class="k">טרם שוחקו</div></div>
      <div class="stat"><div class="v">${divisions.length}</div><div class="k">דרגות</div></div>
    </div>
    <div class="panel"><dl class="facts">
      <dt>פורמט משחק</dt><dd>${format}</dd>
      <dt>ניקוד</dt><dd>ניצחון ${ctx.points.win} · הפסד ${ctx.points.loss} · הפסד טכני ${ctx.points.walkover}</dd>
      <dt>שוויון</dt><dd>בין שניים: המפגש ביניהם. בין שלושה ומעלה: מאזן מערכות, ואז מאזן משחקונים</dd>
      <dt>דיווח תוצאה</dt><dd>כל אחד מהשחקנים במשחק, אחרי התחברות עם הטלפון</dd>
    </dl>
    ${ctx.league.info ? `<p style="white-space:pre-line;margin:16px 0 0">${esc(ctx.league.info)}</p>` : ""}
    ${ctx.league.rules_url ? `<p style="margin:16px 0 0"><a class="btn" href="${esc(ctx.league.rules_url)}" target="_blank" rel="noopener">לתקנון הליגה</a></p>` : ""}
    </div>`;
}

function renderHome({ ctx, divisions, data, tab, query }) {
  let content;

  if (!data) {
    content = `<div class="empty">הליגה עוד לא נפתחה. חזרו בקרוב.</div>`;
  } else {
    content = {
      table: () => tableTab(ctx, data),
      matches: () => matchesTab(ctx, data, query),
      ko: () => `<h2>נוקאאוט · ${esc(data.division.name)}</h2><p class="sub">${data.koRounds.length ? "המנצח בכל משחק עולה לשלב הבא." : ""}</p>${bracket(ctx, data)}`,
      players: () => playersTab(ctx, data),
      info: () => infoTab(ctx, data, divisions),
    }[tab]();
  }

  return page({
    title: `${ctx.league.name}${data ? ` · ${data.division.name}` : ""}`,
    body: `${ctx.adminBar || ""}${publicHeader(ctx)}
      ${data ? divisionBar(ctx, divisions, data.division, tab) : ""}
      ${data ? tabBar(ctx, data.division, tab) : ""}
      <main><div class="wrap">${notice(ctx.flash)}${content}</div></main>
      <footer>${esc(ctx.league.name)}</footer>`,
  });
}

/* =========================================================
 * דף שחקן
 * ========================================================= */

function renderPlayer({ ctx, player, data }) {
  const groupView = data.groups.find((g) => g.group.id === player.group_id);
  const row = groupView?.standings.find((r) => r.player.id === player.id);
  const matches = data.matches
    .filter((m) => m.player_a === player.id || m.player_b === player.id)
    .sort((a, b) => (a.stage === "group" ? 0 : 1) - (b.stage === "group" ? 0 : 1) || a.round - b.round);

  const totals = { played: 0, wins: 0, losses: 0 };

  for (const m of matches.filter((x) => x.status === "done")) {
    totals.played += 1;
    m.winner_id === player.id ? (totals.wins += 1) : (totals.losses += 1);
  }

  const total = data.koRounds.length;
  const label = (m) =>
    m.stage === "group"
      ? `${groupView ? groupView.group.name : ""} · מחזור ${m.round}`
      : m.stage === "third"
        ? "מקום שלישי"
        : core.knockoutRoundName(2 ** (total - m.round + 1));

  const isMe = ctx.me && ctx.me.id === player.id;

  return page({
    title: `${player.full_name} · ${ctx.league.name}`,
    body: `${ctx.adminBar || ""}${publicHeader(ctx)}
    <main><div class="wrap">
      <a class="btn small" href="${ctx.base}?d=${data.division.id}&tab=players">→ לכל המתחרים</a>
      <div style="margin-top:14px" class="sub">${esc(data.division.name)}${groupView ? ` · ${esc(groupView.group.name)}` : ""}${row ? ` · מקום ${row.rank}` : ""}${player.club ? ` · ${esc(player.club)}` : ""}</div>
      <h2 style="font-size:28px">${esc(player.full_name)}${isMe ? ' <span class="tag on">זה אתה</span>' : ""}</h2>
      <div class="stats">
        <div class="stat w"><div class="v">${totals.wins}</div><div class="k">ניצחונות</div></div>
        <div class="stat"><div class="v">${totals.played}</div><div class="k">משחקים</div></div>
        <div class="stat l"><div class="v">${totals.losses}</div><div class="k">הפסדים</div></div>
        ${row ? `<div class="stat"><div class="v">${row.points}</div><div class="k">נקודות בבית</div></div><div class="stat"><div class="v">${row.setsWon}:${row.setsLost}</div><div class="k">מערכות</div></div>` : ""}
      </div>
      ${row && row.form.length ? `<p class="sub">5 אחרונים: ${formDots(row.form)}</p>` : ""}
      <h3>כל המשחקים</h3>
      ${matches.length ? `<div class="cards">${matches.map((m) => matchCard(ctx, m, { label: label(m) })).join("")}</div>` : `<div class="empty">עוד אין משחקים.</div>`}
    </div></main>`,
  });
}

/* =========================================================
 * התחברות
 * ========================================================= */

function renderLogin({ ctx, step = "phone", phone = "", error = "", name = "" }) {
  let fields;

  if (step === "phone") {
    fields = `<p class="sub">מזינים את מספר הטלפון שאיתו נרשמתם לליגה.</p>
      <label for="phone">מספר טלפון</label>
      <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="050-0000000" value="${esc(phone)}" required autofocus>
      <div class="actions"><button class="btn primary" type="submit">המשך</button></div>`;
  } else if (step === "password") {
    fields = `<p class="sub">שלום ${esc(name)}! הזינו את הסיסמה שלכם.</p>
      <input type="hidden" name="phone" value="${esc(phone)}">
      <input type="text" name="username" value="${esc(phone)}" autocomplete="username" hidden>
      <label for="password">סיסמה</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <div class="hint">שכחתם? בקשו ממנהל הליגה לאפס לכם את הסיסמה.</div>
      <div class="actions"><button class="btn primary" type="submit">כניסה</button><a class="btn" href="${ctx.base}/login">טלפון אחר</a></div>`;
  } else {
    fields = `<p class="sub">שלום ${esc(name)}! זו הכניסה הראשונה שלכם. בחרו סיסמה, ובפעמים הבאות הטלפון יזכור אתכם.</p>
      <input type="hidden" name="phone" value="${esc(phone)}">
      <input type="text" name="username" value="${esc(phone)}" autocomplete="username" hidden>
      <label for="password">סיסמה חדשה</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="4" required autofocus>
      <div class="hint">לפחות 4 תווים.</div>
      <label for="confirm">הסיסמה שוב</label>
      <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="4" required>
      <div class="actions"><button class="btn primary" type="submit">שמירה וכניסה</button><a class="btn" href="${ctx.base}/login">טלפון אחר</a></div>`;
  }

  return page({
    title: `התחברות · ${ctx.league.name}`,
    body: `${publicHeader({ ...ctx, me: null, hideLogin: true })}
    <main><div class="wrap">
      <h2>התחברות לדיווח תוצאות</h2>
      ${notice({ err: error })}
      <form class="box" method="post" action="${ctx.base}/login">
        <input type="hidden" name="step" value="${esc(step)}">
        ${fields}
      </form>
    </div></main>`,
  });
}

/* =========================================================
 * המשחקים שלי
 * ========================================================= */

function renderMe({ ctx, data }) {
  const me = ctx.me;
  const mine = data
    ? data.matches.filter((m) => m.player_a === me.id || m.player_b === me.id)
    : [];
  const open = mine.filter((m) => m.status === "pending" && m.player_a && m.player_b);
  const done = mine.filter((m) => m.status === "done");
  const groupName = Object.fromEntries((data?.groups || []).map((g) => [g.group.id, g.group.name]));
  const label = (m) => (m.stage === "group" ? `${groupName[m.group_id] || ""} · מחזור ${m.round}` : "נוקאאוט");

  return page({
    title: `המשחקים שלי · ${ctx.league.name}`,
    body: `${publicHeader(ctx)}
    <main><div class="wrap">
      ${notice(ctx.flash)}
      <div class="panel-head"><div><h2>המשחקים שלי</h2><p class="sub" style="margin:0">${esc(me.full_name)}${data ? ` · ${esc(data.division.name)}` : ""}</p></div>
        <form method="post" action="${ctx.base}/logout"><button class="btn small" type="submit">התנתקות</button></form></div>
      ${!data ? `<div class="empty" style="margin-top:14px">עוד לא שובצת לדרגה. מנהל הליגה יעדכן בקרוב.</div>` : ""}
      ${data ? `<h3 style="margin-top:18px">ממתינים לתוצאה (${open.length})</h3>${open.length ? `<div class="cards">${open.map((m) => matchCard(ctx, m, { label: label(m) })).join("")}</div>` : `<div class="empty">אין משחקים פתוחים כרגע.</div>`}` : ""}
      ${done.length ? `<h3 style="margin-top:24px">שוחקו (${done.length})</h3><div class="cards">${done.map((m) => matchCard(ctx, m, { label: label(m) })).join("")}</div>` : ""}
      ${data ? `<p style="margin-top:24px"><a class="btn" href="${ctx.base}?d=${data.division.id}">לטבלה של ${esc(data.division.name)}</a></p>` : ""}
    </div></main>`,
  });
}

/* =========================================================
 * טופס תוצאה (שחקן ומנהל)
 * ========================================================= */

function resultForm({ ctx, match, data, values = {}, action }) {
  const nameA = data.byId[match.player_a]?.full_name || "";
  const nameB = data.byId[match.player_b]?.full_name || "";
  const format = data.division.score_format;
  const sets = values.sets || (match.status === "done" && !match.walkover_winner ? match.sets : []);
  const value = (i, side) => esc(sets[i]?.[side === "a" ? 0 : 1] ?? "");
  const input = (i, side) =>
    `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" name="s${i}${side}" id="s${i}${side}" value="${value(i, side)}" aria-label="${i === 2 && format === "stb" ? "סופר טייברייק" : `מערכה ${i + 1}`} – ${esc(side === "a" ? nameA : nameB)}">`;

  const currentType =
    values.type ||
    (match.walkover_winner ? (match.walkover_winner === match.player_a ? "wo_a" : "wo_b") : "sets");

  const radio = (val, label) =>
    `<label><input type="radio" name="type" value="${val}"${currentType === val ? " checked" : ""}> ${label}</label>`;

  return `<form class="box" method="post" action="${action}">
    <div class="choice">
      ${radio("sets", "המשחק שוחק")}
      ${radio("wo_a", `ניצחון טכני ל${esc(nameA)}`)}
      ${radio("wo_b", `ניצחון טכני ל${esc(nameB)}`)}
    </div>
    <label>תוצאה <span class="hint" style="display:inline">(רק אם המשחק שוחק)</span></label>
    <div class="score-grid">
      <span></span><span class="h">מערכה 1</span><span class="h">מערכה 2</span><span class="h">${format === "stb" ? "סופר טייברייק" : "מערכה 3"}</span>
      <span class="pn">${esc(nameA)}</span>${input(0, "a")}${input(1, "a")}${input(2, "a")}
      <span class="pn">${esc(nameB)}</span>${input(0, "b")}${input(1, "b")}${input(2, "b")}
    </div>
    <div class="hint">${format === "stb" ? "את הסופר טייברייק ממלאים רק אם היה 1:1 במערכות." : "את המערכה השלישית ממלאים רק אם היה 1:1."}</div>
    <label for="played_on">תאריך המשחק</label>
    <input type="date" id="played_on" name="played_on" value="${esc(values.playedOn || match.played_on || ctx.today)}" max="${esc(ctx.today)}" required>
    <div class="actions"><button class="btn primary" type="submit">שמירת תוצאה</button><a class="btn" href="${esc(ctx.back)}">ביטול</a></div>
  </form>`;
}

function renderReport({ ctx, match, data, error, values }) {
  const status = match.status === "done";

  return page({
    title: `דיווח תוצאה · ${ctx.league.name}`,
    body: `${publicHeader(ctx)}
    <main><div class="wrap">
      <h2>${status ? "תיקון תוצאה" : "דיווח תוצאה"}</h2>
      <p class="sub">${esc(data.byId[match.player_a]?.full_name)} נגד ${esc(data.byId[match.player_b]?.full_name)} · ${esc(data.division.name)}</p>
      ${status ? `<div class="notice info">כבר דווחה תוצאה${match.reported_by ? ` (על ידי ${esc(match.reported_by)})` : ""}. שמירה תחליף אותה, וכל שינוי נרשם.</div>` : ""}
      ${notice({ err: error })}
      ${resultForm({ ctx, match, data, values, action: `${ctx.base}/match/${match.id}` })}
    </div></main>`,
  });
}

/* =========================================================
 * ניהול
 * ========================================================= */

function adminBar(adminBase, league) {
  return `<div class="admin-bar"><div class="wrap">
    <span>ניהול${league ? ` · ${esc(league.name)}` : ""}</span>
    <a href="${adminBase}">ראשי</a>
    ${league ? `<a href="${adminBase}/players">שחקנים</a><a href="${adminBase}/log">יומן שינויים</a><a href="${adminBase}/preview">תצוגת שחקנים</a>` : ""}
  </div></div>`;
}

function adminPage({ adminBase, league, title, flash, body }) {
  return page({
    title: `${title} · ניהול ליגה`,
    body: `${adminBar(adminBase, league)}
      <main><div class="wrap">${notice(flash)}${body}</div></main>`,
  });
}

function renderAdminHome({ adminBase, league, leagues, divisions, stats, publicUrl, flash }) {
  if (!league) {
    return adminPage({
      adminBase,
      league: null,
      title: "ליגה חדשה",
      flash,
      body: `<h2>פתיחת ליגה</h2>
        <p class="sub">עוד אין ליגה במערכת. פתחו את הראשונה.</p>
        <form class="box" method="post" action="${adminBase}/league">
          <label for="name">שם הליגה</label><input id="name" name="name" type="text" placeholder="ליגת החורף 2026" required>
          <label for="season">עונה</label><input id="season" name="season" type="text" placeholder="עונת 26/27">
          <div class="actions"><button class="btn primary" type="submit">פתיחת ליגה</button></div>
        </form>`,
    });
  }

  const divisionRows = divisions
    .map((d) => {
      const s = stats[d.id] || {};

      return `<tr>
        <td class="l"><a class="pname" href="${adminBase}/division/${d.id}">${esc(d.name)}</a></td>
        <td class="num">${s.players || 0}</td>
        <td class="num">${s.groups || 0}</td>
        <td class="num">${s.done || 0}/${s.total || 0}</td>
        <td><a class="btn small" href="${adminBase}/division/${d.id}">ניהול</a></td>
      </tr>`;
    })
    .join("");

  return adminPage({
    adminBase,
    league,
    title: league.name,
    flash,
    body: `<div class="panel-head"><div><h2>${esc(league.name)}</h2><p class="sub" style="margin:0">${esc(league.season || "")}${league.active ? ' · <span class="tag on">מוצגת באתר</span>' : ' · <span class="tag">לא מוצגת באתר</span>'}</p></div>
      <a class="btn" href="${adminBase}/preview">לצפייה בדף השחקנים</a></div>

      <section class="panel">
        <h3>הקישור לשחקנים</h3>
        <p class="sub">הקישור הזה הולך לתיאור של קבוצת הוואטסאפ. דרכו רואים טבלאות ומתחברים לדיווח תוצאות.</p>
        <div class="inline"><input type="url" id="publicUrl" value="${esc(publicUrl)}" readonly onclick="this.select()"></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>דרגות</h3></div>
        ${divisions.length ? `<div class="table-wrap"><table><thead><tr><th class="l">דרגה</th><th>שחקנים</th><th>בתים</th><th>משחקים שוחקו</th><th></th></tr></thead><tbody>${divisionRows}</tbody></table></div>` : `<p class="sub">אין עדיין דרגות. ייבוא מהטופס יוצר אותן לבד.</p>`}
        <form class="inline" method="post" action="${adminBase}/division" style="margin-top:12px">
          <div><label for="dname">דרגה חדשה</label><input id="dname" name="name" type="text" placeholder="למשל: דרגה ד׳" required></div>
          <button class="btn" type="submit">הוספה</button>
        </form>
      </section>

      <section class="panel">
        <h3>ייבוא שחקנים מטופס ההרשמה</h3>
        <p class="sub">הדביקו את הקישור לגיליון התשובות של הטופס. שחקנים חדשים נוספים לדרגה שבחרו, ושחקנים קיימים לא מוכפלים. אפשר לייבא שוב בכל פעם שנרשמים עוד שחקנים.</p>
        <form class="inline" method="post" action="${adminBase}/import">
          <div style="flex:3 1 260px"><label for="sheet">קישור לגיליון</label><input id="sheet" name="url" type="url" value="${esc(league.sheet_url || "")}" placeholder="https://docs.google.com/spreadsheets/d/..." required></div>
          <button class="btn primary" type="submit">ייבוא</button>
        </form>
        <div class="hint">הגיליון צריך להיות משותף כ"כל מי שיש לו את הקישור – צופה".</div>
      </section>

      <section class="panel">
        <h3>הגדרות הליגה</h3>
        <form method="post" action="${adminBase}/settings">
          <div class="inline">
            <div><label for="lname">שם הליגה</label><input id="lname" name="name" type="text" value="${esc(league.name)}" required></div>
            <div><label for="lseason">עונה</label><input id="lseason" name="season" type="text" value="${esc(league.season || "")}"></div>
          </div>
          <div class="inline">
            <div><label for="pw">נקודות לניצחון</label><input id="pw" name="points_win" type="number" min="0" max="10" value="${league.points_win}"></div>
            <div><label for="pl">נקודות להפסד</label><input id="pl" name="points_loss" type="number" min="0" max="10" value="${league.points_loss}"></div>
            <div><label for="pwo">להפסד טכני</label><input id="pwo" name="points_walkover" type="number" min="0" max="10" value="${league.points_walkover}"></div>
          </div>
          <label for="rules">קישור לתקנון</label><input id="rules" name="rules_url" type="url" value="${esc(league.rules_url || "")}">
          <label for="info">הודעה לשחקנים (מופיעה בלשונית "מידע")</label><textarea id="info" name="info">${esc(league.info || "")}</textarea>
          <div class="actions"><button class="btn primary" type="submit">שמירה</button></div>
        </form>
      </section>

      <section class="panel">
        <h3>עונות</h3>
        <div class="plist">${leagues
          .map(
            (l) => `<div class="prow"><span><a class="pname" href="${adminBase}?l=${l.id}">${esc(l.name)}</a> <small>${esc(l.season || "")}</small></span>
            ${l.active ? '<span class="tag on">מוצגת באתר</span>' : `<form method="post" action="${adminBase}/activate"><input type="hidden" name="league" value="${l.id}"><button class="btn small" type="submit">להציג באתר</button></form>`}</div>`
          )
          .join("")}</div>
        <form class="inline" method="post" action="${adminBase}/league" style="margin-top:12px">
          <div><label for="nname">ליגה חדשה</label><input id="nname" name="name" type="text" placeholder="שם" required></div>
          <div><label for="nseason">עונה</label><input id="nseason" name="season" type="text"></div>
          <button class="btn" type="submit">פתיחה</button>
        </form>
      </section>`,
  });
}

function divisionSelect(name, divisions, selected, id) {
  return `<select name="${name}"${id ? ` id="${id}"` : ""}><option value="">ללא דרגה</option>${divisions
    .map((d) => `<option value="${d.id}"${d.id === selected ? " selected" : ""}>${esc(d.name)}</option>`)
    .join("")}</select>`;
}

function renderAdminPlayers({ adminBase, league, divisions, players, filter, flash }) {
  const shown = filter ? players.filter((p) => (filter === "none" ? !p.division_id : p.division_id === filter)) : players;

  const rows = shown
    .map(
      (p) => `<tr>
      <td class="l"><form id="f${p.id}" method="post" action="${adminBase}/players/${p.id}"></form>
        <input form="f${p.id}" type="text" name="full_name" value="${esc(p.full_name)}" aria-label="שם" style="min-width:150px"></td>
      <td><input form="f${p.id}" type="tel" name="phone" value="${esc(p.phone)}" aria-label="טלפון" style="min-width:120px"></td>
      <td><select form="f${p.id}" name="division_id" aria-label="דרגה"><option value="">ללא דרגה</option>${divisions
        .map((d) => `<option value="${d.id}"${d.id === p.division_id ? " selected" : ""}>${esc(d.name)}</option>`)
        .join("")}</select></td>
      <td>${p.password_hash ? '<span class="tag on">מחובר</span>' : '<span class="tag">טרם נכנס</span>'}</td>
      <td style="display:flex;gap:6px">
        <button form="f${p.id}" class="btn small primary" type="submit">שמירה</button>
        ${p.password_hash ? `<form method="post" action="${adminBase}/players/${p.id}/reset"><button class="btn small" type="submit">איפוס סיסמה</button></form>` : ""}
        <form method="post" action="${adminBase}/players/${p.id}/delete"><button class="btn small danger" type="submit">מחיקה</button></form>
      </td>
    </tr>`
    )
    .join("");

  const filterPill = (value, label) =>
    `<a class="pill" href="${adminBase}/players${value ? `?d=${value}` : ""}" aria-current="${(filter || "") === value}">${esc(label)}</a>`;

  return adminPage({
    adminBase,
    league,
    title: "שחקנים",
    flash,
    body: `<h2>שחקנים (${players.length})</h2>
      <p class="sub">איפוס סיסמה מאפשר לשחקן לבחור סיסמה חדשה בכניסה הבאה. מעבר דרגה אפשרי רק לפני שנקבעו לשחקן משחקים.</p>
      <div class="filters">${filterPill("", "כולם")}${divisions.map((d) => filterPill(d.id, d.name)).join("")}${filterPill("none", "ללא דרגה")}</div>
      <section class="panel"><div class="table-wrap"><table>
        <thead><tr><th class="l">שם</th><th>טלפון</th><th>דרגה</th><th>כניסה</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">אין שחקנים.</td></tr>`}</tbody>
      </table></div></section>
      <section class="panel">
        <h3>הוספת שחקן</h3>
        <form class="inline" method="post" action="${adminBase}/players">
          <div><label for="nn">שם מלא</label><input id="nn" name="full_name" type="text" required></div>
          <div><label for="np">טלפון</label><input id="np" name="phone" type="tel" required></div>
          <div><label for="nd">דרגה</label>${divisionSelect("division_id", divisions, Number(filter) || null, "nd")}</div>
          <button class="btn primary" type="submit">הוספה</button>
        </form>
      </section>
      `,
  });
}

function renderAdminDivision({ adminBase, ctx, league, data, flash }) {
  const division = data.division;
  const hasGroups = data.groups.length > 0;
  const groupMatches = data.matches.filter((m) => m.stage === "group");
  const played = groupMatches.filter((m) => m.status === "done").length;
  const suggestedGroups = data.players.length > 10 ? 2 : 1;

  const assignRows = data.players
    .map(
      (p) => `<div class="prow"><span>${esc(p.full_name)}</span>
        <select name="p${p.id}" aria-label="בית של ${esc(p.full_name)}"><option value="">ללא בית</option>${data.groups
          .map((g) => `<option value="${g.group.id}"${p.group_id === g.group.id ? " selected" : ""}>${esc(g.group.name)}</option>`)
          .join("")}</select></div>`
    )
    .join("");

  const groupName = Object.fromEntries(data.groups.map((g) => [g.group.id, g.group.name]));
  const pendingByRound = groupMatches.filter((m) => m.status !== "done");

  return adminPage({
    adminBase,
    league,
    title: division.name,
    flash,
    body: `<div class="panel-head"><div><h2>${esc(division.name)}</h2><p class="sub" style="margin:0">${data.players.length} שחקנים · ${played}/${groupMatches.length} משחקי בתים שוחקו</p></div>
      <a class="btn" href="${adminBase}/preview?d=${division.id}">איך השחקנים רואים</a></div>

      <section class="panel">
        <h3>הגדרות הדרגה</h3>
        <form class="inline" method="post" action="${adminBase}/division/${division.id}/settings">
          <div><label for="dn">שם</label><input id="dn" name="name" type="text" value="${esc(division.name)}" required></div>
          <div><label for="df">פורמט משחק</label><select id="df" name="score_format">
            <option value="stb"${division.score_format === "stb" ? " selected" : ""}>2 מערכות + סופר טייברייק</option>
            <option value="full"${division.score_format === "full" ? " selected" : ""}>2 מתוך 3 מערכות מלאות</option>
          </select></div>
          <button class="btn" type="submit">שמירה</button>
        </form>
      </section>

      <section class="panel">
        <h3>שלב 1 · בתים</h3>
        ${played ? `<p class="sub">כבר יש תוצאות, ולכן אי אפשר לבנות את הבתים מחדש.</p>` : `
        <p class="sub">בחרו כמה בתים, והמערכת תפזר את השחקנים. אחר כך אפשר להזיז שחקנים ידנית.</p>
        <form class="inline" method="post" action="${adminBase}/division/${division.id}/groups">
          <div><label for="gc">מספר בתים</label><input id="gc" name="count" type="number" min="1" max="8" value="${hasGroups ? data.groups.length : suggestedGroups}"></div>
          <div><label for="gm">פיזור</label><select id="gm" name="method"><option value="snake">לפי סדר ההרשמה (נחש)</option><option value="random">הגרלה</option></select></div>
          <button class="btn ${hasGroups ? "" : "primary"}" type="submit">${hasGroups ? "בנייה מחדש" : "בניית בתים"}</button>
        </form>`}
        ${hasGroups ? `<form method="post" action="${adminBase}/division/${division.id}/assign" style="margin-top:14px">
          <div class="plist">${assignRows}</div>
          ${played ? "" : `<div class="actions"><button class="btn" type="submit">שמירת שיבוץ</button></div>`}
        </form>` : ""}
      </section>

      ${hasGroups ? `<section class="panel">
        <h3>שלב 2 · משחקי הבתים</h3>
        <p class="sub">${groupMatches.length ? `נוצרו ${groupMatches.length} משחקים (כל אחד נגד כל אחד).` : "עוד לא נוצרו משחקים."} ${played ? "" : "אחרי שינוי בבתים צרו את המשחקים מחדש."}</p>
        ${played ? "" : `<form method="post" action="${adminBase}/division/${division.id}/matches"><button class="btn ${groupMatches.length ? "" : "primary"}" type="submit">${groupMatches.length ? "יצירה מחדש" : "יצירת משחקים"}</button></form>`}
      </section>` : ""}

      ${data.groups.length ? `<div class="grid2" style="margin-top:16px">${data.groups.map((g) => standingsTable(ctx, g, qualifiersOf(data))).join("")}</div>` : ""}

      ${groupMatches.length ? `<section class="panel" style="margin-top:16px">
        <h3>משחקים שטרם שוחקו (${pendingByRound.length})</h3>
        ${pendingByRound.length ? `<div class="cards">${pendingByRound.map((m) => matchCard(ctx, m, { label: `${groupName[m.group_id] || ""} · מחזור ${m.round}` })).join("")}</div>` : `<p class="sub">כל משחקי הבתים שוחקו.</p>`}
      </section>
      <section class="panel">
        <h3>משחקים ששוחקו (${played})</h3>
        ${played ? `<div class="cards">${groupMatches.filter((m) => m.status === "done").map((m) => matchCard(ctx, m, { label: `${groupName[m.group_id] || ""} · מחזור ${m.round}` })).join("")}</div>` : `<p class="sub">עוד אין תוצאות.</p>`}
      </section>` : ""}

      ${hasGroups ? `<section class="panel">
        <h3>שלב 3 · נוקאאוט</h3>
        <p class="sub">העץ נבנה לפי הטבלאות ברגע היצירה. בשני בתים עם 4 עולים: א1–ב4, ב2–א3, ב1–א4, א2–ב3.</p>
        <form class="inline" method="post" action="${adminBase}/division/${division.id}/knockout">
          <div><label for="kq">עולים מכל בית</label><input id="kq" name="qualifiers" type="number" min="1" max="16" value="${qualifiersOf(data) || (data.groups.length > 1 ? 4 : 4)}"></div>
          <div><label for="kt">משחק על מקום 3</label><select id="kt" name="third"><option value="1">כן</option><option value="0">לא</option></select></div>
          <button class="btn ${data.koRounds.length ? "" : "primary"}" type="submit">${data.koRounds.length ? "בנייה מחדש" : "יצירת נוקאאוט"}</button>
        </form>
        ${data.koRounds.length ? `<form method="post" action="${adminBase}/division/${division.id}/knockout/delete" style="margin-top:8px"><button class="btn small danger" type="submit">מחיקת הנוקאאוט</button></form>` : ""}
      </section>
      ${data.koRounds.length ? bracket(ctx, data) : ""}` : ""}`,
  });
}

function renderAdminMatch({ adminBase, ctx, league, match, data, error, values, flash }) {
  return adminPage({
    adminBase,
    league,
    title: "עריכת משחק",
    flash: { ...flash, err: error || flash?.err },
    body: `<a class="btn small" href="${adminBase}/division/${data.division.id}">→ חזרה ל${esc(data.division.name)}</a>
      <h2 style="margin-top:14px">${esc(data.byId[match.player_a]?.full_name || "ייקבע")} נגד ${esc(data.byId[match.player_b]?.full_name || "ייקבע")}</h2>
      <p class="sub">${match.reported_by ? `דווח על ידי ${esc(match.reported_by)}` : "טרם דווח"}</p>
      ${match.player_a && match.player_b && match.status !== "bye" ? resultForm({ ctx, match, data, values, action: `${adminBase}/match/${match.id}` }) : `<div class="empty">אי אפשר להזין תוצאה לפני שידוע מי משחק.</div>`}
      ${match.status === "done" ? `<form method="post" action="${adminBase}/match/${match.id}/clear" style="margin-top:12px"><button class="btn danger" type="submit">מחיקת התוצאה</button></form>` : ""}
      <form class="box" method="post" action="${adminBase}/match/${match.id}/schedule" style="margin-top:16px">
        <h3>מועד ומגרש (לא חובה)</h3>
        <div class="inline">
          <div><label for="so">תאריך</label><input id="so" name="scheduled_on" type="date" value="${esc(match.scheduled_on || "")}"></div>
          <div><label for="st">שעה</label><input id="st" name="scheduled_time" type="time" value="${esc(match.scheduled_time || "")}"></div>
        </div>
        <label for="sc">מגרש / מקום</label><input id="sc" name="court" type="text" value="${esc(match.court || "")}">
        <div class="actions"><button class="btn" type="submit">שמירת מועד</button></div>
      </form>`,
  });
}

function renderAdminLog({ adminBase, league, entries }) {
  const time = (value) =>
    new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  return adminPage({
    adminBase,
    league,
    title: "יומן שינויים",
    body: `<h2>יומן שינויים</h2><p class="sub">כל דיווח, תיקון ומחיקה של תוצאה, ומי ביצע אותם.</p>
      <section class="panel"><div class="table-wrap"><table>
        <thead><tr><th class="l">מתי</th><th class="l">מי</th><th class="l">פעולה</th><th class="l">פרטים</th></tr></thead>
        <tbody>${
          entries
            .map(
              (e) =>
                `<tr><td class="l num">${esc(time(e.created_at))}</td><td class="l">${esc(e.actor)}</td><td class="l">${esc(e.action)}</td><td class="l" style="white-space:normal">${esc(e.details || "")}</td></tr>`
            )
            .join("") || `<tr><td colspan="4">עוד אין שינויים.</td></tr>`
        }</tbody>
      </table></div></section>`,
  });
}

function renderMessage({ title, message }) {
  return page({
    title,
    body: `<main><div class="wrap" style="padding-top:40px"><div class="empty">${esc(message)}</div></div></main>`,
  });
}

module.exports = {
  esc,
  page,
  renderHome,
  renderPlayer,
  renderLogin,
  renderMe,
  renderReport,
  renderAdminHome,
  renderAdminPlayers,
  renderAdminDivision,
  renderAdminMatch,
  renderAdminLog,
  renderMessage,
};
