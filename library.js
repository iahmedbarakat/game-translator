/* صفحة مكتبتي + حسابي */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var S = window.GTStore, P = S.Profiles, L = S.Library;
  var filter = "all", game = "", query = "", items = [], openVideo = {};

  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 1800); }
  function fmtDate(ms) {
    try { return new Date(ms).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }
  function fmtT(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }
  function copy(text) {
    try { navigator.clipboard.writeText(text).then(function () { toast("انتسخ ✓"); }, function () { toast("ما قدرت أنسخ"); }); }
    catch (e) { toast("ما قدرت أنسخ"); }
  }

  // ------------------------------------------------ التبديل بين المكتبة والحساب
  function route() {
    var acc = location.hash === "#account";
    $("libView").classList.toggle("hidden", acc);
    $("accView").classList.toggle("hidden", !acc);
    $("title").textContent = acc ? "حسابي" : "مكتبتي";
    load();
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("gt-login", route);
  L.onChange(function () { load(); });

  function load() {
    if (!P.current()) return;
    L.all().then(function (list) { items = list; render(); renderAccount(); });
  }

  // ------------------------------------------------ المكتبة
  $("q").oninput = function () { query = this.value.trim().toLowerCase(); render(); };
  $("chips").onclick = function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    filter = b.getAttribute("data-f");
    this.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c === b); });
    render();
  };
  $("game").onchange = function () { game = this.value; render(); };

  function textOf(it) {
    if (it.type === "video") return (it.title || "") + " " + (it.lines || []).map(function (l) { return l.en + " " + l.ar; }).join(" ");
    return (it.en || "") + " " + (it.ar || "");
  }

  function render() {
    // قائمة الألعاب
    var games = {}; items.forEach(function (it) { if (it.game) games[it.game] = (games[it.game] || 0) + 1; });
    var sel = $("game"), keep = game;
    sel.innerHTML = "";
    var o = document.createElement("option"); o.value = ""; o.textContent = "كل الألعاب"; sel.appendChild(o);
    Object.keys(games).sort().forEach(function (g) { var op = document.createElement("option"); op.value = g; op.textContent = g + " (" + games[g] + ")"; sel.appendChild(op); });
    sel.value = games[keep] ? keep : ""; game = sel.value;
    sel.classList.toggle("hidden", Object.keys(games).length < 1);

    var shown = items.filter(function (it) {
      if (filter === "photo" && it.type !== "photo") return false;
      if (filter === "video" && it.type !== "video") return false;
      if (filter === "fav" && !it.fav) return false;
      if (game && it.game !== game) return false;
      if (query && textOf(it).toLowerCase().indexOf(query) < 0) return false;
      return true;
    });
    $("count").textContent = shown.length + " ترجمة";
    var box = $("list"); box.innerHTML = "";
    if (!items.length) {
      box.innerHTML = '<div class="empty">مكتبتك فاضية.<br>أي صورة أو فيديو تترجمه ينحفظ هنا تلقائيًا.<br><a href="./">ترجم أول صورة</a></div>';
      return;
    }
    if (!shown.length) { box.innerHTML = '<div class="empty">ما فيه نتائج.</div>'; return; }
    shown.forEach(function (it) { box.appendChild(card(it)); });
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function card(it) {
    var c = el("div", "item"), top = el("div", "top");
    if (it.thumb) { var im = el("img"); im.src = it.thumb; im.alt = ""; top.appendChild(im); }
    var tx = el("div", "txt");
    if (it.type === "video") {
      tx.appendChild(el("div", "ar", it.title || "فيديو"));
      var first = (it.lines || []).slice(0, 2).map(function (l) { return l.ar; }).join(" · ");
      tx.appendChild(el("div", "en", "")).style.direction = "rtl";
      tx.lastChild.style.textAlign = "right"; tx.lastChild.textContent = first;
    } else {
      tx.appendChild(el("div", "ar", it.ar || ""));
      tx.appendChild(el("div", "en", it.en || ""));
    }
    var meta = el("div", "meta");
    meta.appendChild(el("span", "kind", it.type === "video" ? "فيديو · " + (it.lines || []).length + " جملة" : "صورة"));
    meta.appendChild(document.createTextNode(fmtDate(it.updated || it.created) + (it.game ? " · " + it.game : "") + (it.engine ? " · " + it.engine : "")));
    tx.appendChild(meta);
    top.appendChild(tx); c.appendChild(top);

    var linesBox = null;
    if (it.type === "video") {
      linesBox = el("div", "lines" + (openVideo[it.id] ? "" : " hidden"));
      (it.lines || []).forEach(function (l) {
        var d = el("div", "l");
        d.appendChild(el("span", "t", fmtT(l.start)));
        d.appendChild(el("div", "", l.ar));
        var en = el("div", "en", l.en); en.style.cssText = "direction:ltr;text-align:left;color:#8d9aa5;font-size:12.5px";
        d.appendChild(en);
        linesBox.appendChild(d);
      });
      c.appendChild(linesBox);
    }

    var acts = el("div", "acts");
    var fav = el("button", it.fav ? "fav" : "", it.fav ? "★ مفضلة" : "☆ مفضلة"); fav.type = "button";
    fav.onclick = function () { L.update(it.id, { fav: !it.fav }); };
    acts.appendChild(fav);
    if (it.type === "video") {
      var show = el("button", "", openVideo[it.id] ? "إخفاء الجمل" : "عرض الجمل"); show.type = "button";
      show.onclick = function () { openVideo[it.id] = !openVideo[it.id]; linesBox.classList.toggle("hidden"); show.textContent = openVideo[it.id] ? "إخفاء الجمل" : "عرض الجمل"; };
      acts.appendChild(show);
    }
    var cp = el("button", "", "نسخ"); cp.type = "button";
    cp.onclick = function () {
      copy(it.type === "video" ? (it.lines || []).map(function (l) { return fmtT(l.start) + "  " + l.ar; }).join("\n") : it.ar);
    };
    acts.appendChild(cp);
    var del = el("button", "del", "حذف"); del.type = "button";
    del.onclick = function () {
      if (del.getAttribute("data-sure")) { L.remove(it.id); toast("انحذفت"); return; }
      del.setAttribute("data-sure", "1"); del.textContent = "متأكد؟";
      setTimeout(function () { del.removeAttribute("data-sure"); del.textContent = "حذف"; }, 3000);
    };
    acts.appendChild(del);
    c.appendChild(acts);
    return c;
  }

  // ------------------------------------------------ الحساب
  function renderAccount() {
    var p = P.current(); if (!p) return;
    $("av").textContent = (p.name.trim()[0] || "?").toUpperCase();
    $("nm").textContent = p.name;
    $("since").textContent = "معنا من " + fmtDate(p.created);
    if (document.activeElement !== $("nameIn")) $("nameIn").value = p.name;
    if (document.activeElement !== $("gameIn")) $("gameIn").value = p.game || "";
    $("sAll").textContent = items.length;
    $("sPhoto").textContent = items.filter(function (i) { return i.type === "photo"; }).length;
    $("sVideo").textContent = items.filter(function (i) { return i.type === "video"; }).length;
    $("sFav").textContent = items.filter(function (i) { return i.fav; }).length;
  }
  $("nameSave").onclick = function () {
    var v = $("nameIn").value.trim(); if (!v) return;
    P.update({ name: v }); window.GTShell.refreshAvatar(); renderAccount(); toast("انحفظ ✓");
  };
  $("gameSave").onclick = function () {
    P.update({ game: $("gameIn").value.trim() }); renderAccount(); toast("انحفظ ✓");
  };
  GT.mountPicker($("enginePick"));

  $("exportBtn").onclick = function () {
    L.exportJSON().then(function (json) {
      var blob = new Blob([json], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "مكتبة-مترجم-الألعاب-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  };
  $("importBtn").onclick = function () { $("importFile").value = ""; $("importFile").click(); };
  $("importFile").onchange = function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    f.text().then(function (t) { return L.importJSON(t); }).then(function (n) { toast("انضافت " + n + " ترجمة ✓"); }, function () { toast("الملف مو نسخة صحيحة"); });
  };
  $("switchBtn").onclick = function () { P.logout(); window.GTShell.refreshAvatar(); window.GTShell.showLogin(); };
  $("deleteBtn").onclick = function () {
    var b = $("deleteBtn");
    if (!b.getAttribute("data-sure")) {
      b.setAttribute("data-sure", "1"); b.textContent = "اضغط مرة ثانية للحذف النهائي";
      setTimeout(function () { b.removeAttribute("data-sure"); b.textContent = "حذف الحساب"; }, 4000);
      return;
    }
    var p = P.current(); if (!p) return;
    P.remove(p.id).then(function () { window.GTShell.refreshAvatar(); window.GTShell.showLogin(); });
  };

  route();
})();
