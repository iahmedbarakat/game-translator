/* ترجمة فيديو: يقرأ الترجمة الإنجليزية من الفيديو ويعرضها بالعربي وهو يشتغل */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var abs = function (p) { return new URL(p, location.href).href; };

  var STEP = 0.5;                 // نقرأ إطار كل نص ثانية
  var worker = null, workerReady = null;
  var fileUrl = null, sel = null, cancelled = false, running = false;
  var segments = [];              // [{start,end,en,ar}]
  var subSize = 22;
  var engines = {};
  var fileSig = "";

  // نحفظ الترجمة لكل فيديو، عشان لو رجعت له ما تحتاج تعيد القراءة
  function getCache(sig) { var all = load("gt_vcache", {}); return all[sig] || null; }
  function putCache() {
    if (!fileSig) return;
    var all = load("gt_vcache", {});
    all[fileSig] = { segments: segments, engines: engines, t: Date.now() };
    var keys = Object.keys(all).sort(function (a, b) { return all[b].t - all[a].t; });
    keys.slice(8).forEach(function (k) { delete all[k]; });
    save("gt_vcache", all);
  }

  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  sel = load("gt_vsel", { x: 0.08, y: 0.72, w: 0.84, h: 0.24 });  // الترجمة غالبًا تحت
  subSize = load("gt_vsub", 22);
  applySub();

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
      return w.setParameters({ tessedit_pageseg_mode: "6" }).then(function () { return w; });
    }).catch(function (e) {
      workerReady = null;
      $("engine").textContent = "ما قدرت أجهز قارئ النص، تأكد من الإنترنت وحدّث الصفحة.";
      throw e;
    });
    return workerReady;
  }
  initOCR();
  GT.mountPicker($("enginePick"));

  // ---------------------------------------------------- اختيار الفيديو
  $("pickBtn").onclick = pick;
  $("otherBtn").onclick = pick;
  $("againBtn").onclick = pick;
  function pick() { if (running) return; $("fileInput").value = ""; $("fileInput").click(); }

  $("fileInput").onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(f);
    fileSig = f.name + "|" + f.size;
    var v = $("setupVideo");
    v.src = fileUrl;
    v.muted = true;
    // الآيفون ما يعرض الإطارات إلا بعد تشغيل أول مرة
    var p = v.play();
    if (p && p.then) p.then(function () { v.pause(); }).catch(function () {});
    $("pickSec").classList.add("hidden");
    $("playSec").classList.add("hidden");
    $("setupSec").classList.remove("hidden");
    $("progress").classList.add("hidden");
    $("startBtn").disabled = false;
    $("playVideo").pause();
    drawSel();
    var cached = getCache(fileSig);
    if (cached) {
      segments = cached.segments; engines = cached.engines || {};
      showPlayer(true);
      return;
    }
    v.onloadedmetadata = function () {
      var t = Math.min(v.duration * 0.3, 5);
      seek(v, t).then(function () { $("scrub").value = Math.round(t / v.duration * 1000); });
    };
  };

  $("scrub").oninput = function () {
    var v = $("setupVideo");
    if (!v.duration) return;
    v.currentTime = v.duration * $("scrub").value / 1000;
  };

  // ---------------------------------------------------- رسم المربع
  var stage = $("stage"), start = null;
  function pos(e) {
    var r = stage.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  stage.addEventListener("pointerdown", function (e) {
    if (running) return;
    start = pos(e);
    try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  stage.addEventListener("pointermove", function (e) {
    if (!start) return;
    var p = pos(e);
    var s = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    if (s.w > 0.02 && s.h > 0.015) { sel = s; drawSel(); }
    e.preventDefault();
  });
  function endDrag() { if (start) { start = null; save("gt_vsel", sel); } }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  function drawSel() {
    var s = $("sel");
    s.style.left = sel.x * 100 + "%"; s.style.top = sel.y * 100 + "%";
    s.style.width = sel.w * 100 + "%"; s.style.height = sel.h * 100 + "%";
  }

  // ---------------------------------------------------- أدوات الصورة
  function seek(v, t) {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (done) return; done = true; v.removeEventListener("seeked", fin); resolve(); }
      v.addEventListener("seeked", fin);
      setTimeout(fin, 3000);
      try { v.currentTime = t; } catch (e) { fin(); }
    });
  }

  var crop = document.createElement("canvas");
  var cctx = crop.getContext("2d", { willReadFrequently: true });
  function grab(v) {
    var W = v.videoWidth, H = v.videoHeight;
    var sx = sel.x * W, sy = sel.y * H, sw = Math.max(1, sel.w * W), sh = Math.max(1, sel.h * H);
    var scale = Math.min(1600 / sw, 3);
    crop.width = Math.max(1, Math.round(sw * scale));
    crop.height = Math.max(1, Math.round(sh * scale));
    cctx.drawImage(v, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return crop;
  }

  // صورة صغيرة للمقارنة: إذا ما تغيرت منطقة الترجمة ما نعيد القراءة
  function thumb(c) {
    var t = document.createElement("canvas");
    t.width = 160; t.height = Math.max(1, Math.round(c.height * 160 / c.width));
    var x = t.getContext("2d", { willReadFrequently: true });
    x.drawImage(c, 0, 0, t.width, t.height);
    var d = x.getImageData(0, 0, t.width, t.height).data, g = new Uint8Array(t.width * t.height);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 3 + d[j + 1] * 6 + d[j + 2]) / 10;
    return g;
  }
  function changed(a, b) {
    if (!a || !b || a.length !== b.length) return true;
    var n = 0;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 40) n++;
    return n > Math.max(3, a.length / 1500);
  }

  // تجهيز للقراءة: رمادي + تباين + قلب الألوان إذا الكلام فاتح على غامق
  function prepare(c) {
    var ctx = c.getContext("2d", { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, n = c.width * c.height;
    var g = new Uint8ClampedArray(n), hist = new Uint32Array(256), sum = 0;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      g[i] = (p[j] * 299 + p[j + 1] * 587 + p[j + 2] * 114) / 1000;
      hist[g[i]]++; sum += g[i];
    }
    var invert = (sum / n) < 115;
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
  // نسخة ثانية: نخلي بس البكسلات البيضاء (لون الترجمة) سوداء على خلفية بيضاء
  // تنفع للترجمة اللي بدون مربع خلفها، فوق صورة اللعبة مباشرة
  function whiteMask(src) {
    var c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    var d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, n = c.width * c.height;
    var hist = new Uint32Array(256), L = new Uint8Array(n), S = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var r = p[j], g = p[j + 1], bl = p[j + 2];
      L[i] = (r * 299 + g * 587 + bl * 114) / 1000; hist[L[i]]++;
      S[i] = Math.max(r, g, bl) - Math.min(r, g, bl);
    }
    var thr = Math.max(175, pct(hist, n, 0.995) - 55);
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var v = (L[i] >= thr && S[i] < 70) ? 0 : 255;
      p[j] = p[j + 1] = p[j + 2] = v; p[j + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }
  // نقرأ بالطريقتين ونختار النتيجة الأوضح
  function readFrame(w, c) {
    var a = whiteMask(c), b = prepare(c);
    var best = { text: "", score: -1, conf: 0 };
    function take(res) {
      var t = textFrom(res.data);
      var letters = (t.match(/[A-Za-z]/g) || []).length;
      var words = t.split(" ").filter(function (x) { return x.length > 1; }).length;
      var score = t ? res.data.confidence * Math.min(1, words / 3) + Math.min(letters, 60) * 0.1 : -1;
      if (score > best.score) best = { text: t, score: score, conf: res.data.confidence };
    }
    return w.recognize(a).then(take).then(function () { return w.recognize(b); }).then(take)
      .then(function () { return best; });
  }
  function pct(hist, n, q) { var t = n * q, a = 0; for (var i = 0; i < 256; i++) { a += hist[i]; if (a >= t) return i; } return 255; }

  function clean(t) {
    return String(t || "")
      .replace(/[|]/g, "I").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1").trim();
  }
  function textFrom(data) {
    var lines = (data && data.lines) || [], keep = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], txt = clean(L.text);
      var letters = (txt.match(/[A-Za-z]/g) || []).length;
      if (letters < 2) continue;
      if (L.confidence < 60) continue;                       // تشويش أو كلام مو واضح
      if (letters / Math.max(1, txt.replace(/\s/g, "").length) < 0.55) continue;
      keep.push(txt);
    }
    return clean(keep.join(" "));
  }
  function norm(t) { return String(t).toLowerCase().replace(/[^a-z]/g, ""); }
  // تشابه النصين (0 لـ 1)، عشان أخطاء القراءة البسيطة ما تقسم الجملة لجملتين
  function similar(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return a === b ? 1 : 0;
    if (a === b) return 1;
    var m = a.length, n = b.length, prev = new Array(n + 1), cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      var t = prev; prev = cur; cur = t;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  // ---------------------------------------------------- القراءة
  $("cancelBtn").onclick = function () { cancelled = true; };

  $("startBtn").onclick = function () {
    if (running) return;
    var v = $("setupVideo");
    if (!v.duration || !isFinite(v.duration)) { setStatus("الفيديو لسا ما تحمّل، انتظر ثانية وجرّب.", true); $("progress").classList.remove("hidden"); return; }
    run(v);
  };

  function setStatus(msg, isErr) { $("status").textContent = msg; $("status").className = "status" + (isErr ? " err" : ""); }
  function setBar(f) { $("barFill").style.width = Math.round(f * 100) + "%"; }

  function run(v) {
    running = true; cancelled = false;
    $("startBtn").disabled = true; $("otherBtn").disabled = true;
    $("progress").classList.remove("hidden");
    setBar(0); setStatus("جاري التجهيز...");
    save("gt_vsel", sel);
    var dur = v.duration, times = [];
    for (var t = 0; t < dur; t += STEP) times.push(t);
    var raw = [];                // [{t, text}]
    var lastThumb = null, lastRead = { text: "", conf: 0 };

    initOCR().then(function (w) {
      var i = 0;
      function next() {
        if (cancelled) throw new Error("cancel");
        if (i >= times.length) return Promise.resolve();
        var t = times[i++];
        return seek(v, t).then(function () {
          var c = grab(v), th = thumb(c);
          var p;
          if (!changed(th, lastThumb)) p = Promise.resolve(lastRead);
          else p = readFrame(w, c);
          return p.then(function (rd) {
            lastThumb = th; lastRead = rd;
            raw.push({ t: t, text: rd.text, conf: rd.conf });
            setBar(0.8 * i / times.length);
            setStatus("جاري قراءة الترجمة... " + fmt(t) + " / " + fmt(dur));
            return next();
          });
        });
      }
      return next();
    }).then(function () {
      segments = buildSegments(raw, dur);
      if (!segments.length) throw new Error("none");
      return translateAll(segments);
    }).then(function () {
      putCache();
      showPlayer(false);
    }).catch(function (e) {
      if (e && e.message === "cancel") { setStatus("انلغت."); setBar(0); }
      else if (e && e.message === "none") setStatus("ما لقيت كلام إنجليزي في المربع. تأكد إن المربع على مكان الترجمة بالضبط وجرّب مرة ثانية.", true);
      else { setStatus("صار خطأ. حدّث الصفحة وجرّب مرة ثانية.", true); if (window.console) console.error(e); }
    }).then(function () {
      running = false;
      $("startBtn").disabled = false; $("otherBtn").disabled = false;
    });
  }

  // نجمع القراءات المتتالية لنفس الجملة في مقطع واحد له بداية ونهاية
  function buildSegments(raw, dur) {
    var segs = [], cur = null;
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (cur && r.text && similar(r.text, cur.texts[cur.texts.length - 1]) >= 0.8) {
        cur.texts.push(r.text); cur.end = r.t + STEP; cur.conf = Math.max(cur.conf, r.conf);
        continue;
      }
      if (cur) segs.push(cur);
      cur = r.text ? { start: r.t, end: r.t + STEP, texts: [r.text], conf: r.conf } : null;
    }
    if (cur) segs.push(cur);
    // الجملة الحقيقية تبقى على الشاشة أكثر من لقطة وحدة؛ اللقطة الوحدة نقبلها بس إذا القراءة واضحة جدًا
    segs = segs.filter(function (s) { return s.texts.length >= 2 || s.conf >= 85; });
    return segs.map(function (s) {
      // نختار أكثر قراءة تكررت (الأدق غالبًا)، وإذا تعادلت الأطول
      var count = {}, best = s.texts[0];
      s.texts.forEach(function (t) { count[t] = (count[t] || 0) + 1; });
      Object.keys(count).forEach(function (t) {
        if (count[t] > count[best] || (count[t] === count[best] && t.length > best.length)) best = t;
      });
      return { start: Math.max(0, s.start - STEP / 2), end: Math.min(dur, s.end), en: best, ar: "" };
    });
  }

  // ---------------------------------------------------- الترجمة
  function translateAll(segs) {
    var i = 0, failed = 0, cache = {};
    engines = {};
    function next() {
      if (cancelled) return Promise.reject(new Error("cancel"));
      if (i >= segs.length) return Promise.resolve();
      var s = segs[i++];
      setStatus("جاري الترجمة... " + i + " من " + segs.length);
      setBar(0.8 + 0.2 * i / segs.length);
      var key = s.en.toLowerCase();
      var p = cache[key] ? Promise.resolve(cache[key]) : GT.translate(s.en);
      return p.then(function (r) { cache[key] = r; s.ar = r.text; engines[r.engineName] = 1; }, function () { failed++; s.ar = "⚠︎ " + s.en; })
        .then(next);
    }
    return next().then(function () {
      if (failed === segs.length) throw new Error("translate");
    });
  }
  // ---------------------------------------------------- المشغّل
  function showPlayer(fromCache) {
    $("cachedNote").classList.toggle("hidden", !fromCache);
    lastIdx = -2;
    $("pickSec").classList.add("hidden");
    $("setupSec").classList.add("hidden");
    $("playSec").classList.remove("hidden");
    var pv = $("playVideo");
    pv.src = fileUrl;
    pv.muted = false;
    pv.currentTime = 0;
    renderLines();
    setTimeout(function () { $("playSec").scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  }
  function renderLines() {
    var box = $("lines"); box.innerHTML = "";
    var used = Object.keys(engines);
    $("linesTitle").textContent = "كل الجمل (" + segments.length + ")" + (used.length ? " · ترجمة " + used.join(" و ") : "");
    segments.forEach(function (s, i) {
      var d = document.createElement("div"); d.className = "line"; d.id = "ln" + i;
      var tm = document.createElement("span"); tm.className = "tm"; tm.textContent = fmt(s.start);
      var ar = document.createElement("div"); ar.textContent = s.ar;
      var en = document.createElement("div"); en.className = "en"; en.textContent = s.en;
      d.appendChild(tm); d.appendChild(ar); d.appendChild(en);
      d.onclick = function () { var pv = $("playVideo"); pv.currentTime = s.start + 0.05; pv.play().catch(function () {}); };
      box.appendChild(d);
    });
  }
  var lastIdx = -2;
  function tick() {
    var pv = $("playVideo"), t = pv.currentTime, idx = -1;
    for (var i = 0; i < segments.length; i++) if (t >= segments[i].start && t < segments[i].end) { idx = i; break; }
    if (idx !== lastIdx) {
      $("subText").textContent = idx >= 0 ? segments[idx].ar : "";
      var old = document.querySelector(".line.now"); if (old) old.classList.remove("now");
      if (idx >= 0 && $("ln" + idx)) $("ln" + idx).classList.add("now");
      lastIdx = idx;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // عرض كبير (بدل ملء الشاشة حق الآيفون اللي يخفي الترجمة)
  $("bigBtn").onclick = function () { $("player").classList.add("big-mode"); };
  $("exitBig").onclick = function () { $("player").classList.remove("big-mode"); };
  $("minus").onclick = function () { subSize = Math.max(14, subSize - 2); applySub(); };
  $("plus").onclick = function () { subSize = Math.min(44, subSize + 2); applySub(); };
  function applySub() { document.documentElement.style.setProperty("--sub", subSize + "px"); save("gt_vsub", subSize); }

  // ---------------------------------------------------- الترجمة الاحترافية (Claude)
  $("rereadBtn").onclick = function () {
    $("playSec").classList.add("hidden");
    $("setupSec").classList.remove("hidden");
    $("progress").classList.add("hidden");
    var v = $("setupVideo");
    if (v.readyState >= 1) seek(v, Math.min(v.duration * 0.3, 5));
    else v.onloadedmetadata = function () { seek(v, Math.min(v.duration * 0.3, 5)); };
  };

  function fmt(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }
})();
