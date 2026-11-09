/* مترجم الألعاب - يقرأ الكلام من صورة الشاشة (Tesseract) ويترجمه للعربي */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var abs = function (p) { return new URL(p, location.href).href; };

  var worker = null, workerReady = null, busy = false;
  var photo = null;          // HTMLImageElement بالدقة الكاملة
  var sel = null;            // {x,y,w,h} نسب من 0 لـ 1
  var lastSel = null;
  var fontSize = 24;
  var history = [];

  // ---------------------------------------------------- تخزين بسيط
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  fontSize = load("gt_font", 24);
  lastSel = load("gt_sel", null);
  history = load("gt_hist", []);
  applyFont();
  renderHistory();

  // ---------------------------------------------------- قارئ النص
  function initOCR() {
    if (workerReady) return workerReady;
    workerReady = Tesseract.createWorker("eng", 1, {
      workerPath: abs("worker.min.js"),
      corePath: abs("./"),
      langPath: abs("./").replace(/\/$/, ""),
      gzip: true
    }).then(function (w) {
      worker = w;
      $("engine").textContent = "جاهز ✓";
      $("engine").className = "engine ok";
      return w;
    }).catch(function (e) {
      workerReady = null;
      $("engine").textContent = "ما قدرت أجهز قارئ النص، تأكد من الإنترنت وحدّث الصفحة.";
      throw e;
    });
    return workerReady;
  }
  initOCR();

  // ---------------------------------------------------- الأزرار
  $("shootBtn").onclick = function () { $("camInput").value = ""; $("camInput").click(); };
  $("pickBtn").onclick = function () { $("picInput").value = ""; $("picInput").click(); };
  $("camInput").onchange = function (e) { openFile(e.target.files && e.target.files[0]); };
  $("picInput").onchange = function (e) { openFile(e.target.files && e.target.files[0]); };
  $("goBtn").onclick = function () { run(sel); };
  $("fullBtn").onclick = function () { run(null); };
  $("retranslate").onclick = function () {
    var t = clean($("enText").value);
    if (t) translateAndShow(t);
  };
  $("minus").onclick = function () { fontSize = Math.max(16, fontSize - 2); applyFont(); };
  $("plus").onclick = function () { fontSize = Math.min(44, fontSize + 2); applyFont(); };
  $("clearHist").onclick = function () { history = []; save("gt_hist", history); renderHistory(); };

  function applyFont() {
    document.documentElement.style.setProperty("--ar", fontSize + "px");
    save("gt_font", fontSize);
  }

  // ---------------------------------------------------- فتح الصورة
  function openFile(file) {
    if (!file) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      photo = img;
      $("photo").src = url;
      $("cropSec").classList.remove("hidden");
      $("resultSec").classList.add("hidden");
      sel = lastSel;  // نفس المربع اللي استخدمته آخر مرة، تقدر ترسم غيره
      drawSel();
      setTimeout(function () { $("cropSec").scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
    };
    img.onerror = function () { showError("ما قدرت أفتح الصورة. جرّب صورة ثانية."); };
    img.src = url;
  }

  // ---------------------------------------------------- رسم المربع بالإصبع
  var stage = $("stage"), start = null;
  function pos(e) {
    var r = stage.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  stage.addEventListener("pointerdown", function (e) {
    start = pos(e);
    try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    sel = { x: start.x, y: start.y, w: 0, h: 0 };
    drawSel();
    e.preventDefault();
  });
  stage.addEventListener("pointermove", function (e) {
    if (!start) return;
    var p = pos(e);
    sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    drawSel();
    e.preventDefault();
  });
  function endDrag() {
    if (!start) return;
    start = null;
    if (!sel || sel.w < 0.03 || sel.h < 0.02) sel = null;  // لمسة بالغلط
    drawSel();
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  function drawSel() {
    var s = $("sel");
    if (!sel) { s.style.display = "none"; $("goBtn").textContent = "ترجم كل الصورة"; return; }
    s.style.display = "block";
    s.style.left = sel.x * 100 + "%"; s.style.top = sel.y * 100 + "%";
    s.style.width = sel.w * 100 + "%"; s.style.height = sel.h * 100 + "%";
    $("goBtn").textContent = "ترجم";
  }

  // ---------------------------------------------------- تجهيز الصورة للقراءة
  function prepare(img, r) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var sx = 0, sy = 0, sw = W, sh = H;
    if (r) { sx = Math.round(r.x * W); sy = Math.round(r.y * H); sw = Math.max(1, Math.round(r.w * W)); sh = Math.max(1, Math.round(r.h * H)); }
    var maxW = r ? 2000 : 2400;
    var scale = Math.min(maxW / sw, 3);          // نكبّر المربع الصغير، ونصغّر الكبير
    if (!r) scale = Math.min(scale, 1);
    var cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale));
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    var d = ctx.getImageData(0, 0, cw, ch), p = d.data, n = cw * ch;
    var g = new Uint8ClampedArray(n), hist = new Uint32Array(256), sum = 0;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var v = (p[j] * 299 + p[j + 1] * 587 + p[j + 2] * 114) / 1000;
      g[i] = v; hist[g[i]]++; sum += v;
    }
    var invert = (sum / n) < 115;                 // كلام أبيض على خلفية غامقة -> نقلبه
    var lo = pct(hist, n, 0.02), hi = pct(hist, n, 0.98);
    if (hi - lo < 10) { lo = 0; hi = 255; }
    var k = 255 / (hi - lo);
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var y = (g[i] - lo) * k;
      if (invert) y = 255 - y;
      p[j] = p[j + 1] = p[j + 2] = y < 0 ? 0 : y > 255 ? 255 : y;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }
  function pct(hist, n, q) { var t = n * q, a = 0; for (var i = 0; i < 256; i++) { a += hist[i]; if (a >= t) return i; } return 255; }

  // ---------------------------------------------------- تنظيف النص
  function clean(t) {
    return String(t || "")
      .replace(/[|]/g, "I")
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  }
  function textFrom(data) {
    var lines = (data && data.lines) || [];
    var keep = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], txt = clean(L.text);
      var letters = (txt.match(/[A-Za-z]/g) || []).length;
      if (letters < 2) continue;
      if (L.confidence < 45 && letters < 12) continue;      // غالبًا تشويش
      if (letters / Math.max(1, txt.replace(/\s/g, "").length) < 0.5) continue;
      keep.push(txt);
    }
    if (!keep.length && data && data.text && data.confidence > 50) return clean(data.text);
    return clean(keep.join(" "));
  }

  // ---------------------------------------------------- القراءة + الترجمة
  function run(r) {
    if (busy || !photo) return;
    busy = true; setButtons(false);
    if (r) { lastSel = r; save("gt_sel", r); }
    $("resultSec").classList.remove("hidden");
    $("enBox").open = false;
    status("جاري قراءة الكلام...");
    $("resultSec").scrollIntoView({ behavior: "smooth", block: "start" });
    var canvas;
    initOCR().then(function (w) {
      canvas = prepare(photo, r);
      return readBest(w, canvas, r ? ["6", "11"] : ["3", "11"]);
    }).then(function (en) {
      $("enText").value = en;
      if (!en) {
        showError(r ? "ما قدرت أقرأ كلام في المربع. ارسم المربع حول الكلام بالضبط، وصوّر من قدام الشاشة بدون انعكاس ضوء."
                    : "ما لقيت كلام واضح. جرّب ترسم مربع حول الكلام بس.");
        return;
      }
      return translateAndShow(en, true);
    }).catch(function (e) {
      showError("صار خطأ في قراءة الصورة. حدّث الصفحة وجرّب مرة ثانية.");
      if (window.console) console.error(e);
    }).then(function () { busy = false; setButtons(true); });
  }

  // نقرأ بطريقتين ونختار اللي طلع منها كلام أكثر (كل طريقة أحيانًا تفوّت سطر)
  function readBest(w, canvas, modes) {
    var best = "", i = 0;
    function next() {
      if (i >= modes.length) return Promise.resolve(best);
      var m = modes[i++];
      return w.setParameters({ tessedit_pageseg_mode: m }).then(function () {
        return w.recognize(canvas);
      }).then(function (res) {
        var t = textFrom(res.data);
        if (letterCount(t) > letterCount(best)) best = t;
        return next();
      });
    }
    return next();
  }
  function letterCount(t) { return (String(t).match(/[A-Za-z]/g) || []).length; }

  function translateAndShow(en, fromRun) {
    if (!fromRun) setButtons(false);
    status("جاري الترجمة...");
    return translate(en).then(function (ar) {
      var body = $("resultBody");
      body.innerHTML = "";
      var d = document.createElement("div"); d.className = "ar"; d.textContent = ar;
      body.appendChild(d);
      $("enText").value = en;
      addHistory(en, ar);
    }).catch(function () {
      showError("قريت الكلام بس ما قدرت أترجمه. تأكد من الإنترنت واضغط \"ترجم النص بعد التصحيح\".");
      $("enBox").open = true;
    }).then(function () { if (!fromRun) setButtons(true); });
  }

  function translate(text) {
    return google(text).catch(function () { return myMemory(text); }).then(function (ar) {
      return fixNames(text, ar);
    });
  }
  function google(text) {
    var u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=" + encodeURIComponent(text);
    return timedFetch(u).then(function (j) {
      var out = (j && j[0] || []).map(function (x) { return x && x[0] || ""; }).join("").trim();
      if (!out) throw new Error("empty");
      return out;
    });
  }
  function myMemory(text) {
    var u = "https://api.mymemory.translated.net/get?langpair=en%7Car&q=" + encodeURIComponent(text.slice(0, 480));
    return timedFetch(u).then(function (j) {
      var out = j && j.responseData && j.responseData.translatedText;
      if (!out || j.responseStatus !== 200) throw new Error("mymemory");
      return out.trim();
    });
  }
  function timedFetch(u) {
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }
  // أسماء زيلدا: Google أحيانًا يترجم Link إلى "رابط"
  function fixNames(en, ar) {
    if (/\bLink\b/.test(en)) ar = ar.replace(/(ال)?رابط/g, "لينك");
    return ar;
  }

  // ---------------------------------------------------- عرض
  function status(msg) {
    $("resultBody").innerHTML = '<div class="status"><span class="spin"></span><span></span></div>';
    $("resultBody").querySelector(".status span:last-child").textContent = msg;
  }
  function showError(msg) {
    $("resultSec").classList.remove("hidden");
    $("resultBody").innerHTML = '<div class="err"></div>';
    $("resultBody").firstChild.textContent = msg;
  }
  function setButtons(on) {
    ["shootBtn", "pickBtn", "goBtn", "fullBtn", "retranslate"].forEach(function (id) { $(id).disabled = !on; });
  }
  function addHistory(en, ar) {
    if (history.length && history[0].en === en) { history[0].ar = ar; }
    else history.unshift({ en: en, ar: ar });
    history = history.slice(0, 30);
    save("gt_hist", history);
    renderHistory();
  }
  function renderHistory() {
    var h = $("hist"); h.innerHTML = "";
    $("histTitle").classList.toggle("hidden", history.length === 0);
    history.forEach(function (it) {
      var d = document.createElement("div"); d.className = "h";
      var a = document.createElement("div"); a.textContent = it.ar;
      var e = document.createElement("div"); e.className = "en"; e.textContent = it.en;
      d.appendChild(a); d.appendChild(e); h.appendChild(d);
    });
  }
})();
