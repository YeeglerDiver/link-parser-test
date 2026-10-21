import { I } from "./icons.js";

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
export const el = (h) => {
  const t = document.createElement("template");
  t.innerHTML = h.trim();
  return t.content.firstElementChild;
};
export const esc = (s) =>
  String(s ?? "").replace(./[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CUP = document.getElementById("intro")?.innerHTML || "";
export const cup = () => CUP;

export const ico = (k, cls = "i", fill) =>
  '<svg class="' + cls + '" viewBox="0 0 256 256"' + (fill ? ' fill="' + fill + '"' : "") + ' aria-hidden="true">' + (I[k] || "") + "</svg>";

try {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith("vireo.")) continue;
    const n = "boba." + k.slice(6);
    if (localStorage.getItem(n) === null) localStorage.setItem(n, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
} catch {}

const watchers = new Set();
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("boba." + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("boba." + k, JSON.stringify(v));
    } catch {}
    watchers.forEach((fn) => fn(k));
  },
  watch: (fn) => watchers.add(fn),
};

export function failPage(frame, url, retry) {
  let d = null;
  try {
    d = frame.contentDocument;
  } catch {}
  if (!d) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (k, f) => cs.getPropertyValue(k).trim() || f;
  let host = url;
  try {
    host = new URL(url).hostname.replace(./^www\./, "");
  } catch {}
  d.open();
  d.write(
    '<!doctype html><meta charset="utf-8"><title>' + esc(host) + "</title><style>" +
      "html,body{height:100%;margin:0}body{display:grid;place-items:center;background:" + v("--base", "#ddb98f") + ";color:" + v("--ink", "#2b1a10") +
      ";font:15px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif}.c{text-align:center;padding:24px;max-width:340px}" +
      ".c img{width:72px;height:auto;opacity:.9;margin-bottom:16px}h1{font-size:19px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em}" +
      "p{margin:0 0 22px;color:" + v("--ink-2", "rgba(43,26,16,.64)") + "}button{height:40px;padding:0 22px;border:0;border-radius:999px;background:" + v("--acc", "#8A5631") +
      ";color:" + v("--acc-ink", "#fff") + ";font:600 14px Inter,system-ui,sans-serif;cursor:pointer;transition:transform .2s}button:active{transform:scale(.96)}" +
      '</style><div class="c"><img alt="" src="./img/boba-cup.svg"><h1>Couldn\'t load this page</h1><p>' + esc(host) + '</p><button id="again" type="button">Try again</button></div>'
  );
  d.close();
  d.getElementById("again").addEventListener("click", retry);
}

export const unexpired = (list) => {
  const days = +store.get("forget", 0) || 0;
  const min = Math.max(+store.get("cleared", 0) || 0, days ? Date.now() - days * 864e5 : 0);
  return min ? list.filter((x) => (x.at || 0) > min) : list;
};

export const clockText = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
};

export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export function segThumb(seg) {
  const b = seg.querySelector("button.on"), th = seg.querySelector(".th");
  if (!b || !th) return;
  th.style.width = b.offsetWidth + "px";
  th.style.transform = "translateX(" + (b.offsetLeft - 3) + "px)";
}

export const initials = (name) =>
  String(name || "?").trim().split(./\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
