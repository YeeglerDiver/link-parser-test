import { $, $$, el, esc, ico, store, segThumb, initials, cup, unexpired, failPage } from "./ui.js";
import { get, still, favicon, hostOf } from "./api.js";
import { SECTIONS, DISGUISES, ACCENTS, THEMES, AVATARS } from "./data.js";
import { VIEWS, metaRow, posterTile } from "./views.js";
import { createFilm, filmOf } from "./film.js";
import * as engine from "./engine.js";
import { N } from "./icons.js";
import { account } from "./account.js";
import { popHourly, banner } from "./ads.js";

const ready = () => engine.boot().then(() => engine.setAdblock(store.get("ads", true)));
const readySwift = () => engine.bootSwift().then(() => engine.setAdblock(store.get("ads", true)));

const SITE_SESSION = [{ host: /(^|\.)movy\.sx$/i, values: { "ads-enabled-session": "false" } }];
function presetSession(input) {
  try {
    const u = new URL(engine.normalise(input));
    for (const s of SITE_SESSION) {
      if (!s.host.test(u.hostname)) continue;
      for (const k in s.values) {
        const v = s.values[k];
        try { sessionStorage.setItem(u.host + "@" + k, v); } catch {}
        try { sessionStorage.setItem("__uv$" + u.origin + "@" + k, v); } catch {}
      }
    }
  } catch {}
}

const browser = { ...engine, boot: ready, open: (input, mode) => ready().then(() => (presetSession(input), engine.open(input, mode))) };

const root = document.documentElement;
const mq = matchMedia("(prefers-color-scheme: dark)");
let config = { films: false, play: 0 };

function applyTheme() {
  const t = THEMES.find((x) => x[0] === store.get("theme", "boba")) || THEMES[0];
  root.dataset.theme = t[2] || (mq.matches ? "dark" : "light");
  if (t[2] && t[0] !== t[2]) root.dataset.palette = t[0];
  else delete root.dataset.palette;
  applyAccent();
}
function applyAccent() {
  const pair = ACCENTS[store.get("accent", 6)] || ACCENTS[6];
  const c = root.dataset.theme === "dark" ? pair[1] : pair[0];
  const n = parseInt(c.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  root.style.setProperty("--acc", c);
  root.style.setProperty("--acc-ink", lum > 0.62 ? "#0a0e13" : "#ffffff");
}
mq.addEventListener("change", () => store.get("theme", "boba") === "system" && applyTheme());
root.dataset.fx = store.get("fx", "full");
applyTheme();

const history = {
  list: () => unexpired(store.get("history", [])),
  push(e) {
    if (!store.get("keep", true)) return;
    const key = e.key || e.kind + ":" + e.id;
    const l = this.list();
    const old = l.find((x) => x.key === key);
    store.set("history", [{ ...old, ...e, key, at: Date.now() }, ...l.filter((x) => x.key !== key)].slice(0, 60));
  },
};
const saved = {
  has: (key) => store.get("saved", []).some((x) => x.key === key),
  toggle(e) {
    const l = store.get("saved", []);
    const i = l.findIndex((x) => x.key === e.key);
    if (i > -1) l.splice(i, 1);
    else l.unshift(e);
    store.set("saved", l);
    return i < 0;
  },
};

let washOn = 0, washUrl;
function wash(url) {
  if (url === washUrl) return;
  washUrl = url;
  const layers = [$("#washA"), $("#washB")];
  if (!url) return layers.forEach((l) => l.classList.remove("on"));
  const im = new Image();
  im.onload = () => {
    if (washUrl !== url) return;
    const nxt = layers[washOn ^ 1];
    nxt.style.backgroundImage = 'url("' + url + '")';
    nxt.classList.add("on");
    layers[washOn].classList.remove("on");
    washOn ^= 1;
  };
  im.src = url;
}

const fullSrc = (t) => (t.vid ? "./api/listen/play?v=" + t.vid : "./api/listen/play?a=" + encodeURIComponent(t.artist || "") + "&t=" + encodeURIComponent(t.title || ""));
const player = {
  audio: new Audio(),
  list: [],
  i: -1,
  playing: false,
  loading: false,
  full: false,
  stall: 0,
  tok: 0,
  shuffle: false,
  repeat: false,
  subs: new Set(),
  cur() {
    return this.list[this.i] || null;
  },
  on(fn) {
    this.subs.add(fn);
  },
  emit() {
    this.subs.forEach((f) => f());
    paintMini();
  },
  play(list, i) {
    this.list = list;
    this.i = i;
    const t = this.cur();
    if (!t) return;
    clearTimeout(this.stall);
    this.full = !!config.full || !t.preview;
    this.loading = true;
    this.warmed = false;
    const tok = ++this.tok;
    if (this.full) {
      this.audio.pause();
      get(fullSrc(t))
        .then((j) => browser.open(j.u, "deep"))
        .then((src) => {
          if (tok !== this.tok) return;
          if (!src) throw new Error("no proxy");
          this.audio.src = src;
          this.audio.play().catch(() => {});
        })
        .catch(() => tok === this.tok && this.fallback());
    } else {
      this.audio.src = t.preview;
      this.audio.play().catch(() => {});
    }
    history.push({ kind: "song", key: "song:" + t.id, id: t.id, vid: t.vid || "", name: t.title, artist: t.artist, art: t.art, preview: t.preview || "" });
    this.emit();
  },
  fallback() {
    clearTimeout(this.stall);
    const t = this.cur();
    if (!t || !this.full || !t.preview) {
      this.loading = false;
      return this.emit();
    }
    this.full = false;
    this.tok++;
    this.audio.src = t.preview;
    this.audio.play().catch(() => {});
  },
  toggle() {
    if (!this.cur()) return;
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  },
  next() {
    if (!this.list.length) return;
    this.play(this.list, this.shuffle ? Math.floor(Math.random() * this.list.length) : (this.i + 1) % this.list.length);
  },
  prev() {
    if (this.audio.currentTime > 3) return (this.audio.currentTime = 0);
    if (this.list.length) this.play(this.list, (this.i - 1 + this.list.length) % this.list.length);
  },
  seek(f) {
    if (this.audio.duration) this.audio.currentTime = Math.max(0, Math.min(1, f)) * this.audio.duration;
  },
  setShuffle(v) {
    this.shuffle = v;
    this.emit();
  },
  setRepeat(v) {
    this.repeat = v;
    this.emit();
  },
};
player.audio.preload = "auto";
player.audio.volume = Math.min(1, Math.max(0, +store.get("vol", 1) || 0));
player.audio.addEventListener("play", () => {
  player.playing = true;
  clearTimeout(player.stall);
  if (player.full && player.audio.readyState < 3) player.stall = setTimeout(() => player.fallback(), 20000);
  player.emit();
});
player.audio.addEventListener("pause", () => {
  player.playing = false;
  player.loading = false;
  clearTimeout(player.stall);
  player.emit();
});
player.audio.addEventListener("waiting", () => ((player.loading = true), player.emit()));
player.audio.addEventListener("playing", () => {
  clearTimeout(player.stall);
  player.loading = false;
  player.emit();
  if (!player.full || player.warmed) return;
  player.warmed = true;
  const n = player.list[(player.i + 1) % player.list.length];
  if (n && n !== player.cur()) fetch(fullSrc(n) + "&w=1").catch(() => {});
});
player.audio.addEventListener("error", () => player.fallback());
player.audio.addEventListener("ended", () => (player.repeat ? player.play(player.list, player.i) : player.next()));

const mini = $("#mini");
function paintMini() {
  const t = player.cur();
  const show = !!t && cur !== "listen";
  mini.hidden = !show;
  if (!show) return;
  mini.innerHTML = '<img alt="" src="' + t.art.replace("600x600bb", "120x120bb") + '"><div class="mt" data-go="listen"><b>' + esc(t.title) + "</b><span>" + esc(t.artist) +
    '</span></div><button class="cb sm' + (player.loading && player.playing ? " ld" : "") + '" data-mini aria-label="' + (player.playing ? "Pause" : "Play") + '">' + ico(player.playing ? "pause" : "go") + "</button>";
}
mini.addEventListener("click", (e) => e.target.closest("[data-mini]") && player.toggle());

const scrim = $("#scrim"), sheet = $("#sheet");
let sheetFrom = null;
function flipFrom(from) {
  const r = from.getBoundingClientRect(), c = sheet.getBoundingClientRect();
  return "translate(" + (r.left - c.left) + "px," + (r.top - c.top) + "px) scale(" + r.width / c.width + "," + r.height / c.height + ")";
}
const lastFilm = (item) => history.list().find((h) => h.kind === "film" && h.type === item.type && h.id === item.id);
const epCard = (x, s, on, fb) =>
  '<button class="pst wide' + (on ? " on" : "") + '" data-ep="' + s + ":" + x.e + '"><div class="im"><img class="fade" loading="lazy" decoding="async" alt="" src="' +
  (x.still ? still(x.still, "w300") + '" data-fb="' + fb : fb) + '"></div><div class="nm">' + x.e + " · " + esc(x.name) + '</div><div class="sm">' +
  (x.runtime ? x.runtime + "m" : "") + "</div></button>";
async function paintEps(item, s) {
  const list = await get("./api/watch/season/" + item.id + "/" + s).catch(() => []);
  const rail = sheet._item === item && $("[data-eps]", sheet);
  if (!rail) return;
  const h = lastFilm(item);
  const fb = still(item.backdrop, "w300");
  rail.innerHTML = list.map((x) => epCard(x, s, !!h && h.s === s && h.e === x.e, fb)).join("");
  const on = $(".pst.on", rail);
  if (on) rail.scrollLeft = on.offsetLeft - rail.offsetLeft - 24;
}
async function openTitle(item, from) {
  history.push(filmOf(item));
  const fill = (d) => {
    const ss = (d && d.seasonList) || [];
    const h = lastFilm(item);
    const sn = h && ss.some((x) => x.n === h.s) ? h.s : ss.length ? ss[0].n : 0;
    sheet.innerHTML =
      '<div class="ban" style="background-image:url(\'' + still((d && d.backdrop) || item.backdrop, "w1280") + '\')">' +
      '<button class="cb fr x" data-x aria-label="Close">' + ico("x") + "</button>" +
      (d && d.logo ? '<img class="lg" alt="' + esc(item.name) + '" src="' + still(d.logo, "w500") + '">' : "<h2>" + esc(item.name) + "</h2>") + "</div>" +
      '<div class="bo"><div class="row1">' +
      (config.play ? '<button class="btn k" data-sp>' + ico("go") + film.label(item) + "</button>" : "") +
      '<button class="cb gh" data-ss aria-label="Save">' + ico(saved.has("film:" + item.id) ? "check" : "plus") + "</button>" +
      '<div class="mt">' + metaRow(item, d) + "</div></div>" +
      (d && d.tagline ? '<div class="tl">' + esc(d.tagline) + "</div>" : "") +
      '<p class="ov">' + esc((d && d.blurb) || item.blurb || "") + "</p>" +
      (ss.length ? "<h3>Episodes</h3>" +
        (ss.length > 1 ? '<div class="sns srl">' + ss.map((x) => '<button data-sn="' + x.n + '"' + (x.n === sn ? ' class="on"' : "") + ">S" + x.n + "</button>").join("") + "</div>" : "") +
        '<div class="rail srl" data-eps>' + Array.from({ length: 4 }, () => '<div class="pst wide"><div class="im sk"></div></div>').join("") + "</div>" : "") +
      (d && d.cast.length ? '<h3>Cast</h3><div class="cast">' + d.cast.map((c) =>
        '<div class="ca"><img class="fade" alt="" src="' + still(c.photo, "w185") + '"><b>' + esc(c.name) + "</b><span>" + esc(c.role || "") + "</span></div>").join("") + "</div>" : "") +
      (d && d.similar.length ? '<h3>More like this</h3><div class="rail srl">' + d.similar.map((m, i) => posterTile(m, "s", i)).join("") + "</div>" : "") +
      (!d ? '<div class="cast" style="margin-top:28px">' + Array.from({ length: 6 }, () => '<div class="ca"><div class="sk" style="width:72px;height:72px;border-radius:50%;margin:0 auto"></div></div>').join("") + "</div>" : "") +
      "</div>";
    sheet._item = item;
    sheet._det = d;
    if (sn) paintEps(item, sn);
  };
  fill(null);
  const wasOpen = sheet.classList.contains("on");
  scrim.classList.add("on");
  sheet.classList.add("on");
  sheet.scrollTop = 0;
  if (!wasOpen && from) {
    sheetFrom = from;
    sheet.style.transition = "none";
    sheet.style.transformOrigin = "top left";
    sheet.style.transform = flipFrom(from);
    sheet.style.opacity = ".3";
    void sheet.offsetWidth;
    sheet.style.transition = "transform .7s var(--spring), opacity .35s var(--e)";
    sheet.style.transform = "translate(-50%,-50%)";
    sheet.style.transformOrigin = "";
    sheet.style.opacity = "1";
  }
  try {
    const d = await get("./api/watch/title/" + item.type + "/" + item.id);
    if (sheet._item === item) fill(d);
  } catch {}
}
function closeSheet() {
  if (!sheet.classList.contains("on")) return;
  scrim.classList.remove("on");
  sheet.style.transition = "transform .55s var(--e), opacity .4s var(--e)";
  if (sheetFrom && sheetFrom.isConnected && sheetFrom.offsetParent) {
    sheet.style.transformOrigin = "top left";
    sheet.style.transform = flipFrom(sheetFrom);
  }
  sheet.style.opacity = "0";
  setTimeout(() => {
    sheet.classList.remove("on");
    sheet.style.transition = "none";
    sheet.style.transform = "translate(-50%,-50%)";
    sheet.style.transformOrigin = "";
    sheet.style.opacity = "";
    sheetFrom = null;
  }, 480);
}
sheet.addEventListener("click", (e) => {
  if (e.target.closest("[data-x]")) return closeSheet();
  if (e.target.closest("[data-sp]")) return film.open(sheet._item);
  const ep = e.target.closest("[data-ep]");
  if (ep) {
    const [s, n] = ep.dataset.ep.split(":").map(Number);
    return film.open(sheet._item, { s, e: n });
  }
  const sn = e.target.closest("[data-sn]");
  if (sn) {
    $$("[data-sn]", sheet).forEach((b) => b.classList.toggle("on", b === sn));
    return paintEps(sheet._item, +sn.dataset.sn);
  }
  const ss = e.target.closest("[data-ss]");
  if (ss) {
    const on = saved.toggle({ key: "film:" + sheet._item.id, ...filmOf(sheet._item) });
    ss.innerHTML = ico(on ? "check" : "plus");
    return;
  }
  const p = e.target.closest(".pst[data-r]");
  if (p && sheet._det) openTitle(sheet._det.similar[+p.dataset.i]);
});
scrim.addEventListener("click", closeSheet);

const over = $("#over");
function showOver(html, cls) {
  over.className = "over " + cls;
  over.innerHTML = html;
  void over.offsetWidth;
  over.classList.add("on");
}
function closeOver() {
  if (!over.classList.contains("on")) return false;
  film.stop();
  over.classList.remove("on");
  setTimeout(() => !over.classList.contains("on") && (over.innerHTML = ""), 450);
  const sp = sheet._item && $("[data-sp]", sheet);
  if (sp) sp.innerHTML = ico("go") + film.label(sheet._item);
  const h = sheet._item && $("[data-eps]", sheet) && lastFilm(sheet._item);
  if (h && h.s) {
    $$("[data-sn]", sheet).forEach((b) => b.classList.toggle("on", +b.dataset.sn === h.s));
    paintEps(sheet._item, h.s);
  }
  return true;
}
over.addEventListener("click", (e) => e.target.closest("[data-ox]") && closeOver());

const film = createFilm({ over, show: showOver, close: closeOver, history, music: player, boot: readySwift, sources: () => config.play || 0 });

function playGame(g) {
  history.push({ kind: "game", key: "game:" + g.id, id: g.id, name: g.name, cover: g.cover, url: g.url });
  showOver('<div class="bk" data-ox></div><div class="box"><button class="cb fr x" data-ox aria-label="Close">' + ico("x") + "</button>" +
    '<div class="gload" data-gl>' + cup() + "</div>" +
    '<iframe title="' + esc(g.name) + '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; gamepad; accelerometer; gyroscope" allowfullscreen></iframe></div>', "sq");
  const f = $("iframe", over);
  const gl = $("[data-gl]", over);
  let again = false;
  const retry = () => {
    gl?.classList.remove("off");
    browser.recover().finally(() => {
      try {
        f.contentWindow.location.reload();
      } catch {}
    });
  };
  f.addEventListener("load", () => {
    let d = null;
    try {
      d = f.contentDocument;
    } catch {}
    if (d && d.URL === "about:blank") return;
    if (browser.failed(d)) {
      if (!again) {
        again = true;
        return retry();
      }
      failPage(f, g.url, () => {
        again = false;
        retry();
      });
    }
    setTimeout(() => gl?.classList.add("off"), 400);
  });
  browser.open(g.url, "deep").then((src) => {
    if (src && f.isConnected) f.src = src;
  }, () => {});
}

const views = $("#views");
const dock = $("#dock");
const nico = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + N[k] + "</svg>";
dock.innerHTML =
  SECTIONS.map(([k, l]) => '<button class="dk" data-go="' + k + '" aria-label="' + l + '"><span class="t">' + nico(k) + "</span></button>").join("") +
  '<span class="dsep"></span>' +
  '<button class="dk me" data-go="account" aria-label="Account"><span class="t" data-me></span></button>' +
  '<button class="dk" data-go="settings" aria-label="Settings"><span class="t">' + nico("settings") + "</span></button>";
const paintMe = () => {
  const me = account.me;
  const c = me && (AVATARS[me.color] || AVATARS[0]);
  $("[data-me]", dock).innerHTML = !me ? nico("user")
    : me.pic ? '<img class="pic" alt="" src="' + esc(me.pic) + '">'
    : '<span class="pic av" style="background:linear-gradient(145deg,' + c[0] + "," + c[1] + ')">' + esc(initials(me.display)) + "</span>";
  $(".dk.me", dock).setAttribute("aria-label", me ? me.display : "Account");
};
paintMe();

let cur = null;
const ctx = {
  is: (id) => cur === id,
  go: (id) => go(id),
  wash,
  player,
  history,
  saved,
  engine: browser,
  get config() {
    return config;
  },
  openTitle,
  playTitle: (item, at) => film.open(item, at),
  playLabel: (item) => film.label(item),
  playGame,
  banner,
  openWeb(input) {
    go("home");
    const st = VIEWS.home.st;
    const t = st.tabs.find((x) => x.id === st.active);
    st.navigate(input, !!(t && t.url));
  },
  focusWeb(on) {
    $("[data-wv]").classList.toggle("max", on);
    dock.classList.toggle("hide", on);
    $("[data-wmax]").innerHTML = ico(on ? "shrink" : "expand");
  },
  setTheme(v) {
    store.set("theme", v);
    applyTheme();
  },
  setFx(v) {
    store.set("fx", v);
    root.dataset.fx = v;
  },
  setAccent(i) {
    store.set("accent", i);
    applyAccent();
  },
  disguise,
  account,
  detach() {
    const w = window.open("about:blank", "_blank");
    if (!w) return;
    const d = DISGUISES[store.get("disguise", "")] || ["Classes", "classroom.google.com"];
    w.document.write('<!doctype html><title>' + esc(d[0]) + '</title><link rel="icon" href="' + favicon(d[1]) +
      '"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style><iframe src="' + location.origin + '"></iframe>');
    w.document.close();
  },
  async wipe() {
    if (account.me) await account.leave();
    try {
      localStorage.clear();
    } catch {}
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch {}
    try {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch {}
    location.reload();
  },
};

const sections = {};
const mount = (id) => {
  if (!sections[id]) {
    const v = VIEWS[id];
    const s = el('<section class="view srl' + (v.flush ? " flush" : "") + '" data-view="' + id + '"></section>');
    s.innerHTML = v.html();
    views.appendChild(s);
    sections[id] = s;
    if (v.mount) v.mount(s, ctx);
    tick();
  }
  return sections[id];
};

function go(id) {
  if (id === cur || !VIEWS[id]) return;
  if (cur === "home" && $("[data-wv]").classList.contains("max")) ctx.focusWeb(false);
  const prev = cur && sections[cur];
  if (prev) {
    if (VIEWS[cur].leave) VIEWS[cur].leave(prev, ctx);
    prev.classList.add("out");
    prev.classList.remove("on");
    setTimeout(() => prev.classList.remove("out"), 450);
  }
  cur = id;
  store.set("view", id);
  const next = mount(id);
  void next.offsetWidth;
  next.classList.add("on");
  $$(".dk", dock).forEach((b) => b.classList.toggle("on", b.dataset.go === id));
  $$(".seg", next).forEach(segThumb);
  if (VIEWS[id].enter) VIEWS[id].enter(next, ctx);
  paintMini();
  if (id === "account") paintMe();
}

function disguise(name) {
  store.set("disguise", name || "");
  const d = DISGUISES[name];
  document.title = d ? d[0] : "Boba";
  const link = $("link[rel='icon']");
  if (link) link.href = d ? favicon(d[1]) : "./img/boba-cup.svg";
}

document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g && !e.target.closest(".sheet")) go(g.dataset.go);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && e.shiftKey) return location.replace("https://classroom.google.com");
  if (e.key === "Escape") {
    if (film.back() || closeOver()) return;
    if (sheet.classList.contains("on")) return closeSheet();
    if (cur === "home" && $("[data-wv]").classList.contains("max")) ctx.focusWeb(false);
  }
});
document.addEventListener("load", (e) => {
  const t = e.target;
  if (t.tagName === "IMG" && t.classList.contains("fade")) t.classList.add("ok");
}, true);
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t.tagName !== "IMG") return;
  const fb = t.dataset.fb;
  if (fb && t.getAttribute("src") !== fb) {
    t.removeAttribute("data-fb");
    t.src = fb;
  } else t.classList.add("ok");
}, true);
addEventListener("resize", () => $$(".view.on .seg").forEach(segThumb));

const SIDE_BEARING = { 1: 0.093, 2: 0.056, 3: 0.037, 4: 0.019, 5: 0.046, 6: 0.037, 7: 0.065, 8: 0.046, 9: 0.037 };
function tick() {
  const n = new Date();
  const H = n.getHours();
  const ck = $("[data-ck]"), ap = $("[data-ap]"), dt = $("[data-dt]");
  if (!ck) return;
  const h = String(H % 12 || 12);
  ck.textContent = h + ":" + String(n.getMinutes()).padStart(2, "0");
  ck.style.marginLeft = -SIDE_BEARING[h[0]] + "em";
  ap.textContent = H >= 12 ? "PM" : "AM";
  dt.innerHTML = "<b>" + n.toLocaleDateString("en-GB", { weekday: "long" }) + "</b> " + n.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}
setInterval(tick, 1000);
tick();

disguise(store.get("disguise", ""));
popHourly();

account.on(() => {
  paintMe();
  applyTheme();
  root.dataset.fx = store.get("fx", "full");
  engine.setAdblock(store.get("ads", true));
  if (cur && VIEWS[cur].enter) VIEWS[cur].enter(sections[cur], ctx);
});
account.boot();

get("./api/config")
  .then((c) => (config = c))
  .catch(() => {})
  .finally(() => {
    const first = store.get("view", "home");
    go(VIEWS[first] ? first : "home");
    setTimeout(() => {
      const intro = $("#intro");
      intro.classList.add("gone");
      setTimeout(() => intro.remove(), 800);
    }, 900);
  });
