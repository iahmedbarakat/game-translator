/* الإطار المشترك: شاشة الدخول + شريط التنقل تحت + صورة الحساب فوق */
(function () {
  "use strict";
  var P = window.GTStore.Profiles;
  var page = document.body.getAttribute("data-page") || "photo";

  var css = [
    "body{padding-bottom:calc(env(safe-area-inset-bottom) + 92px) !important}",
    ".gt-tabs{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(15,19,22,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid #26313a;padding:6px 8px calc(env(safe-area-inset-bottom) + 6px);display:flex;justify-content:space-around}",
    ".gt-tabs a{flex:1;max-width:120px;display:flex;flex-direction:column;align-items:center;gap:3px;color:#8d9aa5;text-decoration:none;font-size:12px;padding:6px 0;border-radius:12px}",
    ".gt-tabs a svg{width:24px;height:24px}",
    ".gt-tabs a.on{color:#3fbf8f}",
    ".gt-avatar{width:36px;height:36px;border-radius:50%;background:#2a8f69;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;text-decoration:none;flex:none;margin-inline-start:auto}",
    ".gt-login{position:fixed;inset:0;z-index:100;background:#0f1316;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}",
    ".gt-login .box{width:100%;max-width:400px;text-align:center}",
    ".gt-login .logo{width:72px;height:72px;margin:0 auto 14px}",
    ".gt-login h1{font-size:26px;margin:0 0 6px;color:#f2f5f7}",
    ".gt-login p{color:#8d9aa5;font-size:15px;line-height:1.7;margin:0 0 22px}",
    ".gt-login input{width:100%;box-sizing:border-box;padding:15px;border-radius:14px;border:1px solid #26313a;background:#182027;color:#f2f5f7;font:inherit;font-size:17px;text-align:center}",
    ".gt-login .go{width:100%;margin-top:12px;padding:16px;border:0;border-radius:16px;background:#3fbf8f;color:#06281b;font:inherit;font-size:18px;font-weight:800}",
    ".gt-login .go:disabled{opacity:.5}",
    ".gt-login .who{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}",
    ".gt-login .who button{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid #26313a;background:#182027;color:#f2f5f7;font:inherit;font-size:16px;text-align:right}",
    ".gt-login .who b{width:34px;height:34px;border-radius:50%;background:#2a8f69;display:flex;align-items:center;justify-content:center;flex:none}",
    ".gt-login .or{color:#8d9aa5;font-size:13px;margin:4px 0 12px}",
    ".gt-login .note{font-size:12.5px;margin-top:16px}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var ICON = {
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'
  };
  var tabs = document.createElement("nav");
  tabs.className = "gt-tabs";
  [["photo", "./", "صورة"], ["video", "video.html", "فيديو"], ["library", "library.html", "مكتبتي"], ["account", "library.html#account", "حسابي"]].forEach(function (t) {
    var a = document.createElement("a");
    a.href = t[1]; a.innerHTML = ICON[t[0]] + "<span>" + t[2] + "</span>";
    a.setAttribute("data-tab", t[0]);
    tabs.appendChild(a);
  });
  document.body.appendChild(tabs);
  function markTabs() {
    tabs.querySelectorAll("a").forEach(function (a) {
      var t = a.getAttribute("data-tab");
      var on = page === "library" ? (location.hash === "#account" ? t === "account" : t === "library") : t === page;
      a.className = on ? "on" : "";
    });
  }
  markTabs();
  window.addEventListener("hashchange", markTabs);

  function initial(name) { return (String(name || "?").trim()[0] || "?").toUpperCase(); }
  function avatar() {
    var h = document.querySelector("header");
    if (!h) return;
    var old = h.querySelector(".gt-avatar"); if (old) old.remove();
    var p = P.current(); if (!p) return;
    var a = document.createElement("a");
    a.className = "gt-avatar"; a.href = "library.html#account"; a.title = p.name; a.textContent = initial(p.name);
    h.appendChild(a);
  }

  function showLogin() {
    var ov = document.createElement("div"); ov.className = "gt-login";
    var box = document.createElement("div"); box.className = "box";
    box.innerHTML = '<svg class="logo" viewBox="0 0 24 24"><path d="M12 2 22 20H2Z" fill="#3fbf8f"/><path d="M12 11 17 20H7Z" fill="#0f1316"/></svg>' +
      "<h1>مترجم الألعاب</h1><p>ترجم كلام الألعاب للعربي من صورة أو فيديو، وكل ترجماتك تنحفظ في مكتبتك.</p>";
    var list = P.list();
    if (list.length) {
      var who = document.createElement("div"); who.className = "who";
      list.forEach(function (p) {
        var b = document.createElement("button"); b.type = "button";
        var i = document.createElement("b"); i.textContent = initial(p.name);
        var n = document.createElement("span"); n.textContent = p.name;
        b.appendChild(i); b.appendChild(n);
        b.onclick = function () { P.use(p.id); done(); };
        who.appendChild(b);
      });
      box.appendChild(who);
      var or = document.createElement("div"); or.className = "or"; or.textContent = "أو سوِّ حساب جديد"; box.appendChild(or);
    }
    var inp = document.createElement("input"); inp.placeholder = "اكتب اسمك"; inp.maxLength = 40; inp.autocomplete = "name";
    var go = document.createElement("button"); go.className = "go"; go.type = "button"; go.textContent = "ابدأ"; go.disabled = true;
    inp.oninput = function () { go.disabled = !inp.value.trim(); };
    inp.onkeydown = function (e) { if (e.key === "Enter" && inp.value.trim()) go.click(); };
    go.onclick = function () { if (P.create(inp.value)) done(); };
    var note = document.createElement("p"); note.className = "note";
    note.textContent = "نسخة تجريبية: حسابك وترجماتك محفوظة في هذا الجهاز. تقدر تاخذ نسخة احتياطية من صفحة حسابي.";
    box.appendChild(inp); box.appendChild(go); box.appendChild(note);
    ov.appendChild(box); document.body.appendChild(ov);
    function done() { ov.remove(); avatar(); document.dispatchEvent(new CustomEvent("gt-login")); }
  }

  if (!P.current()) showLogin(); else avatar();
  window.GTShell = { refreshAvatar: avatar, showLogin: showLogin };
})();
