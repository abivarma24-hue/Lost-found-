/* =====================================================================
   REC QR Lost & Found  -  js/app.js
   One file for the whole project. Every page has <body data-page="...">
   and the last section of this file runs the matching init function.
   ===================================================================== */


/* =====================================================================
   1. SETTINGS  (the only two lines you may need to edit)
   ===================================================================== */

// Firebase Realtime Database URL for shared data across phones/laptops.
// Set this to "" to use browser-only localStorage mode instead.
const DB_URL = "https://rec-qr-lost-and-found-demo-default-rtdb.firebaseio.com";

// After you host the site, put its address here, e.g.
//   "https://my-lost-found.netlify.app/"
// Leave EMPTY ("") and the QR will use the address you are browsing now.
const SITE_URL = "";


/* =====================================================================
   2. SMALL HELPERS
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const getParam = (name) => new URLSearchParams(location.search).get(name);

// Makes user-typed text safe before we put it inside HTML (stops HTML injection)
function esc(text) {
  const d = document.createElement("div");
  d.textContent = String(text);
  return d.innerHTML.replace(/"/g, "&quot;");
}

// Random id such as "T4F9K2QZ1" (prefix + 8 letters/numbers)
function newId(prefix) {
  const r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return prefix + r.slice(0, 8).toUpperCase();
}

function showAlert(el, text, kind) {
  el.textContent = text;
  el.className = "alert " + (kind || "error");
  el.hidden = false;
}

function clock(ms, withSeconds) {
  const opts = { hour: "2-digit", minute: "2-digit" };
  if (withSeconds) opts.second = "2-digit";
  return new Date(ms).toLocaleTimeString([], opts);
}

function dateText(ms) {
  return new Date(ms).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function isLocalAddress() {
  return ["localhost", "127.0.0.1", ""].includes(location.hostname);
}


/* =====================================================================
   3. DATABASE LAYER
   Three functions (dbGet, dbSet) hide where data lives.
   - DB_URL empty  -> data is kept in localStorage (this browser only)
   - DB_URL filled -> data is kept in Firebase (shared by every device)
   The rest of the project never needs to know which one is used.
   ===================================================================== */

const USE_FIREBASE = DB_URL.trim() !== "";
const FIREBASE = DB_URL.trim().replace(/\/+$/, "");

async function dbGet(path) {
  if (USE_FIREBASE) {
    const res = await fetch(FIREBASE + "/" + path + ".json");
    if (!res.ok) throw new Error("Database error " + res.status);
    return await res.json();               // gives null when nothing is stored
  }
  return localGet(path);
}

// Saves a value at a path. Saving null deletes it.
async function dbSet(path, value) {
  if (USE_FIREBASE) {
    const res = await fetch(FIREBASE + "/" + path + ".json", {
      method: "PUT",
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error("Database error " + res.status);
    return;
  }
  localSet(path, value);
}

// ---- localStorage version: one big object saved under the key "lf_db" ----
function localRoot() {
  try { return JSON.parse(localStorage.getItem("lf_db")) || {}; }
  catch (e) { return {}; }
}

function localGet(path) {
  let node = localRoot();
  for (const key of path.split("/")) {
    if (node === null || typeof node !== "object" || !(key in node)) return null;
    node = node[key];
  }
  return node;
}

function localSet(path, value) {
  const root = localRoot();
  const keys = path.split("/");
  let node = root;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof node[keys[i]] !== "object" || node[keys[i]] === null) node[keys[i]] = {};
    node = node[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (value === null) delete node[last];
  else node[last] = value;
  localStorage.setItem("lf_db", JSON.stringify(root));
}


/* =====================================================================
   4. ACCOUNTS (register, login, logout)
   Data layout in the database:
     users/<emailKey>              -> { name, email, passHash }
     userTags/<emailKey>/<tagId>   -> true     (list of a user's tags)
     tags/<tagId>                  -> { id, type, name, note, ownerEmail, ownerName, status, createdAt }
     chats/<tagId>/messages/<id>   -> { from, text, time }
     chats/<tagId>/location/<role> -> { lat, lng, accuracy, time }
   ===================================================================== */

// Database keys cannot contain "." so we swap special characters for ","
function emailKey(email) {
  return email.trim().toLowerCase().replace(/[.#$\[\]\/]/g, ",");
}

// Passwords are never stored as plain text. We store a SHA-256 fingerprint.
async function hashPassword(password) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error("Open the site with https:// or localhost so passwords can be protected.");
  }
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The logged-in user is remembered in this browser only
function currentUser() {
  try { return JSON.parse(localStorage.getItem("lf_user")); }
  catch (e) { return null; }
}

function saveSession(user) {
  localStorage.setItem("lf_user", JSON.stringify({ email: user.email, name: user.name }));
}

function logout() {
  localStorage.removeItem("lf_user");
  location.href = "index.html";
}

// Sends the visitor to login if they are not logged in
function requireLogin() {
  if (currentUser()) return true;
  const here = location.pathname.split("/").pop() + location.search;
  location.href = "login.html?next=" + encodeURIComponent(here);
  return false;
}

// Only allow redirects to our own pages
function safeNext(next) {
  return /^[a-z-]+\.html(\?[A-Za-z0-9=&%_-]*)?$/i.test(next || "") ? next : "dashboard.html";
}

// Shows/hides the menu links depending on login state
function updateNav() {
  const user = currentUser();
  document.querySelectorAll("[data-user]").forEach((el) => (el.hidden = !user));
  document.querySelectorAll("[data-guest]").forEach((el) => (el.hidden = !!user));
  const btn = $("logoutBtn");
  if (btn) btn.addEventListener("click", logout);
}


/* =====================================================================
   5. TAG FUNCTIONS
   ===================================================================== */

async function createTag(user, data) {
  const tag = {
    id: newId("T"),
    type: data.type,
    name: data.name,
    note: data.note,
    ownerEmail: user.email,
    ownerName: user.name,
    status: "active",
    createdAt: Date.now(),
  };
  await dbSet("tags/" + tag.id, tag);
  await dbSet("userTags/" + emailKey(user.email) + "/" + tag.id, true);
  return tag;
}

async function getMyTags(user) {
  const index = await dbGet("userTags/" + emailKey(user.email));
  const ids = Object.keys(index || {});
  const tags = await Promise.all(ids.map((id) => dbGet("tags/" + id)));
  return tags.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

async function countMessages(id) {
  const msgs = await dbGet("chats/" + id + "/messages");
  return msgs ? Object.keys(msgs).length : 0;
}

async function markReturned(id) {
  await dbSet("tags/" + id + "/status", "returned");
  await dbSet("tags/" + id + "/returnedAt", Date.now());
  await dbSet("chats/" + id + "/messages/" + newId("m"), {
    from: "system",
    text: "The owner marked this item as returned. Thank you for helping!",
    time: Date.now(),
  });
}

async function deleteTag(user, id) {
  await dbSet("tags/" + id, null);
  await dbSet("chats/" + id, null);
  await dbSet("userTags/" + emailKey(user.email) + "/" + id, null);
}

// The link stored inside the QR code
function tagLink(id) {
  const base = SITE_URL.trim()
    ? SITE_URL.trim().replace(/\/?$/, "/")
    : new URL("./", location.href).href;
  return base + "found.html?id=" + id;
}


/* =====================================================================
   6. PAGE: HOME  (index.html)
   ===================================================================== */

function initHome() {
  // Draw a real, scannable demo QR on the sample tag
  if ($("demoQr") && typeof QRCode !== "undefined") {
    new QRCode($("demoQr"), {
      text: "REC QR Lost & Found - sample tag",
      width: 170,
      height: 170,
      colorDark: "#14213d",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }
}


/* =====================================================================
   7. PAGE: REGISTER  (register.html)
   ===================================================================== */

function initRegister() {
  const form = $("registerForm");
  const msg = $("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();                       // stop the normal page reload
    msg.hidden = true;

    const name = $("fullName").value.trim();
    const email = $("email").value.trim().toLowerCase();
    const password = $("password").value;

    if (password !== $("confirm").value) {
      showAlert(msg, "The two passwords do not match.");
      return;
    }

    const btn = $("submitBtn");
    btn.disabled = true;
    try {
      const key = emailKey(email);
      if (await dbGet("users/" + key)) {
        showAlert(msg, "An account with this email already exists. Please log in.");
        btn.disabled = false;
        return;
      }
      const passHash = await hashPassword(password);
      await dbSet("users/" + key, { name, email, passHash });
      saveSession({ name, email });
      location.href = "dashboard.html";
    } catch (err) {
      showAlert(msg, err.message || "Something went wrong. Please try again.");
      btn.disabled = false;
    }
  });
}


/* =====================================================================
   8. PAGE: LOGIN  (login.html)
   ===================================================================== */

function initLogin() {
  const form = $("loginForm");
  const msg = $("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;

    const email = $("email").value.trim().toLowerCase();
    const btn = $("submitBtn");
    btn.disabled = true;
    try {
      const user = await dbGet("users/" + emailKey(email));
      const passHash = await hashPassword($("password").value);
      if (!user || user.passHash !== passHash) {
        showAlert(msg, "Email or password is wrong.");
        btn.disabled = false;
        return;
      }
      saveSession(user);
      location.href = safeNext(getParam("next"));
    } catch (err) {
      showAlert(msg, err.message || "Something went wrong. Please try again.");
      btn.disabled = false;
    }
  });
}


/* =====================================================================
   9. PAGE: DASHBOARD  (dashboard.html)  - the owner's list of tags
   ===================================================================== */

async function initDashboard() {
  if (!requireLogin()) return;
  const user = currentUser();
  $("hello").textContent = "Hi, " + user.name.split(" ")[0];

  const rows = $("tagRows");
  const msg = $("msg");

  async function load() {
    try {
      const tags = await getMyTags(user);
      const counts = await Promise.all(tags.map((t) => countMessages(t.id)));

      $("emptyMsg").hidden = tags.length > 0;
      $("tableWrap").hidden = tags.length === 0;
      msg.hidden = true;

      rows.innerHTML = tags.map((t, i) => {
        const seen = Number(localStorage.getItem("lf_seen_" + t.id) || 0);
        const fresh = counts[i] - seen;
        const badge = fresh > 0 ? `<span class="badge-new">${fresh} new</span>` : "";
        const returned = t.status === "returned";
        return `
          <tr>
            <td><strong>${esc(t.name)}</strong><br><small>${esc(t.type)}, code ${esc(t.id)}</small></td>
            <td><span class="chip ${returned ? "returned" : "active"}">${returned ? "Returned" : "Active"}</span></td>
            <td>${dateText(t.createdAt)}</td>
            <td>
              <div class="actions">
                <a href="qr.html?id=${esc(t.id)}">QR sticker</a>
                <a href="chat.html?id=${esc(t.id)}">Chat ${badge}</a>
                ${returned ? "" : `<button type="button" data-action="return" data-id="${esc(t.id)}">Mark returned</button>`}
                <button type="button" class="danger" data-action="delete" data-id="${esc(t.id)}">Delete</button>
              </div>
            </td>
          </tr>`;
      }).join("");
    } catch (err) {
      showAlert(msg, "Could not load your tags. Check your internet connection.");
    }
  }

  // One click listener for all buttons inside the table (event delegation)
  rows.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.action === "return" && confirm("Mark this item as returned?")) {
        await markReturned(id);
      } else if (btn.dataset.action === "delete" && confirm("Delete this tag? Its QR sticker will stop working.")) {
        await deleteTag(user, id);
      }
      load();
    } catch (err) {
      showAlert(msg, "That did not work. Please try again.");
    }
  });

  load();
  setInterval(load, 8000);                    // refresh to show new chat messages
}


/* =====================================================================
   10. PAGE: CREATE TAG  (create-tag.html)
   ===================================================================== */

function initCreateTag() {
  if (!requireLogin()) return;
  const user = currentUser();
  const form = $("tagForm");
  const msg = $("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const btn = $("submitBtn");
    btn.disabled = true;
    try {
      const tag = await createTag(user, {
        type: $("itemType").value,
        name: $("itemName").value.trim(),
        note: $("itemNote").value.trim(),
      });
      location.href = "qr.html?id=" + tag.id;
    } catch (err) {
      showAlert(msg, "Could not save the tag. Please try again.");
      btn.disabled = false;
    }
  });
}


/* =====================================================================
   11. PAGE: QR STICKER  (qr.html)
   ===================================================================== */

async function initQr() {
  if (!requireLogin()) return;
  const user = currentUser();
  const msg = $("msg");
  const id = (getParam("id") || "").toUpperCase();

  let tag = null;
  try { tag = id ? await dbGet("tags/" + id) : null; }
  catch (e) { showAlert(msg, "Cannot reach the database. Check your internet connection."); return; }

  if (!tag || tag.ownerEmail !== user.email) {
    showAlert(msg, "This tag was not found in your account.");
    return;
  }
  if (typeof QRCode === "undefined") {
    showAlert(msg, "The QR library did not load. Check your internet connection and refresh.");
    return;
  }

  const link = tagLink(id);
  $("qrLayout").hidden = false;
  $("tagType").textContent = tag.type;
  $("tagName").textContent = tag.name;
  $("tagCode").textContent = id;
  $("linkText").textContent = link;

  // This line creates the QR code image
  new QRCode($("qrBox"), {
    text: link,
    width: 220,
    height: 220,
    colorDark: "#14213d",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  // Warn the owner if the link will only work on this computer
  if (!SITE_URL.trim() && isLocalAddress()) {
    showAlert(
      $("localWarn"),
      "You are on localhost, so this QR only works on this computer. Host the site first (see README), then create the tag again to test with a phone.",
      "warn"
    );
  }

  // Download as PNG (with a white border so phones can scan it easily)
  $("downloadBtn").addEventListener("click", () => {
    const src = $("qrBox").querySelector("canvas");
    const pad = 24;
    const out = document.createElement("canvas");
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "qr-" + id + ".png";
    a.click();
  });

  $("printBtn").addEventListener("click", () => window.print());
}


/* =====================================================================
   12. PAGE: FOUND  (found.html)  - the page a finder sees after scanning
   ===================================================================== */

async function initFound() {
  const msg = $("foundMsg");
  const id = (getParam("id") || "").trim().toUpperCase();

  if (!id) {
    showAlert(msg, "This link has no tag code. Scan the QR sticker again, or type the code on the home page.", "warn");
    return;
  }

  let tag = null;
  try { tag = await dbGet("tags/" + id); }
  catch (e) { showAlert(msg, "Cannot reach the database. Check your internet connection."); return; }

  if (!tag) {
    showAlert(
      msg,
      "We could not find tag " + id + ". If the owner created it while testing without a database (DB_URL empty), it exists only in the owner's browser.",
      "error"
    );
    return;
  }
  if (tag.status === "returned") {
    showAlert(msg, "Good news: this item has already been returned to its owner.", "ok");
    return;
  }

  $("foundCard").hidden = false;
  $("itemName").textContent = tag.name;
  $("itemType").textContent = tag.type;
  $("ownerName").textContent = tag.ownerName.split(" ")[0];   // first name only, for privacy
  $("chatLink").href = "chat.html?id=" + id;
  if (tag.note) {
    $("ownerNote").textContent = tag.note;
    $("ownerNote").hidden = false;
  }
}


/* =====================================================================
   13. PAGE: CHAT + LIVE LOCATION  (chat.html)
   Both people open the same page. If the visitor is logged in as the
   owner of the tag they are the "owner", everybody else is the "finder".
   The page asks the database for new data every 2.5 seconds.
   ===================================================================== */

async function initChat() {
  const alertBox = $("chatAlert");
  const id = (getParam("id") || "").trim().toUpperCase();

  let tag = null;
  try { tag = id ? await dbGet("tags/" + id) : null; }
  catch (e) { showAlert(alertBox, "Cannot reach the database. Check your internet connection."); return; }

  if (!tag) {
    showAlert(alertBox, "This tag was not found. Scan the QR sticker again.");
    return;
  }

  const user = currentUser();
  // Demo shortcut: add &as=finder to the chat link to behave as the finder
  // even while logged in (useful when testing with two tabs in one browser).
  const actAsFinder = getParam("as") === "finder";
  const role = !actAsFinder && user && user.email === tag.ownerEmail ? "owner" : "finder";

  // ---- fill the page ----
  $("chatRoot").hidden = false;
  $("chatTitle").textContent = "Chat about: " + tag.name;
  $("roleText").textContent = role === "owner"
    ? "You are the owner. Messages from the finder appear here."
    : "You are the finder. Say hello and agree on where to hand over the item.";
  $("ownerLogin").hidden = role === "owner";
  $("ownerLoginLink").href = "login.html?next=" + encodeURIComponent("chat.html?id=" + id);
  $("returnBtn").hidden = role !== "owner" || tag.status === "returned";

  const log = $("chatLog");
  let returned = tag.status === "returned";
  let lastSignature = "";
  let busy = false;

  // ---- chat messages ----
  function drawMessages(msgs) {
    const list = Object.values(msgs || {}).sort((a, b) => a.time - b.time);
    localStorage.setItem("lf_seen_" + id, list.length);      // used for "new" badge on dashboard

    const signature = list.length + ":" + (list.length ? list[list.length - 1].time : 0);
    if (signature === lastSignature) return;                  // nothing new, skip redraw
    lastSignature = signature;

    log.innerHTML = "";
    if (list.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No messages yet. Say hello.";
      log.appendChild(p);
      return;
    }
    list.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + (m.from === "system" ? "system" : m.from === role ? "mine" : "theirs");
      const text = document.createElement("p");
      text.textContent = m.text;                              // textContent = safe, no HTML injection
      div.appendChild(text);
      if (m.from !== "system") {
        const time = document.createElement("time");
        const who = m.from === role ? "You" : m.from === "owner" ? "Owner" : "Finder";
        time.textContent = who + ", " + clock(m.time);
        div.appendChild(time);
      }
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  }

  $("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (returned) return;
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      await dbSet("chats/" + id + "/messages/" + newId("m"), { from: role, text, time: Date.now() });
      refresh();
    } catch (err) {
      input.value = text;                                     // give the text back so it is not lost
      $("netNote").hidden = false;
    }
  });

  // ---- live location ----
  let watchId = null;
  let lastSent = 0;

  function drawLocations(locs) {
    ["finder", "owner"].forEach((r) => {
      const box = $("loc-" + r);
      const p = locs && locs[r];
      if (!p) { box.hidden = true; box.dataset.coords = ""; return; }

      box.hidden = false;
      const who = r === role ? "Your location" : r === "finder" ? "Finder's location" : "Owner's location";
      $("locTitle-" + r).textContent = who + " (updated " + clock(p.time, true) + ")";

      const coords = p.lat.toFixed(5) + "," + p.lng.toFixed(5);
      if (box.dataset.coords !== coords) {                    // only reload the map when the position changed
        box.dataset.coords = coords;
        $("map-" + r).src = "https://maps.google.com/maps?q=" + coords + "&z=17&output=embed";
        $("maplink-" + r).href = "https://www.google.com/maps?q=" + coords;
      }
    });
  }

  function startSharing() {
    if (!("geolocation" in navigator)) {
      $("locStatus").textContent = "This browser cannot share location.";
      return;
    }
    if (!window.isSecureContext) {
      $("locStatus").textContent = "Location needs https:// or localhost. Host the site first.";
      return;
    }
    $("locStatus").textContent = "Finding your location...";
    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent < 3000) return;                    // send at most once every 3 seconds
        lastSent = now;
        $("locStatus").textContent = "Sharing your live location with the " + (role === "owner" ? "finder" : "owner") + ".";
        try {
          await dbSet("chats/" + id + "/location/" + role, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            time: now,
          });
        } catch (e) { $("netNote").hidden = false; }
      },
      (err) => {
        if (err.code === 1) {                                 // 1 = permission denied
          $("locStatus").textContent = "Location permission was denied. Allow it in your browser settings and try again.";
          stopSharing();
        } else {
          $("locStatus").textContent = "Waiting for a GPS signal...";
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    $("shareBtn").textContent = "Stop sharing my location";
  }

  async function stopSharing() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    $("shareBtn").textContent = "Share my live location";
    $("locStatus").textContent = "You are not sharing your location.";
    try { await dbSet("chats/" + id + "/location/" + role, null); } catch (e) { /* ignore */ }
  }

  $("shareBtn").addEventListener("click", () => (watchId === null ? startSharing() : stopSharing()));

  // ---- hand-over (owner only) ----
  function applyReturned() {
    returned = true;
    $("returnedBanner").hidden = false;
    $("returnBtn").hidden = true;
    $("chatInput").disabled = true;
    $("sendBtn").disabled = true;
    $("chatInput").placeholder = "Chat closed";
    if (watchId !== null) stopSharing();
  }
  if (returned) applyReturned();

  $("returnBtn").addEventListener("click", async () => {
    if (!confirm("Mark this item as returned? The chat will be closed.")) return;
    try {
      await markReturned(id);
      applyReturned();
      refresh();
    } catch (err) {
      $("netNote").hidden = false;
    }
  });

  // ---- keep everything up to date ----
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const [status, msgs, locs] = await Promise.all([
        dbGet("tags/" + id + "/status"),
        dbGet("chats/" + id + "/messages"),
        dbGet("chats/" + id + "/location"),
      ]);
      if (status === "returned" && !returned) applyReturned();
      drawMessages(msgs);
      drawLocations(locs);
      $("netNote").hidden = true;
    } catch (err) {
      $("netNote").hidden = false;
    }
    busy = false;
  }

  refresh();
  setInterval(refresh, 2500);
}


/* =====================================================================
   14. START: run the right init function for the current page
   ===================================================================== */

const pages = {
  home: initHome,
  register: initRegister,
  login: initLogin,
  dashboard: initDashboard,
  "create-tag": initCreateTag,
  qr: initQr,
  found: initFound,
  chat: initChat,
};

function start() {
  updateNav();
  const init = pages[document.body.dataset.page];
  if (init) init();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
