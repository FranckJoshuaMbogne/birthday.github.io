/* For my little bird — site logic.
   vault.json + photos/*.bin are encrypted; they open only with the right code.
   Pages are drawn from the decrypted content (edited in admin.html). */
(function () {
  "use strict";
  var LB = window.LB, KEY_STORE = "littlebird.key";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function store(val) { try { if (val === undefined) return localStorage.getItem(KEY_STORE); if (val === null) localStorage.removeItem(KEY_STORE); else localStorage.setItem(KEY_STORE, val); } catch (e) { return null; } }
  var vaultP = fetch("vault.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("vault"); return r.json(); });

  /* ---------- sky: floating hearts, petals, birds ---------- */
  var sky = $("#sky"), ctx = sky.getContext("2d"), parts = [], W, H;
  function size() { var d = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; sky.width = W * d; sky.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  size(); addEventListener("resize", size);
  var COLORS = ["#D96C80", "#F2B8B5", "#C9A25E", "#F9DDD6", "#8E3B55"];
  function heart(c, s) { c.beginPath(); c.moveTo(0, s * .3); c.bezierCurveTo(0, 0, -s * .5, 0, -s * .5, s * .3); c.bezierCurveTo(-s * .5, s * .6, 0, s * .8, 0, s); c.bezierCurveTo(0, s * .8, s * .5, s * .6, s * .5, s * .3); c.bezierCurveTo(s * .5, 0, 0, 0, 0, s * .3); c.fill(); }
  function bird(c, s) { c.beginPath(); c.ellipse(0, 0, s * .55, s * .45, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(s * .5, -s * .12); c.lineTo(s * .8, 0); c.lineTo(s * .5, s * .1); c.fill(); c.beginPath(); c.moveTo(-s * .5, 0); c.lineTo(-s * .85, -s * .25); c.lineTo(-s * .75, s * .15); c.fill(); }
  function ambient() { parts.push({ x: Math.random() * W, y: H + 20, vx: (Math.random() - .5) * .3, vy: -(.25 + Math.random() * .45), s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .01, a: .25 + Math.random() * .3, c: COLORS[(Math.random() * 3) | 0], t: Math.random() < .7 ? "h" : "p", life: 1e9 }); }
  function burst(x, y, n, birds) {
    for (var i = 0; i < n; i++) {
      var g = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
      parts.push({ x: x, y: y, vx: Math.cos(g) * sp, vy: Math.sin(g) * sp - 3, s: 10 + Math.random() * 16, r: Math.random() * 6, vr: (Math.random() - .5) * .1, a: 1, c: COLORS[(Math.random() * COLORS.length) | 0], t: birds && Math.random() < .35 ? "b" : (Math.random() < .75 ? "h" : "p"), life: 160 + Math.random() * 80, g: .06 });
    }
  }
  var tick = 0;
  (function loop() {
    ctx.clearRect(0, 0, W, H); tick++;
    if (!reduce && tick % 50 === 0 && parts.length < 40) ambient();
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx + (p.g ? 0 : Math.sin((tick + i * 40) / 60) * .25); p.y += p.vy; if (p.g) { p.vy += p.g; p.vx *= .99; }
      p.r += p.vr; p.life--;
      if (p.y < -40 || p.y > H + 60 || p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = p.life < 60 ? p.a * p.life / 60 : p.a; ctx.fillStyle = p.c; ctx.translate(p.x, p.y);
      if (p.t === "b") { ctx.scale(p.vx < 0 ? -1 : 1, 1); bird(ctx, p.s * 1.4); }
      else { ctx.rotate(Math.sin(p.r) * .5); if (p.t === "h") heart(ctx, p.s); else { ctx.beginPath(); ctx.ellipse(0, 0, p.s * .5, p.s * .28, p.r, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
    requestAnimationFrame(loop);
  })();

  /* ---------- lock ---------- */
  var code = "", busy = false, cells = $$("#pin b"), msg = $("#lockMsg");
  function paint() { cells.forEach(function (c, i) { c.className = i < code.length ? "f" : (i === code.length ? "c" : ""); }); }
  paint();
  function press(k) {
    if (busy) return;
    if (k === "back") code = code.slice(0, -1); else if (k === "clear") code = ""; else if (code.length < 8) code += k;
    msg.innerHTML = "&nbsp;"; paint();
    if (code.length === 8) tryCode(code);
  }
  $("#pad").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) press(b.getAttribute("data-k")); });
  addEventListener("keydown", function (e) {
    if (!document.body.classList.contains("locked")) return;
    if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("back"); else if (e.key === "Escape") press("clear");
  });
  function tryCode(pin) {
    busy = true; msg.textContent = "Checking…";
    vaultP.then(function (v) { return LB.derive(pin, v).then(function (key) { return LB.decJSON(key, v.iv, v.ct).then(function (d) { return { key: key, data: d }; }); }); })
      .then(function (res) { LB.exportRaw(res.key).then(store); msg.textContent = "Welcome, little bird ♥"; openSite(res.key, res.data, true); })
      .catch(function () {
        busy = false; code = ""; msg.textContent = "Not quite, little bird — try again.";
        var pin = $("#pin"); pin.classList.remove("bad"); void pin.offsetWidth; pin.classList.add("bad");
        setTimeout(function () { pin.classList.remove("bad"); paint(); }, 600);
      });
  }
  var saved = store();
  if (saved) {
    vaultP.then(function (v) { return LB.importRaw(saved).then(function (k) { return LB.decJSON(k, v.iv, v.ct).then(function (d) { openSite(k, d, false); }); }); })
      .catch(function () { store(null); });
  }

  /* ---------- rendering ---------- */
  var KEY, PHOTOS, VIDEOS, urlCache = {}, videoCache = {};
  var PLAY = '<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>';
  function hasVideo(m) { return m && m.video && m.video.id && VIDEOS[m.video.id]; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ph(p, cls, extra) {
    extra = extra || "";
    if (!p || !p.id) return '<span class="ph ' + (cls || "") + '">' + extra + "</span>";
    var x = +p.x || 50, y = +p.y || 50, z = Math.max(1, +p.z || 1);
    return '<span class="ph ' + (cls || "") + '"><img alt="" data-photo="' + esc(p.id) + '" style="object-position:' + x + '% ' + y + '%;transform:scale(' + z + ');transform-origin:' + x + '% ' + y + '%">' + extra + "</span>";
  }
  function quote(q, feather) {
    if (!q || !q.text) return "";
    return '<blockquote class="quote rv">' + (feather ? '<svg class="feather" width="40" height="30" viewBox="0 0 40 30" aria-hidden="true"><path d="M4 26 C 14 18, 26 6, 36 4 C 34 14, 22 24, 4 26 Z" fill="#F2B8B5"/><path d="M4 26 L 30 8" stroke="#D96C80" stroke-width="1.5"/></svg>' : "") +
      "<p>" + esc(q.text) + "</p>" + (q.by ? "<cite>" + esc(q.by) + "</cite>" : "") + "</blockquote>";
  }
  function phead(s) {
    return '<div class="phead"><div class="eyebrow rv">' + esc(s.eyebrow) + '</div><h1 class="rv d1">' + esc(s.titleA) + " <em>" + esc(s.titleB) + '</em></h1><p class="rv d2">' + esc(s.intro) + "</p></div>";
  }
  var TILTS = [-4, 3, -2, 5, -5, 4, -3, 2, 6, -1];
  var LIFTS = [0, 22, 8, 12, -6, 20, 4, 14, 0, 18];
  function pol(m, i, d) {
    var v = hasVideo(m);
    return '<figure class="pol rv d' + (d % 4) + (v ? " has-video" : "") + '"' + (v ? ' data-video="' + esc(m.video.id) + '"' : "") + ' style="--r:' + TILTS[i % 10] + "deg;--y:" + LIFTS[i % 10] + 'px"><i class="tape"></i>' + ph(m.photo, "", v ? PLAY : "") +
      "<figcaption>" + esc(m.caption) + (m.sub ? "<small>" + esc(m.sub) + "</small>" : "") + "</figcaption></figure>";
  }
  var BIRD_HERO = '<svg class="hero-bird" width="190" height="150" viewBox="0 0 190 150" aria-hidden="true"><path class="trail" d="M10 120 C 40 90, 60 110, 80 80" stroke="#C9A25E" stroke-width="2" stroke-dasharray="5 7" fill="none"/><g transform="translate(110 70)"><path d="M-48 4 L-80 -12 L-72 6 L-84 16 Z" fill="#8E3B55"/><ellipse rx="52" ry="44" fill="#D96C80"/><ellipse cx="10" cy="17" rx="32" ry="24" fill="#FFF1EA"/><path class="wing" d="M-30 -8 C -10 -60, 30 -50, 20 -10 Z" fill="#8E3B55"/><circle cx="28" cy="-14" r="5" fill="#3A1C2A"/><circle cx="30" cy="-16" r="1.6" fill="#fff"/><path d="M48 -14 L64 -9 L48 -4 Z" fill="#C9A25E"/></g><path class="beat" d="M182 40 c0-8-10-10-13-3c-3-7-13-5-13 3c0 9 13 15 13 18c0-3 13-9 13-18z" fill="#D96C80"/></svg>';
  var CAKE = '<svg class="cake" id="cake" viewBox="0 0 300 300" aria-hidden="true"><ellipse cx="150" cy="268" rx="130" ry="16" fill="#5A2A3E" opacity=".1"/><ellipse cx="150" cy="258" rx="122" ry="18" fill="#fff" stroke="#F3D3CC" stroke-width="2"/><rect x="50" y="170" width="200" height="86" rx="14" fill="#F2B8B5"/><path d="M50 186 q25 22 50 0 q25 22 50 0 q25 22 50 0 q25 22 50 0 V170 H50Z" fill="#FFF7F1"/><rect x="78" y="112" width="144" height="62" rx="12" fill="#D96C80"/><path d="M78 124 q18 16 36 0 q18 16 36 0 q18 16 36 0 q18 16 36 0 V112 H78Z" fill="#FFF7F1"/><g fill="#C9A25E"><circle cx="80" cy="222" r="4"/><circle cx="120" cy="230" r="4"/><circle cx="160" cy="222" r="4"/><circle cx="200" cy="230" r="4"/><circle cx="230" cy="220" r="4"/></g><g fill="#FFF7F1"><circle cx="105" cy="150" r="3.5"/><circle cx="140" cy="156" r="3.5"/><circle cx="175" cy="150" r="3.5"/><circle cx="205" cy="156" r="3.5"/></g><rect x="143" y="60" width="14" height="54" rx="4" fill="#FFF7F1" stroke="#F2B8B5" stroke-width="2"/><path d="M143 74 l14 -8 M143 88 l14 -8 M143 102 l14 -8" stroke="#F2B8B5" stroke-width="3"/><g id="flame"><ellipse cx="150" cy="44" rx="10" ry="18" fill="#FFC56B"/><ellipse cx="150" cy="48" rx="5" ry="10" fill="#FFF3C4"/></g><g id="smoke" opacity="0"><path d="M150 50 c-8 -12 8 -18 0 -30 c-8 -12 8 -18 0 -28" stroke="#bba" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg>';

  function render(c) {
    var s = c.site || {}, n = c.nav || {}, h = c.home || {}, st = c.story || {}, me = c.memories || {}, no = c.notes || {}, wi = c.wishes || {};
    var items = me.items || [];
    var out = [];
    out.push('<header class="nav" id="nav"><a class="logo" href="#/home">' + esc(s.logo) + "<small>" + esc(s.logoNote) + "</small></a>" +
      '<nav class="links" id="links">' + ["home", "story", "memories", "notes", "wishes"].map(function (r) { return '<a href="#/' + r + '" data-r="' + r + '">' + esc(n[r]) + "</a>"; }).join("") + "</nav>" +
      '<button class="music" id="music" type="button" aria-label="Play music">♪</button><button class="burger" id="burger" type="button" aria-label="Menu" aria-expanded="false"><i></i><i></i></button></header>');

    // HOME
    out.push('<section class="page" data-page="home"><div class="hero">' + ph(h.heroPhoto, "hero-bg") + '<div class="hero-fade"></div>' + BIRD_HERO +
      '<div class="hero-text"><div class="eyebrow rv">' + esc(h.eyebrow) + '</div><h1 class="script name">' + esc(h.name) + '</h1><p class="sub rv d2">' + esc(h.subtitle) +
      '</p><p class="lede rv d3">' + esc(h.lede) + '</p><div class="btns rv d4"><a class="btn" href="#/memories">' + esc(h.button1) + '</a><a class="btn line" href="#/notes">' + esc(h.button2) + "</a></div></div>" +
      (h.tag ? '<div class="tag rv d5">' + esc(h.tag) + "</div>" : "") + "</div>" + quote(h.quote, true));
    var homeItems = items.slice(0, Math.max(0, +h.memoriesCount || 4));
    if (homeItems.length) out.push('<div class="wrap"><div class="head rv"><h2>' + esc(h.memoriesTitleA) + " <em>" + esc(h.memoriesTitleB) + "</em></h2><p>" + esc(h.memoriesIntro) + '</p></div><div class="pols">' + homeItems.map(function (m, i) { return pol(m, i, i); }).join("") + "</div></div>");
    out.push('<div class="wrap cards">' + (h.cards || []).map(function (cd, i) { return '<a class="pc rv d' + (i % 4) + (i === (h.cards.length - 1) ? " dark" : "") + '" href="#/' + esc(cd.page) + '"><span>0' + (i + 1) + "</span><h3>" + esc(cd.title) + "</h3><p>" + esc(cd.text) + "</p></a>"; }).join("") + "</div></section>");

    // STORY
    out.push('<section class="page" data-page="story">' + phead(st) + '<div class="timeline"><div class="branch" aria-hidden="true"></div>' +
      (st.moments || []).map(function (m) {
        var v = hasVideo(m);
        var art = m.photo && m.photo.id ? '<div class="m-art' + (v ? " has-video" : "") + '"' + (v ? ' data-video="' + esc(m.video.id) + '" data-cap="' + esc(m.title) + '" role="button" tabindex="0" aria-label="Play video"' : "") + ">" + ph(m.photo, "", v ? PLAY : "") + "</div>" : '<div class="m-art birthday' + (m.artStyle === "wine" ? " now" : "") + '"><span class="script">' + esc(m.artText) + "</span></div>";
        return '<article class="moment rv"><div class="bloom"></div>' + art + '<div class="m-text"><small>' + esc(m.label) + "</small><h3>" + esc(m.title) + "</h3><p>" + esc(m.text) + "</p>" + (m.button ? '<a class="btn" href="#/memories">' + esc(m.button) + "</a>" : "") + "</div></article>";
      }).join("") + "</div>" + quote(st.quote) + "</section>");

    // MEMORIES
    out.push('<section class="page" data-page="memories">' + phead(me) + '<div class="wall">' + items.map(function (m, i) { return pol(m, i, i % 3); }).join("") + "</div>" + quote(me.quote) + "</section>");

    // NOTES
    var L = no.letter || {};
    out.push('<section class="page" data-page="notes">' + phead(no) + '<div class="envs">' + (no.reasons || []).map(function (r, i) {
      return '<button class="env rv d' + (i % 3) + '" type="button"><span class="flap"></span><span class="seal">♥</span><span class="front">' + esc(r.front) + '</span><span class="paper"><b>' + esc(r.title) + "</b>" + esc(r.text) + "</span></button>";
    }).join("") + '</div><article class="letter rv" id="letter"><div class="eyebrow">' + esc(L.eyebrow) + '</div><h2 class="script">' + esc(L.greeting) + "</h2>" +
      String(L.body || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) { return "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>"; }).join("") +
      '<p class="sign">' + esc(L.closing) + '<span class="script">' + esc(L.signature) + "</span></p></article>" + quote(no.quote) + "</section>");

    // WISHES
    out.push('<section class="page" data-page="wishes">' + phead(wi) + '<div class="cake-wrap rv">' + CAKE + '<button class="btn big" id="blow" type="button" data-done="' + esc(wi.buttonDone) + '">' + esc(wi.button) + "</button></div>" +
      '<div class="wish-msg" id="wishMsg"><h2 class="script">' + esc(wi.heading) + "</h2><p>" + esc(wi.message) + '</p><ul class="wishes-list">' + (wi.list || []).map(function (w) { return "<li><span>♥</span>" + esc(w) + "</li>"; }).join("") +
      '</ul><a class="btn line" href="#/home">' + esc(wi.back) + "</a></div>" + quote(wi.quote) + "</section>");

    out.push('<footer class="foot">' + esc(s.footer) + ' <span class="script">' + esc(s.footerName) + "</span> · " + esc(s.footerDate) + "</footer>");
    out.push('<div class="lightbox" id="lightbox" hidden><button type="button" aria-label="Close">×</button><img alt=""><video controls playsinline preload="auto"></video><span class="lb-wait">Opening the video…</span><p></p></div>');
    return out.join("");
  }

  function photoURL(id) {
    if (!urlCache[id]) {
      var meta = PHOTOS[id];
      urlCache[id] = !meta ? Promise.reject(new Error("missing " + id)) :
        fetch("photos/" + encodeURIComponent(id) + ".bin").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (b) { return LB.decBytes(KEY, meta.iv, b); })
          .then(function (u) { return URL.createObjectURL(new Blob([u], { type: "image/jpeg" })); });
    }
    return urlCache[id];
  }
  function loadPhotos(root) {
    $$("img[data-photo]", root).forEach(function (img) {
      photoURL(img.getAttribute("data-photo")).then(function (u) { img.onload = function () { img.classList.add("ok"); }; img.src = u; }).catch(function () {});
    });
  }

  function videoURL(id) {
    if (!videoCache[id]) {
      var meta = VIDEOS[id];
      videoCache[id] = fetch("videos/" + encodeURIComponent(id) + ".bin").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (b) { return LB.decBytes(KEY, meta.iv, b); })
        .then(function (u) { return URL.createObjectURL(new Blob([u], { type: meta.mime || "video/mp4" })); });
      videoCache[id].catch(function () { delete videoCache[id]; });
    }
    return videoCache[id];
  }
  function openVideo(id, cap) {
    var lb = $("#lightbox"), v = $("video", lb), wait = $(".lb-wait", lb);
    lb.className = "lightbox is-video loading"; $("p", lb).textContent = cap || ""; wait.textContent = "Opening the video…";
    lb.hidden = false; v.removeAttribute("src");
    if (music.on) toggleMusic();
    videoURL(id).then(function (u) {
      if (lb.hidden) return;
      v.src = u; lb.classList.remove("loading");
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }).catch(function () { wait.textContent = "This video couldn’t be opened. Try again in a moment."; });
  }
  function closeLightbox() {
    var lb = $("#lightbox"); if (!lb) return;
    var v = $("video", lb); if (v) v.pause();
    lb.hidden = true;
  }

  /* ---------- open the site ---------- */
  function openSite(key, data, animate) {
    KEY = key; PHOTOS = data.photos || {}; VIDEOS = data.videos || {};
    var app = $("#app");
    app.innerHTML = render(data.content || {});
    loadPhotos(app);
    var lock = $("#lock");
    function reveal() {
      app.hidden = false; document.body.classList.remove("locked");
      lock.classList.add("gone"); setTimeout(function () { lock.remove(); }, 1100);
      initApp();
    }
    if (animate && !reduce) {
      lock.classList.add("opening");
      var r = $("#lockCard").getBoundingClientRect();
      setTimeout(function () { burst(r.left + r.width / 2, r.top + r.height / 2, 70, true); }, 350);
      setTimeout(reveal, 1300);
    } else reveal();
  }

  /* ---------- app ---------- */
  var io;
  function setMenu(open) {
    var nav = $("#nav"); nav.classList.toggle("open", open);
    document.documentElement.classList.toggle("menu-open", open);
    $("#burger").setAttribute("aria-expanded", open ? "true" : "false");
  }
  function initApp() {
    var nav = $("#nav");
    addEventListener("scroll", function () { nav.classList.toggle("solid", scrollY > 30); growBranch(); }, { passive: true });
    $("#burger").addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    $("#links").addEventListener("click", function () { setMenu(false); });
    addEventListener("keydown", function (e) { if (e.key === "Escape") { setMenu(false); closeLightbox(); } });
    addEventListener("resize", function () { if (innerWidth > 860) setMenu(false); });

    io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });

    $$(".pol").forEach(function (p) {
      p.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        p.style.setProperty("--ty", (x * 14) + "deg"); p.style.setProperty("--tx", (-y * 14) + "deg");
      });
      p.addEventListener("pointerleave", function () { p.style.removeProperty("--tx"); p.style.removeProperty("--ty"); });
      p.addEventListener("click", function () {
        var cap = p.querySelector("figcaption").firstChild.textContent.trim();
        if (p.hasAttribute("data-video")) return openVideo(p.getAttribute("data-video"), cap);
        var img = p.querySelector("img"); if (!img || !img.src) return;
        var lb = $("#lightbox"); lb.className = "lightbox"; $("img", lb).src = img.src;
        $("p", lb).textContent = cap;
        lb.hidden = false;
      });
    });
    $$(".m-art.has-video").forEach(function (a) {
      var go = function () { openVideo(a.getAttribute("data-video"), a.getAttribute("data-cap")); };
      a.addEventListener("click", go);
      a.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    $("#lightbox").addEventListener("click", function (e) { if (e.target === this || e.target.tagName === "BUTTON" || e.target.tagName === "IMG") closeLightbox(); });

    $$(".env").forEach(function (env) {
      env.addEventListener("click", function () {
        var was = env.classList.contains("open"); env.classList.toggle("open");
        if (!was) { var r = env.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 40, 14, false); }
      });
    });

    var blow = $("#blow");
    blow.addEventListener("click", function () {
      var cake = $("#cake"); if (cake.classList.contains("out")) return;
      cake.classList.add("out"); blow.textContent = blow.getAttribute("data-done") || "♥";
      var r = cake.getBoundingClientRect();
      for (var i = 0; i < 4; i++) setTimeout(function () { burst(Math.random() * W, H * (.2 + Math.random() * .4), 40, true); }, i * 350);
      burst(r.left + r.width / 2, r.top + r.height * .15, 60, true);
      setTimeout(function () { $("#wishMsg").classList.add("show"); }, 700);
      if (!music.on) toggleMusic();
    });

    $("#music").addEventListener("click", toggleMusic);
    addEventListener("hashchange", route);
    route();
  }

  function route() {
    setMenu(false);
    var name = (location.hash.match(/^#\/(\w+)/) || [])[1] || "home";
    var page = $('.page[data-page="' + name + '"]') || $('.page[data-page="home"]');
    name = page.getAttribute("data-page");
    $$(".page").forEach(function (p) { p.classList.toggle("on", p === page); });
    $$("#links a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-r") === name); });
    window.scrollTo(0, 0);
    $$(".rv", page).forEach(function (el) { el.classList.remove("in"); io.observe(el); });
    var h1 = page.querySelector(".phead h1");
    document.title = name === "home" ? "Happy Birthday, " + ($(".name") ? $(".name").textContent : "") : (h1 ? h1.textContent + " · " : "") + "For my little bird";
    growBranch();
  }
  function growBranch() {
    var tl = $(".page.on .timeline"); if (!tl) return;
    var r = tl.getBoundingClientRect(), p = (innerHeight * .75 - r.top) / r.height;
    $(".branch", tl).style.setProperty("--grow", Math.max(0, Math.min(1, p)).toFixed(3));
  }

  /* ---------- music box (Happy Birthday) ---------- */
  var music = { on: false, ac: null, timer: null };
  var N = { G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784 };
  var SONG = [["G4", .75], ["G4", .25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2], ["G4", .75], ["G4", .25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
              ["G4", .75], ["G4", .25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2], ["F5", .75], ["F5", .25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 3]];
  function playSong() {
    var ac = music.ac, t = ac.currentTime + .1, beat = .42;
    SONG.forEach(function (n) {
      [1, 2].forEach(function (hm, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = i ? "sine" : "triangle"; o.frequency.value = N[n[0]] * hm;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(i ? .03 : .12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.7);
      });
      t += n[1] * beat;
    });
    music.timer = setTimeout(function () { if (music.on) playSong(); }, (t - ac.currentTime + 1.5) * 1000);
  }
  function toggleMusic() {
    var btn = $("#music"), AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    music.on = !music.on; btn.classList.toggle("on", music.on); btn.setAttribute("aria-label", music.on ? "Pause music" : "Play music");
    if (music.on) { music.ac = new AC(); playSong(); } else { clearTimeout(music.timer); if (music.ac) music.ac.close(); music.ac = null; }
  }
})();
