/* الترجمة: Microsoft أو Google (مجاني بدون مفتاح)، أو Claude / Gemini بمفتاحك الخاص.
   المفتاح ينحفظ في متصفح جوالك بس، وما ينرفع لأي مكان غير الشركة نفسها. */
(function () {
  "use strict";

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  var ENGINES = ["microsoft", "google", "claude", "gemini"];
  var NAMES = { microsoft: "Microsoft", google: "Google", mymemory: "MyMemory", claude: "Claude", gemini: "Gemini" };
  function getEngine() { var e = lsGet("gt_engine", "microsoft"); return ENGINES.indexOf(e) >= 0 ? e : "microsoft"; }
  function setEngine(v) { lsSet("gt_engine", v); }
  function getKey(engine) { return (lsGet("gt_key_" + engine, "") || "").trim(); }
  function isLLM(engine) { return engine === "claude" || engine === "gemini"; }
  function llmReady() { var e = getEngine(); return isLLM(e) && !!getKey(e); }

  function timedFetch(u, opts, asText, ms) {
    opts = opts || {};
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    if (ctl) opts.signal = ctl.signal;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(u, opts).then(function (r) {
      clearTimeout(t);
      if (!r.ok) {
        return r.text().then(function (body) {
          var err = new Error("http " + r.status); err.status = r.status; err.body = body.slice(0, 300); throw err;
        });
      }
      return asText ? r.text() : r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  // ------------------------------------------------ المجانية
  var msToken = null, msExpiry = 0;
  function getMsToken() {
    if (msToken && Date.now() < msExpiry) return Promise.resolve(msToken);
    return timedFetch("https://edge.microsoft.com/translate/auth", { method: "GET" }, true).then(function (tok) {
      tok = String(tok || "").trim();
      if (tok.length < 20) throw new Error("ms token");
      msToken = tok; msExpiry = Date.now() + 8 * 60 * 1000;
      return tok;
    });
  }
  function microsoft(text) {
    return getMsToken().then(function (tok) {
      return timedFetch("https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=ar", {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify([{ Text: text }])
      });
    }).then(function (j) {
      var out = j && j[0] && j[0].translations && j[0].translations[0] && j[0].translations[0].text;
      if (!out) throw new Error("ms empty");
      return out.trim();
    }).catch(function (e) { msToken = null; throw e; });
  }
  function google(text) {
    var u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=" + encodeURIComponent(text);
    return timedFetch(u).then(function (j) {
      var out = (j && j[0] || []).map(function (x) { return x && x[0] || ""; }).join("").trim();
      if (!out) throw new Error("google empty");
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
  var FREE = { microsoft: microsoft, google: google, mymemory: myMemory };

  // ------------------------------------------------ Claude / Gemini
  var PROMPT_HEAD = [
    "You are a professional Arabic subtitle and game translator for The Legend of Zelda: Breath of the Wild.",
    "The numbered English lines below were read from the game screen by OCR, in order, so they may contain OCR mistakes (wrong letters, merged or missing words, stray symbols).",
    "Read all lines first to understand the scene and who is speaking. Silently fix obvious OCR mistakes from context, but never invent text that is not there.",
    "Translate each line into fluent, natural, elegant Modern Standard Arabic, the way a professional game or film translator would: faithful in meaning, natural Arabic word order (not word-for-word), keeping the speaker's tone. Keep lines concise.",
    "Use these names and terms consistently:",
    "Link = لينك, Zelda = زيلدا, Princess Zelda = الأميرة زيلدا, Hyrule = هايرول, Calamity Ganon = الكارثة غانون, Ganon = غانون,",
    "Champion(s) = البطل / الأبطال, Divine Beast = الوحش الإلهي, Vah Ruta = فاه روتا, Vah Rudania = فاه رودانيا, Vah Medoh = فاه ميدوه, Vah Naboris = فاه نابوريس,",
    "Mipha = ميفا, Daruk = داروك, Revali = ريفالي, Urbosa = أوربوسا, King Rhoam = الملك روم, Impa = إمبا, Purah = بورا, Robbie = روبي, Kass = كاس, Hestu = هيستو,",
    "Sheikah = الشيكا, Sheikah Slate = لوح الشيكا, Guardian = الحارس, Shrine = الضريح, Korok = كوروك, Korok Seed = بذرة كوروك, Master Sword = سيف الماستر, Goddess Hylia = الإلهة هيليا,",
    "Mt. Lanayru = جبل لانايرو, Spring of Wisdom = نبع الحكمة, Spring of Power = نبع القوة, Spring of Courage = نبع الشجاعة, Spirit Orb = كرة روحية, Heart Container = حاوية القلب, Stamina Vessel = وعاء التحمّل,",
    "Hylian = هايلي, Gerudo = الجيرودو, Zora = الزورا, Goron = الغورون, Rito = الريتو, Rupee(s) = روبية / روبيات.",
    "Keep controller button names (A, B, X, Y, L, R, ZL, ZR, +, -) as they are.",
    "Return exactly one Arabic line for every input number, with the same numbers. If a line is pure OCR garbage, return an empty string for it.",
    'Return JSON only, no other text: {"lines":[{"n":1,"ar":"..."}]}',
    "",
    "Lines:"
  ].join("\n");

  function parseJSON(text) {
    text = String(text || "").trim();
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1];
    try { return JSON.parse(text); } catch (e) {}
    var a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error("bad json");
  }

  var CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];
  function askClaude(prompt, key, mi) {
    mi = mi || 0;
    return timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model: CLAUDE_MODELS[mi], max_tokens: 4096, messages: [{ role: "user", content: prompt }] })
    }, false, 90000).then(function (j) {
      return (j && j.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
    }, function (e) {
      // الموديل مو متوفر لحسابك؟ نجرب الثاني
      if ((e.status === 404 || (e.status === 400 && /model/i.test(e.body || ""))) && mi + 1 < CLAUDE_MODELS.length) return askClaude(prompt, key, mi + 1);
      throw e;
    });
  }

  var GEMINI_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  function askGemini(prompt, key, mi) {
    mi = mi || 0;
    return timedFetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODELS[mi] + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
      })
    }, false, 90000).then(function (j) {
      var parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
      return parts.map(function (p) { return p.text || ""; }).join("");
    }, function (e) {
      // الموديل مو موجود أو خلصت الحصة المجانية له؟ نجرب الأخف
      if ((e.status === 404 || e.status === 429) && mi + 1 < GEMINI_MODELS.length) return askGemini(prompt, key, mi + 1);
      throw e;
    });
  }

  function llmBatch(engine, lines) {
    var key = getKey(engine);
    if (!key) return Promise.reject(new Error("no key"));
    var prompt = PROMPT_HEAD + "\n" + lines.map(function (l, i) { return (i + 1) + "|" + String(l).replace(/[\r\n|]+/g, " "); }).join("\n");
    var ask = engine === "claude" ? askClaude : askGemini;
    return ask(prompt, key).then(function (text) {
      var data = parseJSON(text), out = new Array(lines.length);
      var arr = (data && Array.isArray(data.lines)) ? data.lines : (Array.isArray(data) ? data : []);
      arr.forEach(function (x) {
        var k = parseInt(x && x.n, 10) - 1;
        if (k >= 0 && k < lines.length && x.ar != null) out[k] = String(x.ar).replace(/\s+/g, " ").trim();
      });
      if (!out.some(function (x) { return x; })) throw new Error("empty");
      return out;
    });
  }

  function fixNames(en, ar) {
    if (/\bLink\b/.test(en)) ar = ar.replace(/(ال)?رابط/g, "لينك");
    return ar;
  }

  // ------------------------------------------------ الواجهة العامة
  var lastLLMError = null;

  // جملة وحدة -> {text, engine, engineName}
  function translate(en) {
    var engine = getEngine();
    if (isLLM(engine) && getKey(engine)) {
      return llmBatch(engine, [en]).then(function (out) {
        if (!out[0]) throw new Error("empty");
        lastLLMError = null;
        return { text: out[0], engine: engine, engineName: NAMES[engine] };
      }, function (e) { lastLLMError = e; return freeTranslate(en, "microsoft"); });
    }
    return freeTranslate(en, engine === "google" ? "google" : "microsoft");
  }
  function freeTranslate(en, first) {
    var order = [first, first === "google" ? "microsoft" : "google", "mymemory"], i = 0;
    function attempt() {
      if (i >= order.length) return Promise.reject(new Error("all failed"));
      var name = order[i++];
      return FREE[name](en).then(function (ar) {
        return { text: fixNames(en, ar), engine: name, engineName: NAMES[name] };
      }, attempt);
    }
    return attempt();
  }

  // كذا جملة مرة وحدة (لصفحة الفيديو). مع Claude/Gemini تنترجم كلها مع بعض عشان يفهم السياق.
  // يرجّع [{text, engineName}] بنفس الترتيب (العنصر null إذا فشل)
  function translateBatch(list, onProgress) {
    var engine = getEngine();
    function oneByOne(from) {
      var out = [], i = 0;
      function next() {
        if (i >= list.length) return Promise.resolve(out);
        var k = i++;
        if (onProgress) onProgress(k + 1, list.length);
        return freeTranslate(list[k], from).then(function (r) { out[k] = r; }, function () { out[k] = null; }).then(next);
      }
      return next();
    }
    if (!(isLLM(engine) && getKey(engine))) return oneByOne(engine === "google" ? "google" : "microsoft");
    var size = 50, chunks = [], results = new Array(list.length);
    for (var s = 0; s < list.length; s += size) chunks.push(s);
    var c = 0;
    function nextChunk() {
      if (c >= chunks.length) return Promise.resolve(results);
      var start = chunks[c++], part = list.slice(start, start + size);
      if (onProgress) onProgress(Math.min(start + size, list.length), list.length);
      return llmBatch(engine, part).then(function (out) {
        lastLLMError = null;
        out.forEach(function (ar, j) { if (ar) results[start + j] = { text: ar, engineName: NAMES[engine] }; });
      }, function (e) { lastLLMError = e; }).then(function () {
        // اللي ما انترجم نكمله بالمجاني
        var missing = [];
        for (var j = 0; j < part.length; j++) if (!results[start + j]) missing.push(start + j);
        var m = 0;
        function fill() {
          if (m >= missing.length) return Promise.resolve();
          var k = missing[m++];
          return freeTranslate(list[k], "microsoft").then(function (r) { results[k] = r; }, function () {}).then(fill);
        }
        return fill();
      }).then(nextChunk);
    }
    return nextChunk();
  }

  function describeError(e) {
    if (!e) return "";
    if (e.message === "no key") return "ما حطيت المفتاح.";
    var body = String(e.body || ""), msg = "";
    try { var j = JSON.parse(body); msg = (j.error && (j.error.message || j.error.status)) || ""; } catch (x) {}
    var t = (msg || body).toLowerCase();
    var tail = msg ? " — " + msg.slice(0, 140) : "";
    if (e.status === 402 || /credit|billing|balance|quota|payment/.test(t)) return "ما فيه رصيد في الحساب، اشحن من صفحة Billing." + tail;
    if (e.status === 401 || /api.?key|x-api-key|authentication|permission/.test(t)) return "المفتاح غلط أو منتهي." + tail;
    if (e.status === 403) return "المفتاح ما عنده صلاحية." + tail;
    if (e.status === 429) return "وصلت الحد المسموح، انتظر شوي." + tail;
    if (e.status === 529 || e.status === 503) return "الخدمة مزدحمة الحين، جرّب بعد شوي.";
    if (e.name === "AbortError") return "الرد تأخر.";
    if (e.message === "bad json" || e.message === "empty") return "الرد وصل بس ما انقرى، جرّب مرة ثانية.";
    if (!e.status) return "ما قدر يتصل بالخدمة (ممكن الإنترنت أو المتصفح منعها).";
    return "ما ضبط الاتصال (" + e.status + ")" + tail;
  }
  function getLastError() { return lastLLMError ? describeError(lastLLMError) : ""; }

  // ------------------------------------------------ اختيار المترجم + المفتاح
  var KEY_HELP = {
    claude: { url: "https://platform.claude.com/settings/keys", label: "طلّع مفتاح Claude", note: "Claude API مدفوع (رصيد بسيط يكفي شهور للترجمة)." },
    gemini: { url: "https://aistudio.google.com/apikey", label: "طلّع مفتاح Gemini مجاني", note: "مجاني بحساب Google، بس له حد يومي." }
  };
  function mountPicker(el) {
    if (!el) return;
    var wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:100%";
    var sel = document.createElement("select");
    sel.style.cssText = "background:#182027;color:#f2f5f7;border:1px solid #26313a;border-radius:10px;padding:7px 10px;font:inherit;font-size:15px";
    [["microsoft", "Microsoft (مجاني)"], ["google", "Google (مجاني)"], ["claude", "Claude (احترافي)"], ["gemini", "Gemini (قريب من Claude)"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = getEngine();
    var keyBox = document.createElement("div");
    keyBox.style.cssText = "width:100%;background:#182027;border:1px solid #26313a;border-radius:12px;padding:10px;display:none";
    var inp = document.createElement("input");
    inp.type = "password"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.style.cssText = "width:100%;box-sizing:border-box;direction:ltr;background:#0f1316;color:#f2f5f7;border:1px solid #26313a;border-radius:8px;padding:9px;font-size:14px";
    var row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;margin-top:8px";
    var saveBtn = document.createElement("button"); saveBtn.type = "button"; saveBtn.textContent = "احفظ المفتاح";
    saveBtn.style.cssText = "flex:1;padding:9px;border-radius:10px;border:0;background:#3fbf8f;color:#06281b;font:inherit;font-weight:700";
    var link = document.createElement("a"); link.target = "_blank"; link.rel = "noopener";
    link.style.cssText = "flex:1;text-align:center;padding:9px;border-radius:10px;border:1px solid #26313a;color:#3fbf8f;text-decoration:none;font-size:14px";
    var note = document.createElement("div"); note.style.cssText = "color:#8d9aa5;font-size:12.5px;margin-top:8px;line-height:1.6";
    row.appendChild(saveBtn); row.appendChild(link);
    keyBox.appendChild(inp); keyBox.appendChild(row); keyBox.appendChild(note);

    function refresh() {
      var e = sel.value;
      if (!isLLM(e)) { keyBox.style.display = "none"; return; }
      keyBox.style.display = "block";
      var h = KEY_HELP[e], has = !!getKey(e);
      inp.value = ""; inp.placeholder = has ? "✓ المفتاح محفوظ (اكتب مفتاح جديد لتغييره)" : (e === "claude" ? "الصق مفتاح Claude هنا (sk-ant-...)" : "الصق مفتاح Gemini هنا (AIza...)");
      link.href = h.url; link.textContent = h.label;
      note.textContent = h.note + " المفتاح ينحفظ في هالجوال بس. وإذا ما اشتغل، الترجمة ترجع لـ Microsoft تلقائيًا.";
    }
    sel.onchange = function () { setEngine(sel.value); refresh(); };
    saveBtn.onclick = function () {
      var v = inp.value.trim();
      if (!v) { if (getKey(sel.value)) { lsSet("gt_key_" + sel.value, ""); } refresh(); inp.placeholder = "انمسح المفتاح"; return; }
      lsSet("gt_key_" + sel.value, v); refresh(); inp.placeholder = "✓ انحفظ المفتاح";
    };
    wrap.appendChild(sel); wrap.appendChild(keyBox);
    el.appendChild(wrap);
    refresh();
  }

  window.GT = { translate: translate, translateBatch: translateBatch, mountPicker: mountPicker, getEngine: getEngine, llmReady: llmReady, getLastError: getLastError };
})();
