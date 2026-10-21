import { $, $$, esc, ico, store, cup } from "./ui.js";
import { get, still } from "./api.js";
import { ACCENTS } from "./data.js";

const SANDBOX = "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-same-origin allow-scripts allow-presentation allow-downloads";
const BROKEN = /sandbox not allowed|playback error|error processing your request|rate.?limit|too many requests/i;
const EMPTY = /not (be )?found|no sources?|unavailable|not available|could ?n.t find|\b404\b/i;
const WAIT = 35000;

export const filmOf = (m) => ({
  kind: "film", id: m.id, type: m.type, name: m.name, year: m.year, score: m.score,
  poster: m.poster, backdrop: m.backdrop, genres: m.genres || [], blurb: m.blurb,
});

const docsOf = (doc, out = [], depth = 0) => {
  out.push(doc);
  if (depth < 3)
    for (const f of doc.querySelectorAll("iframe")) {
      let d = null;
      try {
        d = f.contentDocument;
      } catch {}
      if (d && d.documentElement) docsOf(d, out, depth + 1);
    }
  return out;
};

const videoIn = (docs) => {
  let best = null;
  for (const d of docs)
    for (const v of d.querySelectorAll("video"))
      if ((v.currentSrc || v.src) && (!best || (v.duration || 0) > (best.duration || 0))) best = v;
  return best;
};

export function createFilm({ over, show, close, history, music, boot, sources }) {
  const st = {
    item: null, det: null, s: 1, e: 1, n: 0, tried: new Set(), tok: 0, tick: 0, t0: 0, last: 0, seen: 0, srcAt: 0, prev: null,
    retried: false, live: null, kick: false, from: 0, beats: 0, hooked: new WeakSet(),
  };

  const tv = () => !!st.item && st.item.type === "tv";
  const frame = () => $(".pv iframe", over);
  const pref = () => Math.max(0, Math.min(store.get("src", 0), sources() - 1));
  const seasons = () => (st.det && st.det.seasonList) || [];
  const episodes = (s) => get("./api/watch/season/" + st.item.id + "/" + s).catch(() => []);
  const last = (item) => history.list().find((h) => h.kind === "film" && h.type === item.type && h.id === item.id);
  const fresh = (h) => !!h && h.t > 60 && h.d > 600 && h.t < h.d - 120;
  const color = () => (ACCENTS[store.get("accent", 6)] || ACCENTS[6])[1].slice(1);

  function label(item) {
    const h = last(item);
    const verb = fresh(h) ? "Resume" : "Play";
    return item.type === "tv" ? verb + " S" + ((h && h.s) || 1) + " E" + ((h && h.e) || 1) : verb;
  }

  function remember(extra) {
    if (st.item) history.push({ ...filmOf(st.item), ...(tv() ? { s: st.s, e: st.e } : {}), ...extra });
  }

  const url = (n, again) =>
    "./api/watch/go/" + n + "/" + st.item.type + "/" + st.item.id + (tv() ? "/" + st.s + "/" + st.e : "") +
    "?c=" + color() + (again ? "&r=" + Date.now() : "");

  const layer = (on) => $("[data-ld]", over)?.classList.toggle("off", !on);
  const blocked = (on) => {
    const u = $("[data-un]", over);
    if (u) u.hidden = !on;
  };

  function paintSources() {
    $$("[data-psrc]", over).forEach((b) => b.classList.toggle("on", +b.dataset.psrc === st.n));
  }

  async function load(n, again) {
    const tok = ++st.tok;
    clearInterval(st.tick);
    if (!again) st.retried = false;
    st.n = n;
    st.live = null;
    st.kick = false;
    st.seen = 0;
    st.srcAt = 0;
    st.beats = 0;
    paintSources();
    blocked(false);
    layer(true);
    try {
      await boot();
    } catch {
      if (tok === st.tok) unavailable();
      return;
    }
    const f = frame();
    if (tok !== st.tok || !f) return;
    st.prev = f.contentDocument;
    st.t0 = st.last = Date.now();
    f.src = url(n, again);
    st.tick = setInterval(() => check(tok), 1500);
  }

  function check(tok) {
    if (tok !== st.tok || !st.item) return clearInterval(st.tick);
    const now = Date.now();
    if (document.hidden) {
      st.t0 += now - st.last;
      if (st.srcAt) st.srcAt += now - st.last;
    }
    st.last = now;
    const f = frame();
    let doc = null;
    try {
      doc = f && f.contentDocument;
    } catch {}
    const late = Date.now() - st.t0 > WAIT;
    if (!doc || doc === st.prev || !doc.documentElement) return late && !st.live && next();
    st.seen = st.seen || Date.now();
    const docs = docsOf(doc);
    docs.forEach(hook);
    const v = videoIn(docs);
    if (st.live) return v && playing(v);
    if (doc.documentElement.hasAttribute("data-stall") || doc.getElementById("errorTrace")) return fault();
    if (v) {
      if (!st.srcAt) {
        st.srcAt = Date.now();
        layer(false);
      }
      if (v.readyState >= 2 || v.currentTime > 0) {
        st.live = v;
        return playing(v);
      }
      return Date.now() - st.srcAt > 20000 && next();
    }
    const text = docs.map((d) => (d.body && d.body.innerText) || "").join(" ").slice(0, 4000);
    if (BROKEN.test(text) || (text.trim().length < 300 && EMPTY.test(text))) return fault();
    if (Date.now() - st.seen > 15000) layer(false);
    if (late) next();
  }

  function playing(v) {
    if (!(v.duration > 600)) return;
    if (st.from && v.readyState >= 1) {
      try {
        v.currentTime = st.from;
      } catch {}
      st.from = 0;
    }
    if (!st.kick && v.readyState >= 3) {
      st.kick = true;
      if (v.paused) v.play().catch(() => {});
    }
    if (++st.beats % 3 === 0 && v.currentTime > 5) remember({ t: Math.floor(v.currentTime), d: Math.floor(v.duration) });
  }

  function fault() {
    if (st.retried) return next();
    st.retried = true;
    load(st.n, true);
  }

  function next() {
    const k = sources();
    for (let i = 1; i <= k; i++) {
      const n = (st.n + i) % k;
      if (st.tried.has(n)) continue;
      st.tried.add(n);
      return load(n);
    }
    unavailable();
  }

  function unavailable() {
    ++st.tok;
    clearInterval(st.tick);
    const f = frame();
    if (f) f.src = "about:blank";
    layer(false);
    blocked(true);
  }

  function hook(doc) {
    if (st.hooked.has(doc)) return;
    st.hooked.add(doc);
    doc.addEventListener("pointerdown", () => {
      st.t0 = Date.now();
      if (st.srcAt) st.srcAt = st.t0;
    }, true);
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !doc.fullscreenElement && !document.fullscreenElement) close();
    }, true);
  }

  async function near(dir) {
    if (!tv()) return null;
    const list = await episodes(st.s);
    const i = list.findIndex((x) => x.e === st.e);
    if (i > -1 && list[i + dir]) return { s: st.s, e: list[i + dir].e };
    const ss = seasons();
    const ns = ss[ss.findIndex((x) => x.n === st.s) + dir];
    if (!ns) return null;
    const nl = await episodes(ns.n);
    return nl.length ? { s: ns.n, e: (dir > 0 ? nl[0] : nl[nl.length - 1]).e } : null;
  }

  async function paintSub() {
    const sub = $("[data-psub]", over);
    if (!sub || !st.item) return;
    if (!tv()) {
      sub.textContent = st.item.year || "";
      return;
    }
    const pe = $("[data-pepi]", over);
    if (pe) pe.textContent = "S" + st.s + " E" + st.e;
    const { s, e } = st;
    const x = (await episodes(s)).find((y) => y.e === e);
    if (st.s === s && st.e === e) sub.textContent = x ? x.name : "";
  }

  async function paintSteps() {
    const { s, e } = st;
    const [p, n] = await Promise.all([near(-1), near(1)]);
    if (st.s !== s || st.e !== e) return;
    $$("[data-pstep]", over).forEach((b) => (b.disabled = !(+b.dataset.pstep < 0 ? p : n)));
  }

  async function openEps(s) {
    const box = $("[data-peps]", over);
    if (!box) return;
    const ss = seasons();
    box.innerHTML =
      (ss.length > 1 ? '<div class="sns srl">' + ss.map((x) => '<button data-psn="' + x.n + '"' + (x.n === s ? ' class="on"' : "") + ">S" + x.n + "</button>").join("") + "</div>" : "") +
      '<div class="epl srl" data-epl></div>';
    box.classList.add("on");
    const list = await episodes(s);
    const l = $("[data-epl]", box);
    if (!l) return;
    l.innerHTML = list.map((x) =>
      '<button class="epr' + (s === st.s && x.e === st.e ? " on" : "") + '" data-pgo="' + s + ":" + x.e + '"><span class="th"><img class="fade" alt="" src="' +
      (x.still ? still(x.still, "w185") : still(st.item.backdrop, "w300")) + '"></span><span class="tx"><b>' + x.e + " · " + esc(x.name) + "</b><small>" +
      (x.runtime ? x.runtime + "m" : "") + "</small></span></button>").join("");
    const on = $(".epr.on", l);
    if (on) l.scrollTop = on.offsetTop - l.clientHeight / 2 + on.offsetHeight / 2;
  }
  const closeEps = () => $("[data-peps]", over)?.classList.remove("on");

  function jump(s, e) {
    const h = last(st.item);
    st.s = s;
    st.e = e;
    st.from = h && h.s === s && h.e === e && fresh(h) ? h.t : 0;
    remember(st.from ? {} : { t: 0, d: 0 });
    closeEps();
    paintSub();
    paintSteps();
    st.tried = new Set([pref()]);
    load(pref());
  }

  const markup = (item) =>
    '<div class="bk"></div><div class="pv">' +
    '<div class="pbar"><div class="pt"><b>' + esc(item.name) + '</b><span data-psub></span></div><div class="pc">' +
    (item.type === "tv"
      ? '<div class="pgrp"><button data-pstep="-1" aria-label="Previous episode" disabled>' + ico("left") + '</button><button class="pe" data-pepi aria-label="Episodes"></button>' +
        '<button data-pstep="1" aria-label="Next episode" disabled>' + ico("right") + "</button></div>"
      : "") +
    (sources() > 1
      ? '<div class="pgrp">' + Array.from({ length: sources() }, (_, i) => '<button data-psrc="' + i + '" aria-label="Source ' + (i + 1) + '">' + (i + 1) + "</button>").join("") + "</div>"
      : "") +
    '</div><button class="cb sm fr" data-ox aria-label="Close">' + ico("x") + "</button></div>" +
    '<div class="box"><iframe title="' + esc(item.name) + '" sandbox="' + SANDBOX + '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
    '<div class="ld" data-ld style="background-image:url(\'' + still(item.backdrop, "w1280") + '\')"><div class="lc" data-lc><h2>' + esc(item.name) + "</h2>" + cup() + "</div></div>" +
    '<div class="un" data-un hidden><b>Not playing right now</b><button class="btn w s" data-pretry>' + ico("reload") + "Try again</button></div></div>" +
    (item.type === "tv" ? '<div class="peps gl g3" data-peps></div>' : "") +
    "</div>";

  async function open(item, at) {
    const h = last(item);
    st.item = item;
    st.det = null;
    st.s = (at && at.s) || (h && h.s) || 1;
    st.e = (at && at.e) || (h && h.e) || 1;
    st.from = fresh(h) && (item.type !== "tv" || (h.s === st.s && h.e === st.e)) ? h.t : 0;
    remember(st.from ? {} : { t: 0, d: 0 });
    if (music.playing) music.audio.pause();
    show(markup(item), "pl");
    paintSub();
    paintSteps();
    st.tried = new Set([pref()]);
    load(pref());
    const d = await get("./api/watch/title/" + item.type + "/" + item.id).catch(() => null);
    if (st.item !== item || !d) return;
    st.det = d;
    const h2 = d.logo && $("[data-lc] h2", over);
    if (h2) h2.outerHTML = '<img alt="' + esc(item.name) + '" src="' + still(d.logo, "w500") + '">';
    paintSteps();
  }

  function stop() {
    ++st.tok;
    clearInterval(st.tick);
    frame()?.remove();
    st.item = null;
    st.live = null;
  }

  function back() {
    const p = $("[data-peps].on", over);
    if (!p) return false;
    closeEps();
    return true;
  }

  over.addEventListener("click", (e) => {
    if (!st.item) return;
    const t = e.target;
    if (!t.closest("[data-peps]") && !t.closest("[data-pepi]")) closeEps();
    const b = t.closest("[data-psrc],[data-pstep],[data-pepi],[data-psn],[data-pgo],[data-pretry]");
    if (!b) return;
    const d = b.dataset;
    if (d.psrc !== undefined) {
      store.set("src", +d.psrc);
      st.tried = new Set([+d.psrc]);
      return load(+d.psrc);
    }
    if (d.pstep) return near(+d.pstep).then((x) => x && jump(x.s, x.e));
    if (d.pepi !== undefined) return $("[data-peps].on", over) ? closeEps() : openEps(st.s);
    if (d.psn) return openEps(+d.psn);
    if (d.pgo) {
      const [s, ep] = d.pgo.split(":").map(Number);
      return jump(s, ep);
    }
    if (d.pretry !== undefined) {
      st.tried = new Set([pref()]);
      load(pref());
    }
  });

  return { open, stop, label, back };
}
