/*
 * לוח מגרשים — מי משחק באיזה מגרש, מי מאמן, ואיזה מגרש מושכר.
 * הנתונים מגיעים בתוך הדף (<script id="data">), וכל שינוי נשמר בשרת.
 */
(function () {
  var DATA = JSON.parse(document.getElementById("data").textContent);

  var COURTS = ["מגרש 1", "מגרש 2", "מגרש 3"];
  var DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
  var LETTERS = "אבגדהו";

  var base = location.pathname.replace(/\/+$/, "");
  var week = DATA.week;           /* 6 תאריכים, ראשון עד שישי */
  var slots = DATA.slots;         /* כל המשבצות של השבוע */
  var day = DATA.dayIndex;
  var editing = null;             /* {court, slot|null} */
  var mode = "group", pickGroup = null, pickCoach = null, players = [];

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function label(d) { var p = d.split("-").map(Number); return p[2] + "/" + p[1]; }
  function addHour(t) {
    var p = t.split(":").map(Number);
    return String(Math.min(p[0] + 1, 23)).padStart(2, "0") + ":" + String(p[1]).padStart(2, "0");
  }
  function kindOf(s) {
    if (s.kind === "rent") return "rent";
    if (/צעירה/.test(s.title)) return "young";
    if (/בוגרת/.test(s.title)) return "senior";
    if (/עתודה/.test(s.title)) return "reserve";
    return "group";
  }
  function daySlots(court) {
    return slots.filter(function (s) { return s.date === week[day] && s.court === court + 1; })
      .sort(function (a, b) { return a.from.localeCompare(b.from); });
  }
  function dayGroups() { return DATA.groups[week[day]] || []; }
  function rosterFor(name) {
    var g = dayGroups().filter(function (x) { return x.label === name; })[0];
    return g ? g.members : null;
  }

  function toast(t, isError) {
    var el = $("toast");
    el.textContent = t;
    el.style.background = isError ? "var(--warn)" : "";
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, isError ? 4000 : 2200);
  }

  function post(path, body) {
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    });
  }

  /* ---------- שבוע וימים ---------- */

  function renderWeek() {
    $("week-label").textContent = label(week[0]) + " – " + label(week[5]);
    $("week").innerHTML = week.map(function (d, i) {
      return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === day) + '"><b>' + LETTERS[i] + "׳</b><small>" + label(d) + "</small></button>";
    }).join("");
    $("week").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { day = Number(b.dataset.i); render(); };
    });
  }

  function clashes() {
    var out = {}, all = [];
    [0, 1, 2].forEach(function (c) { daySlots(c).forEach(function (s) { all.push(s); }); });
    all.forEach(function (a) {
      all.forEach(function (b) {
        if (a === b || a.kind !== "group" || b.kind !== "group" || !a.coach || a.coach !== b.coach) return;
        if (a.from < b.to && b.from < a.to) out[a.id] = a.coach;
      });
    });
    return out;
  }

  /* ---------- הלוח ---------- */

  function render() {
    renderWeek();
    $("day-title").textContent = "יום " + DAY_NAMES[day] + " " + label(week[day]);

    var items = [0, 1, 2].reduce(function (all, c) { return all.concat(daySlots(c)); }, []);
    var groups = items.filter(function (s) { return s.kind === "group"; }).length;
    var rents = items.filter(function (s) { return s.kind === "rent"; }).length;
    $("stats").innerHTML = "<span>🎾 " + groups + " אימונים</span><span>🔑 " + rents + " השכרות</span>";

    var bad = clashes();
    var names = Object.keys(bad).map(function (k) { return bad[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    $("warn").hidden = !names.length;
    $("warn").textContent = names.length ? "⚠️ " + names.join(", ") + " משובץ/ת בשני מגרשים באותה שעה" : "";

    var starts = items.map(function (s) { return s.from; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    if (!starts.length) starts = ["16:00", "17:00", "18:00"];

    var html = '<div class="hdr corner"><div>.</div></div>' +
      COURTS.map(function (c) { return '<div class="hdr"><div>' + c + "</div></div>"; }).join("");
    var morning = false, evening = false;

    starts.forEach(function (t) {
      if (t < "15:00" && !morning) { html += '<div class="section">☀️ בוקר · השכרות 7:00–15:00</div>'; morning = true; }
      if (t >= "15:00" && !evening) { html += '<div class="section">🌇 אחר הצהריים · אימונים</div>'; evening = true; }
      html += '<div class="time">' + t + "</div>";

      [0, 1, 2].forEach(function (c) {
        var list = daySlots(c);
        var s = list.filter(function (x) { return x.from === t; })[0];

        if (!s) {
          var busy = list.filter(function (x) { return x.from < t && t < x.to; })[0];
          html += busy
            ? '<div class="slot kind-' + kindOf(busy) + '" style="min-height:28px;opacity:.55;justify-content:center"><span class="t">↑ עד ' + busy.to + "</span></div>"
            : '<button type="button" class="slot empty" data-c="' + c + '" data-t="' + t + '">+ פנוי</button>';
          return;
        }

        var body = s.kind === "rent"
          ? '<span class="g">🔑 ' + esc(s.title) + '</span><span class="c">' + esc(s.via) + "</span>"
          : '<span class="g">' + esc(s.title) + '</span><span class="c">👤 ' + esc(s.coach || "בלי מאמן") + "</span>" +
            (s.players.length ? '<span class="p">👥 ' + s.players.length + " מתאמנים</span>" : "");

        html += '<button type="button" class="slot kind-' + kindOf(s) + (bad[s.id] ? " clash" : "") +
          '" data-c="' + c + '" data-id="' + s.id + '"><span class="t">' + s.from + "–" + s.to + "</span>" + body + "</button>";
      });
    });

    $("grid").innerHTML = html;
    $("grid").querySelectorAll("button.slot").forEach(function (b) {
      b.onclick = function () {
        var s = b.dataset.id ? slots.filter(function (x) { return String(x.id) === b.dataset.id; })[0] : null;
        openSheet(Number(b.dataset.c), s, b.dataset.t);
      };
    });
  }

  /* ---------- החלון של משבצת ---------- */

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    $("mode-group").hidden = m !== "group";
    $("mode-rent").hidden = m !== "rent";
    $("times").hidden = m === "free";
  }

  function chips(el, list, current, onPick) {
    el.innerHTML = list.map(function (x) { return '<button type="button" aria-pressed="' + (x === current) + '">' + esc(x) + "</button>"; }).join("");
    el.querySelectorAll("button").forEach(function (b, i) {
      b.onclick = function () { onPick(list[i]); chips(el, list, list[i], onPick); };
    });
  }

  function currentGroup() { return $("group-free").value.trim() || pickGroup; }

  function renderPlayers() {
    var ul = $("player-list");
    ul.innerHTML = players.length
      ? players.map(function (p, i) { return "<li>" + esc(p) + '<button type="button" data-i="' + i + '" aria-label="הסר ' + esc(p) + '">✕</button></li>'; }).join("")
      : '<li class="none">עוד לא נוספו מתאמנים</li>';
    ul.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { players.splice(Number(b.dataset.i), 1); renderPlayers(); };
    });
    $("load-roster").hidden = !(rosterFor(currentGroup()) || []).length;
  }

  function addPlayer() {
    var name = $("player-name").value.trim();
    if (!name) return;
    if (players.indexOf(name) === -1) players.push(name);
    $("player-name").value = "";
    renderPlayers();
    $("player-name").focus();
  }

  function openSheet(c, s, t) {
    editing = { court: c, slot: s };
    $("sheet-title").textContent = COURTS[c] + " · יום " + DAY_NAMES[day];
    $("sheet-sub").textContent = s ? s.from + "–" + s.to : "משבצת פנויה ב-" + t;

    var groupList = dayGroups().map(function (g) { return g.label; });
    if (!groupList.length) groupList = ["אימון פרטי"];
    var isGroup = s && s.kind === "group";

    pickGroup = isGroup && groupList.indexOf(s.title) !== -1 ? s.title : null;
    pickCoach = isGroup && DATA.coaches.indexOf(s.coach) !== -1 ? s.coach : null;
    $("group-free").value = isGroup && !pickGroup ? s.title : "";
    $("coach-free").value = isGroup && !pickCoach ? (s.coach || "") : "";

    chips($("group-chips"), groupList, pickGroup, function (v) { pickGroup = v; $("group-free").value = ""; renderPlayers(); });
    chips($("coach-chips"), DATA.coaches, pickCoach, function (v) { pickCoach = v; $("coach-free").value = ""; });

    players = isGroup ? s.players.slice() : [];
    $("player-name").value = "";
    renderPlayers();

    $("rent-name").value = s && s.kind === "rent" ? s.title : "";
    $("rent-via").value = s && s.kind === "rent" ? s.via : "פרטי";
    $("t-from").value = s ? s.from : t;
    $("t-to").value = s ? s.to : addHour(t);
    setMode(s ? s.kind : "group");

    /* מחיקה — רק במשבצת שכבר קיימת, עם שאלת אישור */
    $("delete-box").hidden = !s;
    $("sheet-delete").hidden = false;
    $("delete-confirm").hidden = true;

    $("scrim").hidden = false;
    $("sheet").hidden = false;
  }

  function closeSheet() { $("scrim").hidden = true; $("sheet").hidden = true; }

  function replaceSlot(oldId, fresh) {
    slots = slots.filter(function (x) { return x.id !== oldId; });
    if (fresh) slots.push(fresh);
  }

  $("sheet-save").onclick = function () {
    var e = editing;
    var old = e.slot;
    var button = $("sheet-save");

    if (mode === "free") {
      if (!old) { closeSheet(); return; }
      button.disabled = true;
      post("/slot/" + old.id + "/delete").then(function () {
        replaceSlot(old.id, null);
        toast("✓ " + COURTS[e.court] + " פנוי");
        closeSheet(); render();
      }).catch(function () { toast("השינוי לא נשמר. נסו שוב.", true); })
        .then(function () { button.disabled = false; });
      return;
    }

    var from = $("t-from").value, to = $("t-to").value;
    if (!from || !to || to <= from) { toast("שעת הסיום צריכה להיות אחרי שעת ההתחלה", true); return; }

    var body = { id: old ? old.id : null, date: week[day], court: e.court + 1, from: from, to: to, kind: mode };

    if (mode === "group") {
      body.title = currentGroup();
      body.coach = $("coach-free").value.trim() || pickCoach || "";
      body.players = players.slice();
      if (!body.title) { toast("בחרו קבוצה או כתבו שם", true); return; }
    } else {
      body.title = $("rent-name").value.trim() || "השכרה";
      body.via = $("rent-via").value;
    }

    button.disabled = true;
    post("/slot", body).then(function (res) {
      replaceSlot(old ? old.id : null, res.slot);
      toast("✓ " + (mode === "rent" ? COURTS[e.court] + " מושכר" : body.title + " ב" + COURTS[e.court]));
      closeSheet(); render();
    }).catch(function () { toast("השינוי לא נשמר. נסו שוב.", true); })
      .then(function () { button.disabled = false; });
  };

  $("sheet-delete").onclick = function () {
    $("sheet-delete").hidden = true;
    $("delete-confirm").hidden = false;
  };
  $("delete-no").onclick = function () {
    $("sheet-delete").hidden = false;
    $("delete-confirm").hidden = true;
  };
  $("delete-yes").onclick = function () {
    var e = editing;
    var old = e && e.slot;
    if (!old) return;
    var button = $("delete-yes");
    button.disabled = true;
    post("/slot/" + old.id + "/delete").then(function () {
      replaceSlot(old.id, null);
      toast("🗑️ " + old.title + " נמחק מ" + COURTS[e.court]);
      closeSheet(); render();
    }).catch(function () { toast("המחיקה לא הצליחה. נסו שוב.", true); })
      .then(function () { button.disabled = false; });
  };

  document.querySelectorAll(".tabs button").forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });
  $("scrim").onclick = closeSheet;
  $("sheet-cancel").onclick = closeSheet;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  $("group-free").oninput = function () {
    if ($("group-free").value.trim()) {
      pickGroup = null;
      $("group-chips").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    }
    renderPlayers();
  };
  $("coach-free").oninput = function () {
    if ($("coach-free").value.trim()) {
      pickCoach = null;
      $("coach-chips").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    }
  };
  $("player-add").onclick = addPlayer;
  $("player-name").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); addPlayer(); } };
  $("load-roster").onclick = function () {
    var roster = rosterFor(currentGroup()) || [];
    roster.forEach(function (n) { if (players.indexOf(n) === -1) players.push(n); });
    renderPlayers();
    toast("✓ נטענו " + roster.length + " מתאמנים מהקבוצה");
  };

  $("add-row").onclick = function () { openSheet(0, null, "20:00"); };

  $("copy-week").onclick = function () {
    var button = $("copy-week");
    button.disabled = true;
    post("/copy", { weekStart: week[0] }).then(function (res) {
      slots = res.slots;
      toast(res.copied ? "✓ הועתקו " + res.copied + " משבצות מהשבוע שעבר" : "אין מה להעתיק — השבוע שעבר ריק, או שהמשבצות כבר קיימות");
      render();
    }).catch(function () { toast("ההעתקה לא הצליחה. נסו שוב.", true); })
      .then(function () { button.disabled = false; });
  };

  function goWeek(days) {
    var p = week[0].split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days, 12)).toISOString().slice(0, 10);
    location.href = base + "?w=" + d;
  }
  $("prev-week").onclick = function () { goWeek(-7); };
  $("next-week").onclick = function () { goWeek(7); };

  render();
})();
