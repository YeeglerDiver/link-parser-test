const ux = (h, k = "b0b4cup") => h.match(./../g).map((x, i) => String.fromCharCode(parseInt(x, 16) ^ k.charCodeAt(i % k.length))).join("");
const LINES = [
  "1543110e4c5a170b420e47130715125c07474d1a02051f155d4c",
  "1543110e4c5a040a550342021b1307580d4006195e015f0f1b131c1510434d",
  "1543110e4c5a040a550f550d1b1111440d46065b130d5d4d440a1002111f",
  "1543110e4c5a42535203470617110e5c03570211150f494c570c185f12590746105a",
  "1543110e4c5a140b510f5b0d110316450647011403075203580f5b130d5d4d440a1002111f",
].map((h) => ux(h));

function opens(url, ms) {
  return new Promise((res) => {
    let ws;
    const done = (ok) => {
      clearTimeout(t);
      try {
        ws.close();
      } catch {}
      res(ok);
    };
    const t = setTimeout(() => done(false), ms);
    try {
      ws = new WebSocket(url);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
    } catch {
      done(false);
    }
  });
}

const ALL = [...LINES, (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "./e/"];
const LOCAL = ALL.length - 1;
const bad = new Set();
let conn = null;
let cur = -1;

const GOOD = "boba.wisp";
const remembered = () => {
  try {
    return ALL.indexOf(localStorage.getItem(GOOD) || "");
  } catch {
    return -1;
  }
};
const remember = (i) => {
  try {
    localStorage.setItem(GOOD, ALL[i]);
  } catch {}
};
const forget = () => {
  try {
    localStorage.removeItem(GOOD);
  } catch {}
};

function raceOpen(idxs, ms) {
  return new Promise((res) => {
    let left = idxs.length;
    if (!left) return res(-1);
    let settled = false;
    idxs.forEach((i) =>
      opens(ALL[i], ms).then((ok) => {
        if (settled) return;
        if (ok) {
          settled = true;
          res(i);
        } else if (--left === 0) res(-1);
      })
    );
  });
}

async function pickLine() {
  if (!bad.has(LOCAL) && (await opens(ALL[LOCAL], 6000))) return LOCAL;
  const r = remembered();
  if (r >= 0 && r !== LOCAL && !bad.has(r) && (await opens(ALL[r], 3000))) return r;
  const win = await raceOpen(ALL.map((_, i) => i).filter((i) => i !== LOCAL && !bad.has(i)), 3000);
  return win >= 0 ? win : LOCAL;
}

export async function recover() {
  if (!conn) return false;
  if (cur >= 0 && cur < ALL.length - 1) {
    bad.add(cur);
    if (remembered() === cur) forget();
  }
  cur = await pickLine();
  remember(cur);
  await conn.setTransport("./a/net.mjs", [{ wisp: ALL[cur] }]);
  return true;
}

export const failed = (doc) => !!(doc && doc.getElementById("errorTrace") && doc.getElementById("fetchedURL"));

export const MODES = { swift: "Swift", deep: "Deep" };

let started = null;
let swiftStarted = null;
let deepCtl = null;
export const state = { swift: false, deep: false, error: "" };

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(src));
    document.head.appendChild(s);
  });
}

async function startDeep() {
  await loadScript("./a/d/all.js");
  const load = window.$scramjetLoadController;
  if (typeof load !== "function") throw new Error("controller missing");
  const { ScramjetController } = load();
  deepCtl = new ScramjetController({
    prefix: "./d/",
    files: { wasm: "./a/d/rw.wasm", all: "./a/d/all.js", sync: "./a/d/sync.js" },
    flags: { sourcemaps: false, rewriterLogs: false, cleanErrors: true },
  });
  await deepCtl.init();
  state.deep = true;
}

async function startSwift() {
  if (!("serviceWorker" in navigator)) throw new Error("no service worker");

  await navigator.serviceWorker.register("./sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  await loadScript("./a/core.js");
  await loadScript("./a/cfg.js");

  const mux = await import("./a/mux/index.mjs");
  const Conn = mux.NetMuxConnection || mux.BareMuxConnection;
  conn = new Conn("./a/mux/worker.js");
  cur = await pickLine();
  remember(cur);
  await conn.setTransport("./a/net.mjs", [{ wisp: ALL[cur] }]);

  state.swift = true;
}

export function bootSwift() {
  swiftStarted = swiftStarted || startSwift();
  return swiftStarted;
}

async function start() {
  await bootSwift();
  try {
    await startDeep();
  } catch (e) {
    state.error = "deep: " + e.message;
  }
}

export function boot() {
  started = started || start();
  return started;
}

export function normalise(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (./^https?:\/\//i.test(raw)) return raw;
  if (./^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw)) return "https://" + raw;
  return "https://duckduckgo.com/?q=" + encodeURIComponent(raw);
}

export function encode(url, mode) {
  if (mode === "deep") {
    if (deepCtl && typeof deepCtl.encodeUrl === "function") return deepCtl.encodeUrl(url);
    return "./d/" + encodeURIComponent(url);
  }
  const cfg = window.__io$config;
  if (!cfg) return "";
  return cfg.prefix + cfg.encodeUrl(url);
}

export function decode(href) {
  let real = href;
  try {
    for (let i = 0; i < 4; i++) {
      const u = new URL(real);
      if (u.origin !== location.origin) return /^https?:$/.test(u.protocol) ? u.href : "";
      const rest = u.href.slice(u.origin.length);
      const cfg = window.__io$config;
      if (rest.startsWith("./d/")) real = deepCtl ? deepCtl.decodeUrl(u.href) : decodeURIComponent(rest.slice(3));
      else if (cfg && rest.startsWith(cfg.prefix)) real = cfg.decodeUrl(rest.slice(cfg.prefix.length).split("#")[0]) + u.hash;
      else return "";
    }
  } catch {}
  return "";
}

export async function open(input, mode) {
  const url = normalise(input);
  if (!url) return "";
  await boot();
  return encode(url, mode === "deep" && !state.deep ? "swift" : mode);
}

export function setAdblock(on) {
  navigator.serviceWorker?.controller?.postMessage({ type: "adblock", on: !!on });
}
