/* الحسابات والمكتبة (نسخة تجريبية): كل شي محفوظ في هالجهاز.
   الحسابات في localStorage، والترجمات في IndexedDB (تتحمل كمية أكبر). */
(function () {
  "use strict";

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ------------------------------------------------ الحسابات
  var Profiles = {
    list: function () { return lsGet("gt_profiles", []); },
    current: function () {
      var id = lsGet("gt_current", null), list = Profiles.list();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    create: function (name) {
      name = String(name || "").trim().slice(0, 40);
      if (!name) return null;
      var list = Profiles.list();
      var p = { id: uid(), name: name, created: Date.now(), game: "Zelda: Breath of the Wild" };
      list.push(p); lsSet("gt_profiles", list); lsSet("gt_current", p.id);
      return p;
    },
    use: function (id) { lsSet("gt_current", id); },
    logout: function () { try { localStorage.removeItem("gt_current"); } catch (e) {} },
    update: function (fields) {
      var cur = Profiles.current(); if (!cur) return null;
      var list = Profiles.list().map(function (p) {
        if (p.id !== cur.id) return p;
        Object.keys(fields).forEach(function (k) { p[k] = fields[k]; });
        cur = p; return p;
      });
      lsSet("gt_profiles", list);
      return cur;
    },
    remove: function (id) {
      lsSet("gt_profiles", Profiles.list().filter(function (p) { return p.id !== id; }));
      if (lsGet("gt_current", null) === id) Profiles.logout();
      return Library.clearProfile(id);
    }
  };

  // ------------------------------------------------ قاعدة البيانات
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("no idb"));
      var req = indexedDB.open("game-translator", 1);
      req.onupgradeneeded = function () {
        var s = req.result.createObjectStore("items", { keyPath: "id" });
        s.createIndex("profile", "profile", { unique: false });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction("items", mode), s = t.objectStore("items"), out;
        out = fn(s);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  var Library = {
    // item: {type:'photo'|'video', en, ar, engine, thumb, title, lines, sig, game}
    add: function (item) {
      var p = Profiles.current();
      if (!p) return Promise.resolve(null);
      var rec = Object.assign({ id: uid(), profile: p.id, created: Date.now(), fav: false, game: p.game || "" }, item);
      return (rec.sig ? Library.findBySig(rec.sig) : Promise.resolve(null)).then(function (old) {
        if (old) { rec.id = old.id; rec.fav = old.fav; rec.created = old.created; rec.updated = Date.now(); }
        return tx("readwrite", function (s) { s.put(rec); }).then(function () { changed(); return rec; });
      }).catch(function () { return null; });
    },
    all: function () {
      var p = Profiles.current();
      if (!p) return Promise.resolve([]);
      return tx("readonly", function (s) { return s.index("profile").getAll(p.id); }).then(function (list) {
        return (list || []).sort(function (a, b) { return (b.updated || b.created) - (a.updated || a.created); });
      }).catch(function () { return []; });
    },
    findBySig: function (sig) {
      return Library.all().then(function (list) {
        for (var i = 0; i < list.length; i++) if (list[i].sig === sig) return list[i];
        return null;
      });
    },
    update: function (id, fields) {
      return tx("readwrite", function (s) {
        var r = s.get(id);
        r.onsuccess = function () { if (r.result) { Object.assign(r.result, fields); s.put(r.result); } };
      }).then(changed);
    },
    remove: function (id) { return tx("readwrite", function (s) { s.delete(id); }).then(changed); },
    clearProfile: function (pid) {
      return tx("readwrite", function (s) {
        var r = s.index("profile").openCursor(IDBKeyRange.only(pid));
        r.onsuccess = function () { var c = r.result; if (c) { c.delete(); c.continue(); } };
      }).then(changed).catch(function () {});
    },
    exportJSON: function () {
      var p = Profiles.current();
      return Library.all().then(function (items) {
        return JSON.stringify({ app: "game-translator", version: 1, exported: new Date().toISOString(), profile: p && { name: p.name, game: p.game }, items: items });
      });
    },
    importJSON: function (text) {
      var data = JSON.parse(text), p = Profiles.current();
      if (!data || !Array.isArray(data.items) || !p) throw new Error("bad file");
      var key = function (x) { return (x.created || 0) + "|" + x.type + "|" + (x.sig || x.en || x.title || ""); };
      return Library.all().then(function (existing) {
        var have = {}; existing.forEach(function (x) { have[key(x)] = 1; });
        var add = data.items.filter(function (x) { return x && x.type && !have[key(x)]; });
        // كل ترجمة مستوردة تاخذ رقم جديد عشان ما تمسح ترجمات حساب ثاني في نفس الجهاز
        return tx("readwrite", function (s) { add.forEach(function (x) { var r = Object.assign({}, x, { id: uid(), profile: p.id }); s.put(r); }); })
          .then(function () { changed(); return add.length; });
      });
    },
    onChange: function (f) { listeners.push(f); }
  };

  // صورة صغيرة للمكتبة (تكفي للتعرف على المشهد)
  function thumbFrom(source, sw, sh, crop) {
    try {
      var c = document.createElement("canvas"), maxW = 320;
      var cw = crop ? crop.w : sw, ch = crop ? crop.h : sh;
      var k = Math.min(1, maxW / cw);
      c.width = Math.max(1, Math.round(cw * k)); c.height = Math.max(1, Math.round(ch * k));
      c.getContext("2d").drawImage(source, crop ? crop.x : 0, crop ? crop.y : 0, cw, ch, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.6);
    } catch (e) { return ""; }
  }

  window.GTStore = { Profiles: Profiles, Library: Library, thumbFrom: thumbFrom };
})();
