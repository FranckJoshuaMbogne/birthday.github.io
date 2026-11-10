/* Shared encryption helpers (AES-GCM 256, key from the PIN with PBKDF2-SHA256). */
window.LB = (function () {
  "use strict";
  var te = new TextEncoder(), td = new TextDecoder(), S = crypto.subtle;
  function fromB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function toB64(buf) {
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), s = "", C = 0x8000;
    for (var i = 0; i < u.length; i += C) s += String.fromCharCode.apply(null, u.subarray(i, i + C));
    return btoa(s);
  }
  function derive(pin, vault, usages) {
    return S.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return S.deriveKey({ name: "PBKDF2", salt: fromB64(vault.salt), iterations: vault.iter, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, true, usages || ["decrypt"]);
    });
  }
  function importRaw(rawB64, usages) { return S.importKey("raw", fromB64(rawB64), { name: "AES-GCM" }, false, usages || ["decrypt"]); }
  function exportRaw(key) { return S.exportKey("raw", key).then(toB64); }
  function decBytes(key, ivB64, bytes) { return S.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, bytes).then(function (b) { return new Uint8Array(b); }); }
  function encBytes(key, bytes) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return S.encrypt({ name: "AES-GCM", iv: iv }, key, bytes).then(function (ct) { return { iv: toB64(iv), ct: new Uint8Array(ct) }; });
  }
  function decJSON(key, ivB64, ctB64) { return decBytes(key, ivB64, fromB64(ctB64)).then(function (u) { return JSON.parse(td.decode(u)); }); }
  function encJSON(key, obj) { return encBytes(key, te.encode(JSON.stringify(obj))).then(function (r) { return { iv: r.iv, ct: toB64(r.ct) }; }); }
  return { fromB64: fromB64, toB64: toB64, derive: derive, importRaw: importRaw, exportRaw: exportRaw,
           decBytes: decBytes, encBytes: encBytes, decJSON: decJSON, encJSON: encJSON };
})();
