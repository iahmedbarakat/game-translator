/* الترجمة: Microsoft أو Google، وإذا واحد ما اشتغل ينتقل للثاني تلقائيًا */
(function () {
  "use strict";

  function getEngine() { try { return localStorage.getItem("gt_engine") || "microsoft"; } catch (e) { return "microsoft"; } }
  function setEngine(v) { try { localStorage.setItem("gt_engine", v); } catch (e) {} }

  function timedFetch(u, opts, asText) {
    opts = opts || {};
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    if (ctl) opts.signal = ctl.signal;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(u, opts).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error("http " + r.status);
      return asText ? r.text() : r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }

  // Microsoft (نفس الترجمة اللي يستخدمها متصفح Edge)
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

  var NAMES = { microsoft: "Microsoft", google: "Google", mymemory: "MyMemory" };
  var FN = { microsoft: microsoft, google: google, mymemory: myMemory };

  // يرجّع {text, engine}: engine هو المترجم اللي اشتغل فعلًا
  function translate(en) {
    var first = getEngine() === "google" ? "google" : "microsoft";
    var order = [first, first === "google" ? "microsoft" : "google", "mymemory"];
    var i = 0;
    function attempt() {
      if (i >= order.length) return Promise.reject(new Error("all failed"));
      var name = order[i++];
      return FN[name](en).then(function (ar) {
        // أسماء زيلدا: المترجمات أحيانًا تترجم Link إلى "رابط"
        if (/\bLink\b/.test(en)) ar = ar.replace(/(ال)?رابط/g, "لينك");
        return { text: ar, engine: name, engineName: NAMES[name] };
      }, attempt);
    }
    return attempt();
  }

  // قائمة اختيار المترجم: تنحط في أي عنصر فيه data-engine-picker
  function mountPicker(el) {
    if (!el) return;
    var sel = document.createElement("select");
    sel.style.cssText = "background:#182027;color:#f2f5f7;border:1px solid #26313a;border-radius:10px;padding:7px 10px;font:inherit;font-size:15px";
    [["microsoft", "Microsoft"], ["google", "Google"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = getEngine() === "google" ? "google" : "microsoft";
    sel.onchange = function () { setEngine(sel.value); };
    el.appendChild(sel);
  }

  window.GT = { translate: translate, mountPicker: mountPicker, getEngine: getEngine };
})();
