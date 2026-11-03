/*
 * יומן אימון של שחקן — הדף שהשחקן ממלא אחרי כל אימון.
 * הנתונים מגיעים בתוך הדף (<script id="data">), והשמירה נשלחת לשרת.
 */
(function () {
  var DATA = JSON.parse(document.getElementById("data").textContent);

  var ITEMS = [
    ["fh", "פורהאנד"], ["bh", "בקהאנד"], ["fw", "עבודת רגליים"], ["mt", "מנטלי"],
    ["vo", "וולי"], ["sv", "סרב"], ["rt", "ריטרן לסרב"], ["tb", "כדור שלישי"], ["ro", "רוטינה של פעולות"]
  ];
  var WORDS = ["", "מצוין", "טוב", "בסדר", "חלש", "לא טוב"];
  var COLORS = ["", "var(--r1)", "var(--r2)", "var(--r3)", "var(--r4)", "var(--r5)"];
  var DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  var todayStr = DATA.today;
  var history = DATA.entries.map(function (e) {
    var row = { date: e.date, note: e.note || "" };
    ITEMS.forEach(function (it) { row[it[0]] = e.ratings[it[0]] || null; });
    return row;
  });

  var $ = function (id) { return document.getElementById(id); };

  function parse(d) {
    var p = d.split("-").map(Number);
    return { w: new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).getUTCDay(), m: p[1], day: p[2] };
  }
  function shiftDay(d, n) {
    var p = d.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12)).toISOString().slice(0, 10);
  }
  function longLabel(d) { var p = parse(d); return "יום " + DAYS[p.w] + " " + p.day + "/" + p.m; }
  function shortLabel(d) { var p = parse(d); return SHORT[p.w] + "<small>" + p.day + "/" + p.m + "</small>"; }
  function dm(d) { var p = parse(d); return p.day + "/" + p.m; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  $("today-date").textContent = longLabel(todayStr);

  /* ---------- הדירוג של היום ---------- */

  var existing = history.filter(function (h) { return h.date === todayStr; })[0];
  var today = {};
  ITEMS.forEach(function (it) { today[it[0]] = existing ? existing[it[0]] : null; });
  if (existing) $("note").value = existing.note || "";

  function updateProgress() {
    var done = ITEMS.filter(function (it) { return today[it[0]]; }).length;
    $("bar").style.width = (done / ITEMS.length * 100) + "%";
    $("progress-t").textContent = done === ITEMS.length
      ? "כל הסעיפים דורגו ✓"
      : done + " מתוך " + ITEMS.length + " סעיפים";
  }

  ITEMS.forEach(function (it) {
    var key = it[0], name = it[1];
    var card = document.createElement("div");
    card.className = "skill";
    card.innerHTML = '<div class="skill-top"><b>' + name + '</b><em></em></div><div class="rates" role="group" aria-label="' + name + '"></div>';
    var rates = card.querySelector(".rates");

    function choose(v) {
      today[key] = v;
      rates.classList.add("has-choice");
      rates.querySelectorAll(".rate").forEach(function (x) { x.setAttribute("aria-pressed", String(Number(x.dataset.v) === v)); });
      card.classList.add("done");
      card.style.setProperty("--sel", COLORS[v]);
      card.querySelector("em").textContent = WORDS[v];
    }

    for (var v = 1; v <= 5; v++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rate";
      b.dataset.v = v;
      b.innerHTML = "<b>" + v + "</b><small>" + WORDS[v] + "</small>";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", name + ": " + v + " — " + WORDS[v]);
      b.onclick = (function (value) {
        return function () { choose(value); $("msg").hidden = true; updateProgress(); };
      })(v);
      rates.appendChild(b);
    }

    $("skills").appendChild(card);
    if (today[key]) choose(today[key]);
  });

  if (existing) {
    $("save").textContent = "עדכון הדירוג של היום 🎾";
  }

  $("save").onclick = function () {
    var msg = $("msg");
    var missing = ITEMS.filter(function (it) { return !today[it[0]]; }).map(function (it) { return it[1]; });

    msg.hidden = false;

    if (missing.length) {
      msg.className = "msg err";
      msg.textContent = "עוד לא דירגת: " + missing.join(", ");
      return;
    }

    var button = $("save");
    button.disabled = true;

    fetch(location.pathname.replace(/\/+$/, "") + "/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratings: today, note: $("note").value })
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }).then(function () {
      var row = history.filter(function (h) { return h.date === todayStr; })[0];
      if (!row) { row = { date: todayStr }; history.unshift(row); }
      ITEMS.forEach(function (it) { row[it[0]] = today[it[0]]; });
      row.note = $("note").value;
      msg.className = "msg ok";
      msg.textContent = "✓ נשמר! כל הכבוד " + DATA.firstName + ", ממשיכים ככה 🎾";
      button.textContent = "עדכון הדירוג של היום 🎾";
      render();
    }).catch(function () {
      msg.className = "msg err";
      msg.textContent = "השמירה לא הצליחה. בדקי שיש אינטרנט ונסי שוב.";
    }).then(function () {
      button.disabled = false;
    });
  };

  updateProgress();

  /* ---------- סיכום ---------- */

  var period = 7;

  function cell(v) { return v ? '<span class="c c' + v + '">' + v + "</span>" : "–"; }
  function avgChip(a) { return a ? '<span class="avgv a' + Math.round(a) + '">' + a.toFixed(1) + "</span>" : "–"; }
  function averages(days) {
    return ITEMS.map(function (it) {
      var vals = days.map(function (h) { return h[it[0]]; }).filter(Boolean);
      return { k: it[0], name: it[1], avg: vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null };
    });
  }

  function renderPeriod() {
    var from = shiftDay(todayStr, -(period - 1));
    var days = history.filter(function (h) { return h.date >= from; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });

    $("range").innerHTML = days.length
      ? "<b>" + dm(from) + " – " + dm(todayStr) + "</b> · " + days.length + " אימונים שמולאו"
      : "עוד אין אימונים שמולאו בין " + dm(from) + " ל־" + dm(todayStr) + ".";

    $("table-box").hidden = !days.length;
    $("hint").hidden = !days.length;

    $("head").innerHTML =
      '<th class="sticky" style="text-align:right;padding-inline-start:12px">סעיף</th><th>ממוצע</th>' +
      days.map(function (h) { return "<th>" + shortLabel(h.date) + "</th>"; }).join("");

    var avgs = averages(days);

    $("rows").innerHTML = avgs.map(function (a) {
      return '<tr><td class="n sticky">' + a.name + '</td><td class="avg">' + avgChip(a.avg) + "</td>" +
        days.map(function (h) { return "<td>" + cell(h[a.k]) + "</td>"; }).join("") + "</tr>";
    }).join("");

    var ranked = avgs.filter(function (a) { return a.avg; }).sort(function (a, b) { return a.avg - b.avg; });

    $("tips").innerHTML = ranked.length > 1
      ? '<div class="tip"><b>💪 הכי חזק אצלך</b><span>' + ranked[0].name + "</span></div>" +
        '<div class="tip"><b>🎯 כדאי לעבוד על</b><span>' + ranked[ranked.length - 1].name + "</span></div>"
      : "";
  }

  function renderDay() {
    var date = $("day-pick").value;
    var entry = history.filter(function (h) { return h.date === date; })[0];
    var box = $("day-card");

    $("range").innerHTML = date ? "<b>" + longLabel(date) + "</b>" : "";
    $("tips").innerHTML = "";

    if (!entry) {
      var near = history.slice().sort(function (a, b) {
        return Math.abs(new Date(a.date) - new Date(date)) - Math.abs(new Date(b.date) - new Date(date));
      }).slice(0, 3).sort(function (a, b) { return a.date.localeCompare(b.date); });

      box.innerHTML = '<div class="empty">ביום הזה לא מולא יומן.</div>' +
        (near.length ? '<div class="periods" style="justify-content:center">' + near.map(function (h) {
          return '<button type="button" data-go="' + h.date + '" aria-pressed="false">' + longLabel(h.date) + "</button>";
        }).join("") + "</div>" : "");

      box.querySelectorAll("[data-go]").forEach(function (b) {
        b.onclick = function () { $("day-pick").value = b.dataset.go; renderDay(); };
      });
      return;
    }

    box.innerHTML = "<h4>" + longLabel(date) + "</h4>" +
      ITEMS.map(function (it) {
        var v = entry[it[0]];
        return '<div class="day-row"><span>' + it[1] + '</span><span style="display:flex;align-items:center;gap:8px">' +
          (v ? '<small style="color:' + COLORS[v] + ';font-weight:700">' + WORDS[v] + "</small>" : "") + cell(v) + "</span></div>";
      }).join("") +
      (entry.note ? '<div class="day-note">📝 ' + esc(entry.note) + "</div>" : "");
  }

  function render() {
    var isDay = period === "day";

    $("pick").hidden = !isDay;
    $("day-card").hidden = !isDay;

    if (isDay) {
      $("table-box").hidden = true;
      $("hint").hidden = true;
      renderDay();
    } else {
      renderPeriod();
    }
  }

  var periodButtons = document.querySelectorAll(".periods[aria-label='תקופה'] button");

  periodButtons.forEach(function (b) {
    b.onclick = function () {
      periodButtons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      period = b.dataset.days === "day" ? "day" : Number(b.dataset.days);
      render();
    };
  });

  var pick = $("day-pick");
  pick.max = todayStr;
  pick.min = history.length ? history[history.length - 1].date : todayStr;
  pick.value = history.length ? history[0].date : todayStr;
  pick.onchange = renderDay;

  render();
})();
