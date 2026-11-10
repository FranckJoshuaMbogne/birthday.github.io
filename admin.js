/* Little bird — admin editor.
   Opens with the birthday code, edits the encrypted content, and publishes
   straight to the GitHub repo with a personal access token (kept only on this device). */
(function () {
  "use strict";
  var LB = window.LB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CFG_KEY = "littlebird.admin.github";
  var S = { key: null, vault: null, content: null, photos: {}, saved: {}, pending: {}, urls: {}, deleted: {}, videos: {}, savedV: {}, pendingV: {}, vurls: {}, dirty: false, tab: "home", token: "" };
  var PAGES = [["home", "Home"], ["story", "Our Story"], ["memories", "Memories"], ["notes", "Little Notes"], ["wishes", "Wishes"]];

  /* ---------- small DOM helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v); else if (k === "style") el.style.cssText = v; else el.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function toast(msg, bad, ms) {
    var t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = "toast" + (bad ? " bad" : ""); }, ms || 3200);
  }
  function dirty() {
    S.dirty = true; $("#status").textContent = "Unpublished changes"; $("#status").className = "status dirty";
    $("#saveBtn").disabled = false; $("#savebar").classList.add("show");
  }
  function clean() {
    S.dirty = false; $("#status").textContent = "All changes published"; $("#status").className = "status";
    $("#saveBtn").disabled = true; $("#savebar").classList.remove("show");
  }
  addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- GitHub settings ---------- */
  function guessRepo() {
    var host = location.hostname, m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: "", repo: "" };
    var seg = location.pathname.split("/").filter(Boolean)[0];
    if (seg && /\.html$/i.test(seg)) seg = "";
    return { owner: m[1], repo: seg || (m[1] + ".github.io") };
  }
  function loadCfg() {
    var c = {}; try { c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) {}
    var g = guessRepo();
    S.gh = { owner: c.owner || g.owner, repo: c.repo || g.repo, branch: c.branch || "main", remember: c.token ? true : (c.remember !== false) };
    S.token = c.token || "";
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ owner: S.gh.owner, repo: S.gh.repo, branch: S.gh.branch, remember: S.gh.remember, token: S.gh.remember ? S.token : undefined })); } catch (e) {}
  }
  function ghReady() { return !!(S.token && S.gh.owner && S.gh.repo); }
  function gh(path, opts) {
    opts = opts || {};
    var headers = { Authorization: "Bearer " + S.token, Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com/repos/" + encodeURIComponent(S.gh.owner) + "/" + encodeURIComponent(S.gh.repo) + path,
      { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { var m = t; try { m = JSON.parse(t).message; } catch (e) {} var err = new Error(r.status + " " + m); err.status = r.status; throw err; });
        return opts.raw ? r.arrayBuffer() : r.json();
      });
  }
  // newest copy of a file: straight from the repo when a token is set (Pages can lag a minute), else from the site
  function fetchFile(path) {
    var fromSite = function () { return fetch(path + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status); return r.arrayBuffer(); }); };
    if (!ghReady()) return fromSite();
    return gh("/contents/" + path + "?ref=" + encodeURIComponent(S.gh.branch), { raw: true }).catch(fromSite);
  }

  /* ---------- login ---------- */
  loadCfg();
  $("#pinIn").focus();
  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pin = $("#pinIn").value.trim(), err = $("#loginErr");
    if (!/^\d{8}$/.test(pin)) { err.textContent = "The code has 8 digits (DDMMYYYY)."; return; }
    err.textContent = "Opening…";
    fetchFile("vault.json").then(function (buf) {
      S.vault = JSON.parse(new TextDecoder().decode(buf));
      return LB.derive(pin, S.vault, ["encrypt", "decrypt"]);
    }).then(function (key) {
      S.key = key; return LB.decJSON(key, S.vault.iv, S.vault.ct);
    }).then(function (data) {
      S.content = data.content; S.photos = data.photos || {}; S.videos = data.videos || {}; S.savedV = JSON.parse(JSON.stringify(S.videos));
      S.saved = JSON.parse(JSON.stringify(S.photos));
      $("#login").style.display = "none"; $("#admin").style.display = "block";
      buildTabs(); show("home");
      if (!ghReady()) toast("Add your GitHub token in Settings before publishing.", false, 5000);
    }).catch(function (e2) {
      console.error(e2);
      err.textContent = S.vault ? "That code doesn’t open it." : "Couldn’t load the site data.";
    });
  });

  /* ---------- photos ---------- */
  function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function photoURL(id) {
    if (S.urls[id]) return S.urls[id];
    var meta = S.photos[id];
    S.urls[id] = !meta ? Promise.reject(new Error("missing")) :
      fetchFile("photos/" + id + ".bin").then(function (b) { return LB.decBytes(S.key, meta.iv, b); })
        .then(function (u) { return URL.createObjectURL(new Blob([u], { type: "image/jpeg" })); });
    S.urls[id].catch(function () { delete S.urls[id]; });
    return S.urls[id];
  }
  function processFile(file) {
    var load = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(imgEl) : imgEl();
    function imgEl() {
      return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error("This file isn’t an image the browser can open. Try a JPG or PNG.")); }; i.src = URL.createObjectURL(file); });
    }
    return load.then(function (img) {
      var w = img.width || img.naturalWidth, hgt = img.height || img.naturalHeight, max = 1800, s = Math.min(1, max / Math.max(w, hgt));
      var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(hgt * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, "image/jpeg", .84); });
    }).then(function (blob) { return addPhotoBlob(blob, file.name || "photo"); });
  }
  function addPhotoBlob(blob, name) {
    return blob.arrayBuffer().then(function (ab) {
      var id = newId();
      S.pending[id] = new Uint8Array(ab);
      S.photos[id] = { name: String(name).replace(/\.[^.]+$/, "").slice(0, 40), added: Date.now() };
      S.urls[id] = Promise.resolve(URL.createObjectURL(blob));
      dirty();
      return id;
    });
  }

  /* ---------- videos ---------- */
  var MAX_MB = 50, WARN_MB = 20;
  function mb(n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + " MB"; }
  function pickVideo() {
    return new Promise(function (resolve) {
      var inp = $("#videoIn"); inp.value = "";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return resolve(null);
        if (f.size > MAX_MB * 1048576) { toast("That video is " + mb(f.size) + ". Please keep videos under " + MAX_MB + " MB (trim or compress it first).", true, 7000); return resolve(null); }
        toast("Adding video…");
        f.arrayBuffer().then(function (ab) {
          var id = newId();
          S.pendingV[id] = new Uint8Array(ab);
          S.videos[id] = { name: f.name.replace(/\.[^.]+$/, "").slice(0, 40), size: f.size, mime: f.type || "video/mp4", added: Date.now() };
          S.vurls[id] = Promise.resolve(URL.createObjectURL(f));
          dirty();
          if (f.size > WARN_MB * 1048576) toast("Added. It’s " + mb(f.size) + ", so it may take a while to open on her phone.", false, 6000);
          resolve(id);
        }, function () { toast("Couldn’t read that video.", true); resolve(null); });
      };
      inp.click();
    });
  }
  function videoURL(id) {
    if (S.vurls[id]) return S.vurls[id];
    var meta = S.videos[id];
    S.vurls[id] = !meta ? Promise.reject(new Error("missing")) :
      fetchFile("videos/" + id + ".bin").then(function (b) { return LB.decBytes(S.key, meta.iv, b); })
        .then(function (u) { return URL.createObjectURL(new Blob([u], { type: meta.mime || "video/mp4" })); });
    S.vurls[id].catch(function () { delete S.vurls[id]; });
    return S.vurls[id];
  }
  // grab a frame from the video to use as its cover photo
  function coverFromVideo(id) {
    return videoURL(id).then(function (url) {
      return new Promise(function (res, rej) {
        var v = document.createElement("video"), done = false;
        var fail = function () { if (!done) { done = true; rej(new Error("frame")); } };
        var t = setTimeout(fail, 15000);
        v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.src = url;
        v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) * 0.15); };
        v.onseeked = function () {
          if (done) return; clearTimeout(t);
          var w = v.videoWidth, hh = v.videoHeight; if (!w || !hh) return fail();
          var sc = Math.min(1, 1800 / Math.max(w, hh)), c = document.createElement("canvas");
          c.width = Math.round(w * sc); c.height = Math.round(hh * sc);
          try { c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); } catch (e) { return fail(); }
          c.toBlob(function (b) { if (!b) return fail(); done = true; res(addPhotoBlob(b, (S.videos[id].name || "video") + " cover")); }, "image/jpeg", .86);
        };
        v.onerror = fail; v.load();
      });
    });
  }
  function videoField(it, o) {
    o = o || {};
    var box = h("div", { class: "vf" });
    function setCover() {
      toast("Taking a frame from the video…");
      return coverFromVideo(it.video.id).then(function (pid) { it.photo = { id: pid, x: 50, y: 45, z: 1 }; dirty(); if (o.onchange) o.onchange(); },
        function () { toast("This browser can’t read frames from that video. Choose a cover photo instead.", true, 6000); });
    }
    function add() {
      pickVideo().then(function (id) {
        if (!id) return;
        it.video = { id: id }; dirty();
        if (!(it.photo && it.photo.id) || o.autoCover) setCover().then(function () { draw(); if (o.onchange) o.onchange(); });
        else { draw(); if (o.onchange) o.onchange(); }
      });
    }
    function draw() {
      box.innerHTML = "";
      var v = it.video && it.video.id && S.videos[it.video.id];
      box.appendChild(h("span", { class: "vlabel", text: "VIDEO" }));
      if (v) {
        var prev = h("div", { class: "vprev" });
        var play = h("button", { class: "btn small line", type: "button", text: "▶ Preview", onclick: function () {
          play.textContent = "Loading…";
          videoURL(it.video.id).then(function (u) { prev.innerHTML = ""; prev.appendChild(h("video", { src: u, controls: true, playsinline: true, autoplay: true })); play.remove(); },
            function () { play.textContent = "Couldn’t load"; });
        } });
        box.appendChild(h("div", { class: "vinfo", text: "🎬 " + (v.name || "Video") + (v.size ? " · " + mb(v.size) : "") + (S.pendingV[it.video.id] ? " · new" : "") }));
        if (/quicktime/.test(v.mime || "")) box.appendChild(h("p", { class: "vwarn", text: "This is an iPhone .MOV — it plays on iPhones and Macs, but may not play on some Android phones or Windows. An MP4 works everywhere." }));
        box.appendChild(prev);
        box.appendChild(h("div", { class: "row" }, [play,
          h("button", { class: "btn small line", type: "button", text: "Cover from video", title: "Use a frame of the video as the cover photo", onclick: function () { setCover(); } }),
          h("button", { class: "btn small line", type: "button", text: "Replace", onclick: add }),
          h("button", { class: "btn small danger", type: "button", text: "Remove video", onclick: function () { it.video = null; dirty(); draw(); if (o.onchange) o.onchange(); } })
        ]));
        box.appendChild(h("p", { class: "tip", text: "The photo above is the cover. She taps it to play the video." }));
      } else {
        box.appendChild(h("div", { class: "row" }, [h("button", { class: "btn small line", type: "button", text: "🎬 Add a video", onclick: add })]));
        box.appendChild(h("p", { class: "tip", text: "Optional. The photo becomes the cover with a play button. MP4 under " + WARN_MB + " MB is best." }));
      }
    }
    draw();
    return box;
  }
  function pickFiles(multiple) {
    return new Promise(function (resolve) {
      var inp = $("#fileIn"); inp.multiple = !!multiple; inp.value = "";
      inp.onchange = function () {
        var files = Array.prototype.slice.call(inp.files || []); if (!files.length) return resolve([]);
        toast(files.length > 1 ? "Preparing " + files.length + " photos…" : "Preparing photo…");
        files.reduce(function (p, f) { return p.then(function (ids) { return processFile(f).then(function (id) { ids.push(id); return ids; }, function (e) { toast(e.message, true, 5000); return ids; }); }); }, Promise.resolve([]))
          .then(resolve);
      };
      inp.click();
    });
  }
  // every place a photo is used
  function photoRefs() {
    var refs = [], c = S.content;
    if (c.home && c.home.heroPhoto) refs.push({ where: "Home background", obj: c.home, key: "heroPhoto" });
    (c.story.moments || []).forEach(function (m, i) { if (m.photo) refs.push({ where: "Our Story " + (i + 1), obj: m, key: "photo" }); });
    (c.memories.items || []).forEach(function (m, i) { if (m.photo) refs.push({ where: "Memory " + (i + 1), obj: m, key: "photo" }); });
    return refs;
  }
  function videoRefs() {
    var out = [];
    (S.content.story.moments || []).forEach(function (m) { if (m.video && m.video.id && m.photo && m.photo.id) out.push(m); });
    (S.content.memories.items || []).forEach(function (m) { if (m.video && m.video.id) out.push(m); });
    return out.map(function (m) { return { video: m.video }; });
  }
  function usage(id) { return photoRefs().filter(function (r) { return r.obj[r.key] && r.obj[r.key].id === id; }); }

  /* photo field: drag on the preview to choose what stays in view, slider to zoom */
  function photoField(obj, key, opts) {
    opts = opts || {};
    var wrap = h("div", { class: "pf" });
    function draw() {
      wrap.innerHTML = "";
      var p = obj[key];
      var frame = h("div", { class: "frame", style: "aspect-ratio:" + (opts.aspect || "1/1") });
      if (p && p.id) {
        var img = h("img", { alt: "" }), dot = h("i", { class: "dot" });
        var apply = function () {
          img.style.objectPosition = p.x + "% " + p.y + "%"; img.style.transform = "scale(" + p.z + ")"; img.style.transformOrigin = p.x + "% " + p.y + "%";
          dot.style.left = p.x + "%"; dot.style.top = p.y + "%";
        };
        apply();
        photoURL(p.id).then(function (u) { img.src = u; }).catch(function () { frame.appendChild(h("div", { class: "empty", text: "Photo not found — choose another" })); });
        frame.appendChild(img); frame.appendChild(dot);
        var dragging = false;
        var move = function (e) {
          var r = frame.getBoundingClientRect();
          p.x = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)));
          p.y = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)));
          apply(); dirty();
        };
        // mouse: drag; touch: tap (so the page can still scroll over the photo)
        var start = null;
        frame.addEventListener("pointerdown", function (e) {
          if (e.pointerType === "mouse") { dragging = true; frame.setPointerCapture(e.pointerId); move(e); }
          else start = { x: e.clientX, y: e.clientY };
        });
        frame.addEventListener("pointermove", function (e) { if (dragging) move(e); });
        frame.addEventListener("pointerup", function (e) {
          if (dragging) { dragging = false; return; }
          if (start && Math.abs(e.clientX - start.x) < 10 && Math.abs(e.clientY - start.y) < 10) move(e);
          start = null;
        });
        frame.addEventListener("pointercancel", function () { start = null; dragging = false; });
        wrap.appendChild(frame);
        var z = h("input", { type: "range", min: "1", max: "3", step: "0.05", value: String(p.z || 1), "aria-label": "Zoom" });
        z.addEventListener("input", function () { p.z = +z.value; apply(); dirty(); });
        wrap.appendChild(h("div", { class: "zoom" }, ["Zoom", z]));
        wrap.appendChild(h("div", { class: "tip", text: "Tap or drag on the photo to choose the part that stays in view." }));
      } else {
        frame.appendChild(h("div", { class: "empty", text: opts.emptyText || "No photo" }));
        frame.style.cursor = "default"; wrap.appendChild(frame);
      }
      var row = h("div", { class: "row" }, [
        h("button", { class: "btn small", type: "button", text: p && p.id ? "Change photo" : "Choose photo", onclick: function () {
          openPicker(p && p.id, function (id) { obj[key] = { id: id, x: 50, y: 40, z: 1 }; dirty(); draw(); if (opts.onchange) opts.onchange(); });
        } }),
        opts.allowNone && p && p.id ? h("button", { class: "btn small line", type: "button", text: opts.noneText || "Remove photo", onclick: function () { obj[key] = null; dirty(); draw(); if (opts.onchange) opts.onchange(); } }) : null
      ]);
      wrap.appendChild(row);
    }
    draw();
    return wrap;
  }

  function openPicker(current, done) {
    var sheet = $("#sheet"), modal = $("#modal");
    function close() { modal.classList.remove("show"); }
    function draw() {
      sheet.innerHTML = "";
      sheet.appendChild(h("div", { class: "sheet-head" }, [
        h("h3", { text: "Choose a photo" }),
        h("button", { class: "btn small", type: "button", text: "⬆ Upload new", onclick: function () {
          pickFiles(false).then(function (ids) { if (ids.length) { close(); done(ids[0]); } });
        } }),
        h("button", { class: "icon", type: "button", text: "×", "aria-label": "Close", onclick: close })
      ]));
      var grid = h("div", { class: "pick" });
      Object.keys(S.photos).sort(function (a, b) { return (S.photos[b].added || 0) - (S.photos[a].added || 0); }).forEach(function (id) {
        var b = h("button", { type: "button", class: id === current ? "on" : "", title: S.photos[id].name || id, onclick: function () { close(); done(id); } });
        photoURL(id).then(function (u) { b.style.backgroundImage = "url(" + u + ")"; }).catch(function () {});
        grid.appendChild(b);
      });
      if (!Object.keys(S.photos).length) grid.appendChild(h("p", { text: "No photos yet — upload one." }));
      sheet.appendChild(grid);
    }
    draw(); modal.classList.add("show");
    modal.onclick = function (e) { if (e.target === modal) close(); };
  }

  /* ---------- form helpers ---------- */
  function field(obj, key, label, o) {
    o = o || {};
    var input;
    if (o.options) {
      input = h("select", {}, o.options.map(function (op) { return h("option", { value: op[0], text: op[1] }); }));
      input.value = obj[key] == null ? "" : obj[key];
    } else if (o.multi) {
      input = h("textarea", { rows: o.rows || 3, placeholder: o.placeholder || "" }); input.value = obj[key] == null ? "" : obj[key];
    } else {
      input = h("input", { type: o.type || "text", placeholder: o.placeholder || "", min: o.min, max: o.max }); input.value = obj[key] == null ? "" : obj[key];
    }
    input.addEventListener(o.options ? "change" : "input", function () {
      obj[key] = o.type === "number" ? (input.value === "" ? 0 : +input.value) : input.value;
      if (!o.nodirty) dirty(); if (o.onchange) o.onchange();
    });
    return h("label", { class: "f" + (o.full ? " full" : "") }, [h("span", { text: label }), input]);
  }
  function panel(title, kids, help) {
    return h("div", { class: "panel" }, [h("h3", { text: title }), help ? h("p", { class: "help", text: help }) : null].concat(kids));
  }
  function grid(kids) { return h("div", { class: "grid" }, kids); }
  function quoteFields(sec) {
    sec.quote = sec.quote || { text: "", by: "" };
    return panel("QUOTE ON THIS PAGE", [grid([field(sec.quote, "text", "Quote", { multi: true, full: true }), field(sec.quote, "by", "Author")])]);
  }
  function titleFields(sec) {
    return grid([field(sec, "eyebrow", "Small label above the title"), field(sec, "titleA", "Title (plain part)"), field(sec, "titleB", "Title (pink script part)"), field(sec, "intro", "Line under the title", { full: true })]);
  }
  /* list editor with move up/down and delete */
  function listEditor(arr, o) {
    var box = h("div");
    function draw() {
      box.innerHTML = "";
      arr.forEach(function (item, i) {
        var head = h("div", { class: "item-head" }, [
          h("b", { text: o.label(item, i) }),
          h("button", { class: "icon", type: "button", title: "Move up", text: "↑", disabled: i === 0, onclick: function () { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); dirty(); draw(); } }),
          h("button", { class: "icon", type: "button", title: "Move down", text: "↓", disabled: i === arr.length - 1, onclick: function () { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); dirty(); draw(); } }),
          h("button", { class: "icon del", type: "button", title: "Delete", text: "✕", onclick: function () {
            if (confirm("Delete " + o.label(item, i) + "?")) { arr.splice(i, 1); dirty(); draw(); }
          } })
        ]);
        var body = o.render(item, i, draw);
        var el = h("div", { class: "item" + (o.noImage ? " noimg" : "") });
        if (o.noImage) { el.appendChild(h("div", {}, [head].concat(body))); }
        else { el.appendChild(body[0]); el.appendChild(h("div", {}, [head].concat(body.slice(1)))); }
        box.appendChild(el);
      });
      box.appendChild(h("button", { class: "add", type: "button", text: "+ " + o.addText, onclick: function () {
        var make = function (extra) { arr.push(o.make(extra)); dirty(); draw(); var last = box.querySelectorAll(".item"); last = last[last.length - 1]; if (last) last.scrollIntoView({ behavior: "smooth", block: "center" }); };
        if (o.uploadOnAdd) pickFiles(true).then(function (ids) { ids.forEach(function (id) { arr.push(o.make(id)); }); if (ids.length) { dirty(); draw(); } });
        else make();
      } }));
      (o.extra || []).forEach(function (x) {
        box.appendChild(h("button", { class: "add", type: "button", style: "margin-top:10px", text: "+ " + x.text, onclick: function () { x.run(arr, draw); } }));
      });
    }
    draw();
    return box;
  }

  /* ---------- tabs ---------- */
  var TABS = [["home", "Home"], ["story", "Our Story"], ["memories", "Memories"], ["notes", "Little Notes"], ["wishes", "Wishes"], ["photos", "Photos"], ["general", "Menu & footer"], ["settings", "Settings"]];
  function buildTabs() {
    var t = $("#tabs"); t.innerHTML = "";
    TABS.forEach(function (tb) { t.appendChild(h("button", { type: "button", "data-t": tb[0], text: tb[1], onclick: function () { show(tb[0]); } })); });
    $("#saveBtn").onclick = publish; $("#savebarBtn").onclick = publish;
  }
  function show(tab) {
    S.tab = tab;
    Array.prototype.forEach.call($("#tabs").children, function (b) { b.classList.toggle("on", b.getAttribute("data-t") === tab); });
    var m = $("#main"); m.innerHTML = ""; (VIEWS[tab])(m); scrollTo(0, 0);
  }
  var VIEWS = {
    home: function (m) {
      var c = S.content.home;
      m.appendChild(h("h2", { class: "sec", text: "Home" }));
      m.appendChild(h("p", { class: "help", text: "The first page she sees after the code." }));
      m.appendChild(panel("BACKGROUND PHOTO", [photoField(c, "heroPhoto", { aspect: "4/5" })], "Her photo behind the name. Keep her face near the dot."));
      m.appendChild(panel("TEXT", [grid([
        field(c, "eyebrow", "Small label"), field(c, "name", "Name (big script)"),
        field(c, "subtitle", "Line under the name", { full: true }), field(c, "lede", "Paragraph", { multi: true, full: true }),
        field(c, "button1", "Pink button (opens Memories)"), field(c, "button2", "Outline button (opens the letter)"),
        field(c, "tag", "Little tag on the photo (leave empty to hide)", { full: true })
      ])]));
      m.appendChild(panel("MEMORIES PREVIEW", [grid([field(c, "memoriesTitleA", "Title (plain)"), field(c, "memoriesTitleB", "Title (script)"), field(c, "memoriesIntro", "Line next to the title", { full: true }),
        field(c, "memoriesCount", "How many memories to show here", { type: "number", min: 0, max: 12 })])], "Shows the first memories from the Memories tab — reorder them there."));
      m.appendChild(quoteFields(c));
      c.cards = c.cards || [];
      m.appendChild(panel("PAGE CARDS AT THE BOTTOM", [listEditor(c.cards, {
        noImage: true, addText: "Add card", label: function (it, i) { return "CARD " + (i + 1); },
        make: function () { return { page: "story", title: "New card", text: "" }; },
        render: function (it) { return [grid([field(it, "page", "Opens page", { options: PAGES }), field(it, "title", "Title"), field(it, "text", "Text", { full: true })])]; }
      })]));
    },
    story: function (m) {
      var c = S.content.story;
      m.appendChild(h("h2", { class: "sec", text: "Our Story" }));
      m.appendChild(h("p", { class: "help", text: "Each moment is a blossom on the branch. Add, edit, reorder or remove them." }));
      m.appendChild(panel("PAGE TITLE", [titleFields(c)]));
      c.moments = c.moments || [];
      m.appendChild(h("h3", { class: "sec", style: "font-size:22px;margin:24px 0 12px", text: "Moments" }));
      m.appendChild(listEditor(c.moments, {
        addText: "Add a moment", label: function (it, i) { return "MOMENT " + (i + 1); },
        make: function () { return { label: "NEW CHAPTER", title: "A new moment", text: "", photo: null, artText: "♥", artStyle: "rose" }; },
        render: function (it, i, redraw) {
          var side = h("div", {}, [photoField(it, "photo", { aspect: "4/3", allowNone: true, noneText: "Use text card instead", emptyText: "No photo — shows a pink card with the text below", onchange: redraw }),
            videoField(it, { onchange: redraw })]);
          var fields = [grid([
            field(it, "label", "Small label (e.g. NAVRATRI NIGHTS)"), field(it, "title", "Title"),
            field(it, "text", "Story text", { multi: true, rows: 4, full: true }),
            !(it.photo && it.photo.id) ? field(it, "artText", "Text on the pink card (e.g. a date)") : null,
            !(it.photo && it.photo.id) ? field(it, "artStyle", "Card colour", { options: [["rose", "Rose"], ["wine", "Deep wine"]] }) : null,
            field(it, "button", "Button to Memories (optional)", { full: true, placeholder: "Leave empty for no button" })
          ].filter(Boolean))];
          return [side].concat(fields);
        }
      }));
      m.appendChild(h("div", { style: "height:18px" }));
      m.appendChild(quoteFields(c));
    },
    memories: function (m) {
      var c = S.content.memories;
      m.appendChild(h("h2", { class: "sec", text: "Memories" }));
      m.appendChild(h("p", { class: "help", text: "The polaroid wall. The first few also show on Home. “Add memories” lets you pick several photos at once." }));
      m.appendChild(panel("PAGE TITLE", [titleFields(c)]));
      c.items = c.items || [];
      m.appendChild(h("h3", { class: "sec", style: "font-size:22px;margin:24px 0 12px", text: "Polaroids" }));
      m.appendChild(listEditor(c.items, {
        addText: "Add memories (upload photos)", uploadOnAdd: true,
        label: function (it, i) { return "MEMORY " + (i + 1) + (i < (+S.content.home.memoriesCount || 0) ? " · ON HOME" : ""); },
        make: function (id) { return { caption: "A new memory", sub: "", photo: { id: id, x: 50, y: 40, z: 1 } }; },
        extra: [{ text: "Add a video memory", run: function (arr, redraw) {
          pickVideo().then(function (vid) {
            if (!vid) return;
            var it = { caption: "A new memory", sub: "", photo: null, video: { id: vid } };
            arr.push(it); dirty(); redraw();
            toast("Taking a cover from the video…");
            coverFromVideo(vid).then(function (pid) { it.photo = { id: pid, x: 50, y: 45, z: 1 }; dirty(); redraw(); },
              function () { toast("Couldn’t take a cover from this video — choose a cover photo for it.", true, 6000); });
          });
        } }],
        render: function (it, i, redraw) {
          return [h("div", {}, [photoField(it, "photo", { aspect: "1/1", emptyText: "Choose a cover photo" }), videoField(it, { onchange: redraw })]),
            grid([field(it, "caption", "Caption (handwritten)"), field(it, "sub", "Small line under it")])];
        }
      }));
      m.appendChild(h("div", { style: "height:18px" }));
      m.appendChild(quoteFields(c));
    },
    notes: function (m) {
      var c = S.content.notes; c.letter = c.letter || {};
      m.appendChild(h("h2", { class: "sec", text: "Little Notes" }));
      m.appendChild(panel("PAGE TITLE", [titleFields(c)]));
      c.reasons = c.reasons || [];
      m.appendChild(panel("ENVELOPES", [listEditor(c.reasons, {
        noImage: true, addText: "Add an envelope", label: function (it, i) { return "ENVELOPE " + (i + 1); },
        make: function () { return { front: "Reason no. " + (c.reasons.length + 1), title: "", text: "" }; },
        render: function (it) { return [grid([field(it, "front", "On the envelope"), field(it, "title", "Inside: title"), field(it, "text", "Inside: text", { multi: true, full: true })])]; }
      })]));
      m.appendChild(panel("THE LETTER", [grid([
        field(c.letter, "eyebrow", "Small label"), field(c.letter, "greeting", "Greeting"),
        field(c.letter, "body", "Letter (leave an empty line between paragraphs)", { multi: true, rows: 12, full: true }),
        field(c.letter, "closing", "Closing"), field(c.letter, "signature", "Signature")
      ])]));
      m.appendChild(quoteFields(c));
    },
    wishes: function (m) {
      var c = S.content.wishes; c.list = c.list || [];
      m.appendChild(h("h2", { class: "sec", text: "Wishes" }));
      m.appendChild(panel("PAGE TITLE", [titleFields(c)]));
      m.appendChild(panel("CAKE & MESSAGE", [grid([
        field(c, "button", "Candle button"), field(c, "buttonDone", "Button after blowing"),
        field(c, "heading", "Big message", { full: true }), field(c, "message", "Line under it", { full: true }), field(c, "back", "Back button")
      ])]));
      var listBox = h("div");
      (function drawList() {
        listBox.innerHTML = "";
        c.list.forEach(function (w, i) {
          var inp = h("input", { type: "text" }); inp.value = w;
          inp.addEventListener("input", function () { c.list[i] = inp.value; dirty(); });
          listBox.appendChild(h("div", { class: "item-head" }, [h("label", { class: "f", style: "flex:1" }, [inp]),
            h("button", { class: "icon del", type: "button", text: "✕", onclick: function () { c.list.splice(i, 1); dirty(); drawList(); } })]));
        });
        listBox.appendChild(h("button", { class: "add", type: "button", text: "+ Add a wish", onclick: function () { c.list.push(""); dirty(); drawList(); } }));
      })();
      m.appendChild(panel("WISHES LIST", [listBox]));
      m.appendChild(quoteFields(c));
    },
    photos: function (m) {
      m.appendChild(h("h2", { class: "sec", text: "All photos" }));
      m.appendChild(h("p", { class: "help", text: "“Replace” swaps a photo everywhere it’s used. Delete only works for photos that aren’t used anywhere." }));
      m.appendChild(h("div", { style: "margin-bottom:16px" }, [h("button", { class: "btn", type: "button", text: "⬆ Upload photos", onclick: function () { pickFiles(true).then(function () { show("photos"); }); } })]));
      var lib = h("div", { class: "lib" });
      Object.keys(S.photos).sort(function (a, b) { return (S.photos[b].added || 0) - (S.photos[a].added || 0); }).forEach(function (id) {
        var used = usage(id), th = h("div", { class: "th" }, [h("span", { class: "badge" + (S.pending[id] ? " new" : ""), text: S.pending[id] ? "New" : (used.length ? "Used " + used.length + "×" : "Not used") })]);
        photoURL(id).then(function (u) { th.style.backgroundImage = "url(" + u + ")"; }).catch(function () {});
        lib.appendChild(h("figure", { title: used.map(function (r) { return r.where; }).join(", ") }, [th, h("figcaption", {}, [
          h("button", { class: "btn small line", type: "button", text: "Replace", onclick: function () {
            pickFiles(false).then(function (ids) {
              if (!ids.length) return;
              used.forEach(function (r) { r.obj[r.key].id = ids[0]; });
              removePhoto(id); show("photos"); toast("Photo replaced everywhere it was used.");
            });
          } }),
          h("button", { class: "btn small danger", type: "button", text: "Delete", disabled: used.length > 0, onclick: function () {
            if (confirm("Delete this photo?")) { removePhoto(id); show("photos"); }
          } })
        ])]));
      });
      m.appendChild(lib);
    },
    general: function (m) {
      var s = S.content.site, n = S.content.nav;
      m.appendChild(h("h2", { class: "sec", text: "Menu & footer" }));
      m.appendChild(panel("TOP OF THE SITE", [grid([field(s, "logo", "Logo letter"), field(s, "logoNote", "Note next to the logo")])]));
      m.appendChild(panel("MENU NAMES", [grid(PAGES.map(function (p) { return field(n, p[0], p[1] + " page"); }))]));
      m.appendChild(panel("FOOTER", [grid([field(s, "footer", "Footer text"), field(s, "footerName", "Name in script"), field(s, "footerDate", "Date")])]));
    },
    settings: function (m) {
      m.appendChild(h("h2", { class: "sec", text: "Settings" }));
      m.appendChild(h("p", { class: "help", text: "Publishing writes your changes to the GitHub repo. The site updates about a minute later." }));
      var tok = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" }); tok.value = S.token;
      tok.addEventListener("input", function () { S.token = tok.value.trim(); saveCfg(); });
      var rem = h("input", { type: "checkbox" }); rem.checked = S.gh.remember;
      rem.addEventListener("change", function () { S.gh.remember = rem.checked; saveCfg(); });
      var repoFields = grid([field(S.gh, "owner", "GitHub username", { onchange: saveCfg, nodirty: true }), field(S.gh, "repo", "Repository name", { onchange: saveCfg, nodirty: true }), field(S.gh, "branch", "Branch", { onchange: saveCfg, nodirty: true })]);
      var result = h("p", { class: "help", style: "margin:10px 0 0" });
      m.appendChild(panel("GITHUB CONNECTION", [
        h("label", { class: "f", style: "margin-bottom:12px" }, [h("span", { text: "Personal access token" }), tok]),
        h("label", { style: "display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px" }, [rem, "Remember on this device (only use on your own phone or laptop)"]),
        repoFields,
        h("div", { style: "margin-top:14px" }, [h("button", { class: "btn line small", type: "button", text: "Test connection", onclick: function () {
          result.textContent = "Checking…";
          gh("").then(function (r) { result.textContent = r.permissions && r.permissions.push ? "✓ Connected to " + r.full_name + " — ready to publish." : "Connected, but this token can’t write to the repo."; })
            .catch(function (e) { result.textContent = "✗ " + e.message; });
        } })]), result
      ]));
      m.appendChild(panel("HOW TO GET A TOKEN (ONE TIME)", [h("ol", { class: "steps", html:
        "<li>On GitHub open <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and click <b>Generate new token</b>.</li>" +
        "<li>Name it <code>little bird admin</code> and pick an expiration.</li>" +
        "<li>Repository access: <b>Only select repositories</b> → choose <code>" + (S.gh.repo || "your site repo") + "</code>.</li>" +
        "<li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else is needed.</li>" +
        "<li>Generate, copy the token and paste it above.</li>" })]));
      m.appendChild(panel("THE CODE", [h("p", { class: "help", style: "margin:0", text: "The site and this editor open with the same 8-digit code. Everything in the repo stays encrypted with it." })]));
    }
  };
  function removePhoto(id) {
    if (S.pending[id]) delete S.pending[id]; else if (S.saved[id]) S.deleted[id] = true;
    delete S.photos[id]; dirty();
  }

  /* ---------- publish ---------- */
  var publishing = false;
  function publish() {
    if (publishing) return;
    if (!ghReady()) { show("settings"); toast("Add your GitHub token first.", true, 4000); return; }
    var noCover = (S.content.memories.items || []).map(function (m, i) { return !(m.photo && m.photo.id) ? i + 1 : 0; }).filter(Boolean);
    if (noCover.length) { show("memories"); toast("Memory " + noCover[0] + " needs a cover photo.", true, 5000); return; }
    var missing = photoRefs().filter(function (r) { return r.obj[r.key] && r.obj[r.key].id && !S.photos[r.obj[r.key].id]; });
    if (missing.length) { toast("A photo is missing in: " + missing[0].where, true, 5000); return; }
    publishing = true;
    var btns = [$("#saveBtn"), $("#savebarBtn")]; btns.forEach(function (b) { b.disabled = true; b.textContent = "Publishing…"; });
    var branch = encodeURIComponent(S.gh.branch), base, tree = [];
    var newIds = Object.keys(S.pending), manifest = JSON.parse(JSON.stringify(S.photos));
    var manifestV = {};
    videoRefs().forEach(function (r) { var id = r.video.id; if (S.videos[id]) manifestV[id] = JSON.parse(JSON.stringify(S.videos[id])); });
    var newV = Object.keys(manifestV).filter(function (id) { return S.pendingV[id]; });
    var dropV = Object.keys(S.savedV).filter(function (id) { return !manifestV[id]; });
    gh("/git/ref/heads/" + branch).then(function (ref) {
      base = ref.object.sha; return gh("/git/commits/" + base);
    }).then(function (commit) {
      var baseTree = commit.tree.sha;
      return newIds.reduce(function (p, id) {
        return p.then(function () {
          return LB.encBytes(S.key, S.pending[id]).then(function (r) {
            manifest[id].iv = r.iv;
            return gh("/git/blobs", { method: "POST", body: { content: LB.toB64(r.ct), encoding: "base64" } });
          }).then(function (blob) { tree.push({ path: "photos/" + id + ".bin", mode: "100644", type: "blob", sha: blob.sha }); });
        });
      }, Promise.resolve()).then(function () {
        return newV.reduce(function (p, id, n) {
          return p.then(function () {
            toast("Uploading video " + (n + 1) + " of " + newV.length + "…", false, 60000);
            return LB.encBytes(S.key, S.pendingV[id]).then(function (r) {
              manifestV[id].iv = r.iv;
              return gh("/git/blobs", { method: "POST", body: { content: LB.toB64(r.ct), encoding: "base64" } });
            }).then(function (blob) { tree.push({ path: "videos/" + id + ".bin", mode: "100644", type: "blob", sha: blob.sha }); });
          });
        }, Promise.resolve());
      }).then(function () {
        dropV.forEach(function (id) { tree.push({ path: "videos/" + id + ".bin", mode: "100644", type: "blob", sha: null }); });
        Object.keys(S.deleted).forEach(function (id) { tree.push({ path: "photos/" + id + ".bin", mode: "100644", type: "blob", sha: null }); });
        return LB.encJSON(S.key, { content: S.content, photos: manifest, videos: manifestV });
      }).then(function (enc) {
        var vault = { v: 2, iter: S.vault.iter, salt: S.vault.salt, iv: enc.iv, ct: enc.ct };
        tree.push({ path: "vault.json", mode: "100644", type: "blob", content: JSON.stringify(vault) });
        return gh("/git/trees", { method: "POST", body: { base_tree: baseTree, tree: tree } }).then(function (t) {
          return gh("/git/commits", { method: "POST", body: { message: "Update birthday site from admin", tree: t.sha, parents: [base] } });
        }).then(function (c) { return gh("/git/refs/heads/" + branch, { method: "PATCH", body: { sha: c.sha } }); })
          .then(function () { S.vault = vault; });
      });
    }).then(function () {
      S.photos = manifest; S.saved = JSON.parse(JSON.stringify(manifest)); S.pending = {}; S.deleted = {};
      S.videos = manifestV; S.savedV = JSON.parse(JSON.stringify(manifestV)); S.pendingV = {};
      clean(); toast("Published ♥ The site updates in about a minute.", false, 5000);
      if (S.tab === "photos") show("photos");
    }).catch(function (e) {
      console.error(e);
      var msg = e.status === 401 ? "GitHub didn’t accept the token. Check it in Settings." :
                e.status === 403 || e.status === 404 ? "The token can’t write to " + S.gh.owner + "/" + S.gh.repo + ". Check the repo name and the token’s Contents permission." :
                e.status === 422 || e.status === 409 ? "The repo changed meanwhile. Reload the editor and try again." : "Publishing failed: " + e.message;
      toast(msg, true, 7000);
    }).then(function () {
      publishing = false; btns.forEach(function (b) { b.textContent = b.id === "saveBtn" ? "Publish" : "Publish now"; b.disabled = !S.dirty; });
    });
  }
})();
