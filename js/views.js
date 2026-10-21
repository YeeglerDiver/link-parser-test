import { $, $$, el, esc, ico, cup, store, clockText, debounce, segThumb, initials, failPage } from "./ui.js";
import { get, still, favicon, hostOf } from "./api.js";
import { md, diagrams } from "./md.js";
import { readPhoto, readDoc, isPhoto } from "./attach.js";
import { FAVS, DISGUISES, ACCENTS, THEMES, AVATARS } from "./data.js";
import { N } from "./icons.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runtime = (d) => {
  if (!d) return "";
  if (d.type === "tv") return d.seasons ? d.seasons + (d.seasons === 1 ? " season" : " seasons") : "";
  if (!d.runtime) return "";
  const h = Math.floor(d.runtime / 60), m = d.runtime % 60;
  return (h ? h + "h " : "") + m + "m";
};
const metaRow = (item, d) => {
  const parts = [];
  const score = (d && d.score) || item.score;
  if (score && score !== "0.0") parts.push('<span class="sc">' + ico("star") + score + "</span>");
  if (d && d.cert) parts.push('<span class="rt">' + esc(d.cert) + "</span>");
  if (item.year) parts.push("<span>" + item.year + "</span>");
  const rt = runtime(d);
  if (rt) parts.push("<span>" + rt + "</span>");
  const g = ((d && d.genres) || item.genres || []).slice(0, 2).join(", ");
  if (g) parts.push("<span>" + esc(g) + "</span>");
  return parts.join('<span class="dot"></span>');
};
const posterTile = (m, r, i, wide) =>
  '<button class="pst' + (wide ? " wide" : "") + '" data-r="' + r + '" data-i="' + i + '" data-id="' + m.id + '"><div class="im"><img class="fade" loading="lazy" decoding="async" alt="" src="' +
  (wide ? still(m.backdrop, "w500") : still(m.poster, "w342")) + '"></div><div class="nm">' + esc(m.name) + '</div><div class="sm">' +
  esc([m.year, (m.genres || [])[0]].filter(Boolean).join(" · ")) + "</div></button>";
function brick(root, wall, { want, phone, tile, square, done }) {
  const b = { items: [], cols: 0, placed: 0, row: 0 };
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target.src = e.target.dataset.src;
    }
  }, { root, rootMargin: "300px 0px" });
  const size = () => {
    const w = wall.clientWidth || root.clientWidth - 40;
    const small = w < 520, gap = small ? 10 : 16, aim = small ? phone : want;
    const cols = Math.max(3, Math.floor((w + gap) / (aim + gap)));
    wall.style.setProperty("--pw", Math.min(Math.floor((w - (cols - 1) * gap) / cols), Math.round(aim * 1.2)) + "px");
    wall.style.setProperty("--gap", gap + "px");
    return cols;
  };
  const fill = () => {
    const last = wall.lastElementChild;
    if (last && last.childElementCount < +last.dataset.n) {
      b.placed -= last.childElementCount;
      b.row--;
      last.querySelectorAll("img").forEach((im) => io.unobserve(im));
      last.remove();
    }
    const from = wall.childElementCount;
    let html = "";
    while (b.placed < b.items.length) {
      const n = b.row % 2 ? b.cols : b.cols - 1;
      const part = b.items.slice(b.placed, b.placed + n);
      html += '<div class="mw-row" data-n="' + n + '">' + part.map((m, k) => tile(m, b.placed + k)).join("") + "</div>";
      b.placed += part.length;
      b.row++;
    }
    wall.insertAdjacentHTML("beforeend", html);
    for (const r of [...wall.children].slice(from)) r.querySelectorAll("img[data-src]").forEach((im) => io.observe(im));
    if (done) done();
  };
  b.layout = (force) => {
    const cols = size();
    if (!force && cols === b.cols) return;
    b.cols = cols;
    b.placed = 0;
    b.row = 0;
    io.disconnect();
    wall.innerHTML = "";
    fill();
  };
  b.reset = (items) => {
    b.items = items.slice();
    b.layout(true);
  };
  b.add = (items) => {
    b.items.push(...items);
    if (b.cols) fill();
    else b.layout(true);
  };
  b.skeleton = () => {
    const cols = size();
    b.cols = 0;
    io.disconnect();
    wall.innerHTML = [cols - 1, cols, cols - 1].map((n) => '<div class="mw-row">' + ('<div class="mw-p' + (square ? " sq" : "") + ' sk"></div>').repeat(n) + "</div>").join("");
  };
  new ResizeObserver(() => b.items.length && b.layout(false)).observe(wall);
  return b;
}

const QL_MAX = 12;
const qlLinks = () => {
  const v = store.get("links", null);
  return Array.isArray(v) ? v.filter((x) => Array.isArray(x) && typeof x[1] === "string") : FAVS.map(([n, , u]) => [n, u]);
};
const qlHtml = () => {
  const list = qlLinks();
  return list.map(([n, u], i) => {
    const d = hostOf(u);
    const own = FAVS.find((f) => f[1] === d);
    const img = own ? '<img class="fade" alt="" src="./img/sites/' + esc(d) + '.png">' : '<img class="fade" alt="" src="' + esc(favicon(d)) + '" data-fb="./api/icon?d=' + encodeURIComponent(d) + '">';
    return '<span class="qw"><button class="qi" data-open="' + esc(u) + '" aria-label="' + esc(n) + '" title="' + esc(n) + '">' + img + "</button>" +
      '<button class="qx" data-qx="' + i + '" aria-label="Remove ' + esc(n) + '">' + ico("x") + "</button></span>";
  }).join("") + (list.length < QL_MAX ? '<button class="qi qa" data-qa aria-label="Add" title="Add"><i>' + ico("plus") + "</i></button>" : "");
};
const qlKey = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(./^www\./, "") + x.pathname.replace(./\/+$/, "") + x.search;
  } catch {
    return u;
  }
};
const linkOf = (raw) => {
  const s = String(raw || "").trim();
  if (!s || /\s/.test(s)) return "";
  try {
    const u = new URL(./^https?:\/\//i.test(s) ? s : "https://" + s);
    return /^https?:$/.test(u.protocol) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) ? u.href : "";
  } catch {
    return "";
  }
};

const home = {
  flush: true,
  html: () =>
    '<div class="wv bare" data-wv>' +
    '<div class="wbar">' +
    '<button class="cb sm gh" data-wb="back" aria-label="Back">' + ico("back") + "</button>" +
    '<button class="cb sm gh" data-wb="fwd" aria-label="Forward">' + ico("fwd") + "</button>" +
    '<button class="cb sm gh" data-wb="reload" aria-label="Reload">' + ico("reload") + "</button>" +
    '<label class="addr">' + ico("lock") + '<input data-omni placeholder="Search or enter a link" aria-label="Address" autocomplete="off" spellcheck="false">' +
    '<span class="disp" data-disp></span><div class="sugg gl g3" data-sugg></div></label>' +
    '<span class="wsep"></span><div class="wtabs" data-tabs></div>' +
    '<button class="cb sm gh" data-wnew aria-label="New tab">' + ico("plus") + "</button>" +
    '<button class="cb sm gh" data-wmax aria-label="Full screen">' + ico("expand") + "</button></div>" +
    '<span class="wtip" data-tip></span>' +
    '<div class="page" data-page><div class="gload off" data-bl>' + cup() + '</div><div class="home" data-nt>' +
    '<div class="hwm"><img alt="" src="./img/boba-cup.svg"></div><div class="hcol"><div class="clock">' +
    '<div class="t num r"><span data-ck></span><i data-ap></i></div>' +
    '<div class="d r" style="--d:.03s" data-dt></div></div>' +
    '<label class="big-q r" style="--d:.06s">' + ico("search") + '<input data-bq placeholder="Search or enter a link" aria-label="Search or enter a link" autocomplete="off" spellcheck="false"></label>' +
    '<div class="ql r" style="--d:.09s" data-ql>' + qlHtml() + "</div>" +
    '<form class="qf" data-qf hidden><label class="big-q">' + ico("link") + '<input data-qin placeholder="Paste a link" aria-label="Paste a link" autocomplete="off" spellcheck="false" inputmode="url">' +
    '<button class="qok" type="submit" aria-label="Add">' + ico("plus") + "</button></label></form>" +
    "</div></div></div></div>",
  mount(root, ctx) {
    const st = (this.st = { tabs: [], active: 0, next: 1 });
    const wv = $("[data-wv]", root);
    const page = $("[data-page]", root);
    const nt = $("[data-nt]", root);
    const omni = $("[data-omni]", root);
    const sugg = $("[data-sugg]", root);
    const bl = $("[data-bl]", root);
    const addr = $(".addr", root);
    const disp = $("[data-disp]", root);
    const tabsEl = $("[data-tabs]", root);
    const tip = $("[data-tip]", root);
    const tab = () => st.tabs.find((t) => t.id === st.active);
    const clean = (s) => String(s || "").split(./\s+[-–·|]\s+/)[0].trim();
    const readable = (s) => {
      try {
        return decodeURI(s);
      } catch {
        return s;
      }
    };

    const sync = () => {
      const t = tab();
      bl.classList.toggle("off", !(t && t.busy));
    };
    const track = (t) => {
      let d = null;
      try {
        d = t.frame.contentDocument;
      } catch {}
      if (!d || d.URL === "about:blank") return;
      const read = () => {
        let real = "";
        try {
          real = ctx.engine.decode(t.frame.contentWindow.location.href);
        } catch {}
        const name = clean(d.title);
        const moved = !!real && real !== t.url;
        if (moved) {
          t.url = real;
          t.title = hostOf(real) || t.title;
          ctx.history.push({ kind: "site", key: "site:" + t.title, name: t.title, url: real });
        }
        if (moved || name !== t.name) {
          t.name = name;
          paint();
        }
      };
      read();
      if (t.doc === d) return;
      t.doc = d;
      const ttl = d.querySelector("title");
      if (ttl) new MutationObserver(read).observe(ttl, { childList: true, characterData: true, subtree: true });
    };
    const retry = (t) => {
      t.busy = true;
      sync();
      ctx.engine.recover().finally(() => {
        loading(t);
        try {
          t.frame.contentWindow.location.reload();
        } catch {
          t.frame.src = t.frame.src;
        }
      });
    };
    const loaded = (t) => {
      clearInterval(t.lt);
      let d = null;
      try {
        d = t.frame.contentDocument;
      } catch {}
      if (ctx.engine.failed(d)) {
        if (!t.again) {
          t.again = true;
          return retry(t);
        }
        failPage(t.frame, t.url, () => {
          t.again = false;
          retry(t);
        });
      } else if (d && d.URL !== "about:blank") t.again = false;
      t.busy = false;
      sync();
      track(t);
      try {
        t.frame.contentWindow.addEventListener("beforeunload", () => loading(t));
      } catch {}
    };
    const loading = (t) => {
      clearInterval(t.lt);
      t.busy = true;
      let old = null;
      try {
        old = t.frame.contentDocument;
      } catch {}
      const t0 = Date.now();
      t.lt = setInterval(() => {
        let d = null;
        try {
          d = t.frame.contentDocument;
        } catch {}
        const fresh = d && d !== old && d.URL !== "about:blank";
        const painted = fresh && (d.readyState !== "loading" || (d.body && d.body.childElementCount && [...d.querySelectorAll("head link[rel~=stylesheet]")].every((l) => l.sheet)));
        if (painted || Date.now() - t0 > 15000) loaded(t);
      }, 200);
      sync();
    };

    const paint = () => {
      wv.classList.toggle("bare", !st.tabs.length);
      if (!st.tabs.length && wv.classList.contains("max")) ctx.focusWeb(false);
      tabsEl.innerHTML = st.tabs.map((t) =>
        '<button class="wtab' + (t.id === st.active ? " on" : "") + '" data-tab="' + t.id + '" aria-label="' + esc(t.name || t.title) + '">' +
        (t.url ? '<img alt="" src="' + favicon(hostOf(t.url)) + '">' : '<span class="ph"></span>') +
        '<span class="x" data-close>' + ico("x") + "</span></button>").join("");
      const t = tab();
      nt.style.visibility = t && t.url ? "hidden" : "";
      st.tabs.forEach((x) => x.frame && (x.frame.style.display = x.id === st.active && x.url ? "block" : "none"));
      if (document.activeElement !== omni) omni.value = t && t.url ? t.url : "";
      show();
      sync();
    };
    const show = () => {
      const t = tab();
      let u = null;
      try {
        u = t && t.url && document.activeElement !== omni && omni.value === t.url ? new URL(t.url) : null;
      } catch {}
      addr.classList.toggle("show", !!u);
      if (u) disp.innerHTML = "<b>" + esc(u.host.replace(./^www\./, "")) + "</b><span>" + esc(readable((u.pathname + u.search + u.hash).replace(./\/$/, ""))) + "</span>";
    };
    const closeTab = (id) => {
      const i = st.tabs.findIndex((t) => t.id === id);
      if (i < 0) return;
      clearInterval(st.tabs[i].lt);
      if (st.tabs[i].frame) st.tabs[i].frame.remove();
      st.tabs.splice(i, 1);
      if (st.active === id && st.tabs.length) st.active = st.tabs[Math.min(i, st.tabs.length - 1)].id;
      tip.classList.remove("on");
      paint();
    };

    const newTab = () => {
      const t = { id: st.next++, title: "New tab", url: "", frame: null };
      st.tabs.push(t);
      st.active = t.id;
      paint();
      return t;
    };

    const navigate = async (input, fresh) => {
      const url = ctx.engine.normalise(input);
      if (!url) return;
      const t = fresh || !tab() ? newTab() : tab();
      t.title = hostOf(url) || "Page";
      loading(t);
      paint();
      let src = "";
      try {
        src = await ctx.engine.open(url, store.get("mode", "deep"));
      } catch {}
      if (!src) {
        t.title = t.url ? hostOf(t.url) || "Page" : "New tab";
        loaded(t);
        return paint();
      }
      t.url = url;
      if (!t.frame) {
        t.frame = el('<iframe title="Page" allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-popups-to-escape-sandbox allow-pointer-lock"></iframe>');
        t.frame.addEventListener("load", () => {
          try {
            if (t.frame.contentWindow.location.href === "about:blank") return;
          } catch {}
          loaded(t);
        });
        page.appendChild(t.frame);
      }
      loading(t);
      t.frame.src = src;
      ctx.history.push({ kind: "site", key: "site:" + t.title, name: t.title, url });
      paint();
    };
    st.navigate = navigate;

    const hideSugg = () => sugg.classList.remove("on");
    const suggest = debounce(async () => {
      const q = omni.value.trim();
      if (q.length < 2) return hideSugg();
      try {
        const list = await get("./api/suggest?q=" + encodeURIComponent(q));
        if (!list.length || document.activeElement !== omni) return hideSugg();
        sugg.innerHTML = list.map((s) => "<div>" + ico("search") + "<span>" + esc(s) + "</span></div>").join("");
        sugg.classList.add("on");
      } catch {
        hideSugg();
      }
    }, 160);
    omni.addEventListener("input", suggest);
    let picked = false;
    const warm = () => ctx.engine.boot().catch(() => {});
    omni.addEventListener("focus", () => {
      addr.classList.remove("show");
      omni.select();
      picked = true;
      warm();
    });
    omni.addEventListener("mouseup", (e) => {
      if (picked) e.preventDefault();
      picked = false;
    });
    omni.addEventListener("blur", () => {
      picked = false;
      show();
      setTimeout(hideSugg, 140);
    });
    tabsEl.addEventListener("pointerover", (e) => {
      const b = e.target.closest("[data-tab]");
      const t = b && st.tabs.find((x) => x.id === +b.dataset.tab);
      if (!t) return;
      tip.textContent = t.name || t.title;
      const r = b.getBoundingClientRect(), w = wv.getBoundingClientRect(), half = tip.offsetWidth / 2;
      tip.style.left = Math.min(Math.max(r.left + r.width / 2 - w.left, half + 8), w.width - half - 8) + "px";
      tip.style.top = r.bottom - w.top + 8 + "px";
      tip.classList.add("on");
    });
    tabsEl.addEventListener("pointerleave", () => tip.classList.remove("on"));
    tabsEl.addEventListener("mousedown", (e) => e.button === 1 && e.preventDefault());
    tabsEl.addEventListener("auxclick", (e) => {
      const b = e.button === 1 && e.target.closest("[data-tab]");
      if (b) closeTab(+b.dataset.tab);
    });
    omni.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        hideSugg();
        omni.blur();
        navigate(omni.value);
      }
      if (e.key === "Escape") hideSugg();
    });
    sugg.addEventListener("mousedown", (e) => {
      const d = e.target.closest("div");
      if (!d) return;
      e.preventDefault();
      hideSugg();
      navigate(d.textContent);
    });
    const bq = $("[data-bq]", root);
    bq.addEventListener("focus", warm);
    bq.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      navigate(e.target.value);
      e.target.value = "";
    });

    const ql = $("[data-ql]", root), qf = $("[data-qf]", root), qin = $("[data-qin]", root);
    const qlClose = () => {
      qf.hidden = true;
      qf.classList.remove("bad");
      ql.hidden = false;
    };
    store.watch((k) => {
      if (k === "links") ql.innerHTML = qlHtml();
    });
    ql.addEventListener("click", (e) => {
      const x = e.target.closest("[data-qx]");
      if (x) {
        const list = qlLinks();
        list.splice(+x.dataset.qx, 1);
        return store.set("links", list);
      }
      if (!e.target.closest("[data-qa]")) return;
      ql.classList.remove("edit");
      ql.hidden = true;
      qf.hidden = false;
      qin.value = "";
      qin.focus();
    });
    ql.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".qw")) return;
      e.preventDefault();
      ql.classList.toggle("edit");
    });
    document.addEventListener("pointerdown", (e) => {
      if (!ql.contains(e.target)) ql.classList.remove("edit");
    });
    qf.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = linkOf(qin.value);
      if (!u) {
        qf.classList.add("bad");
        return qin.focus();
      }
      const list = qlLinks();
      if (!list.some((x) => qlKey(x[1]) === qlKey(u)) && list.length < QL_MAX) store.set("links", [...list, [hostOf(u), u]]);
      qlClose();
    });
    $(".qok", qf).addEventListener("mousedown", (e) => e.preventDefault());
    qin.addEventListener("input", () => qf.classList.remove("bad"));
    qin.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      qlClose();
      $("[data-qa]", ql)?.focus();
    });
    qf.addEventListener("focusout", (e) => {
      if (qf.contains(e.relatedTarget)) return;
      setTimeout(() => {
        if (document.hasFocus() && !qf.contains(document.activeElement)) qlClose();
      });
    });

    root.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if (close) return closeTab(+close.closest("[data-tab]").dataset.tab);
      const tb = e.target.closest("[data-tab]");
      if (tb) {
        st.active = +tb.dataset.tab;
        return paint();
      }
      if (e.target.closest("[data-wnew]")) return newTab();
      if (e.target.closest("[data-wmax]")) return ctx.focusWeb(!wv.classList.contains("max"));
      const nb = e.target.closest("[data-wb]");
      if (nb) {
        const t = tab();
        if (!t || !t.frame) return;
        try {
          if (nb.dataset.wb === "back") t.frame.contentWindow.history.back();
          if (nb.dataset.wb === "fwd") t.frame.contentWindow.history.forward();
          if (nb.dataset.wb === "reload") t.frame.contentWindow.location.reload();
        } catch {
          if (nb.dataset.wb === "reload") t.frame.src = t.frame.src;
        }
        return;
      }
      const f = e.target.closest("[data-open]");
      if (f) navigate(f.dataset.open);
    });
    paint();
  },
  enter(root, ctx) {
    ctx.wash(null);
  },
};

const watch = {
  html: () =>
    '<div class="mw"><div class="mw-bar r"><div class="mw-tabs" data-kind role="tablist">' +
    '<button class="mw-tab on" type="button" role="tab" aria-selected="true" data-k="movie">' + ico("watch") + "Movies</button>" +
    '<button class="mw-tab" type="button" role="tab" aria-selected="false" data-k="tv">' + ico("tv") + "TV Shows</button></div>" +
    '<label class="mw-q">' + ico("search") + '<input data-wq type="search" placeholder="Search…" aria-label="Search" autocomplete="off" spellcheck="false"></label></div>' +
    '<div class="adb" data-adb></div><p class="mw-note" data-wnote hidden></p><div class="mw-wall r" style="--d:.06s" data-wall></div><div class="mw-end" data-wend></div></div>',
  mount(root, ctx) {
    const st = (this.st = { type: "movie", q: "", seen: new Set(), page: 1, more: false, busy: false, tok: 0, loaded: false });
    const note = $("[data-wnote]", root), qIn = $("[data-wq]", root), kind = $("[data-kind]", root), end = $("[data-wend]", root);
    const tile = (m, i) =>
      '<div class="mw-p" role="button" tabindex="0" data-i="' + i + '" aria-label="' + esc(m.name) + '"><img class="fade" decoding="async" alt="" data-src="' + still(m.poster, "w342") + '">' +
      (ctx.config.play ? '<span class="mw-go" data-go>' + ico("go") + "</span>" : "") +
      '<span class="mw-i"><b>' + esc(m.name) + "</b><span>" + (m.score && m.score !== "0.0" ? ico("star") + esc(m.score) + " · " : "") + esc(m.year || "") + "</span></span></div>";
    const wall = brick(root, $("[data-wall]", root), { want: 142, phone: 106, tile });
    const fresh = (list) => (list || []).filter((m) => m && m.poster && !st.seen.has(m.id) && st.seen.add(m.id));
    const near = () => end.getBoundingClientRect().top < root.getBoundingClientRect().bottom + 900;
    const more = async () => {
      if (st.busy || !st.more || st.q) return;
      st.busy = true;
      const tok = st.tok, page = st.page + 1;
      try {
        const d = await get("./api/watch/more?type=" + st.type + "&page=" + page);
        if (tok !== st.tok) return;
        st.page = page;
        st.more = !!d.more;
        wall.add(fresh(d.items));
      } catch {
        if (tok === st.tok) st.more = false;
      } finally {
        if (tok === st.tok) st.busy = false;
      }
      if (tok === st.tok && near()) more();
    };
    const load = async (type, q) => {
      const tok = ++st.tok;
      Object.assign(st, { type, q, seen: new Set(), page: 1, more: false, busy: true });
      note.hidden = true;
      wall.items = [];
      wall.skeleton();
      try {
        const list = q ? (await get("./api/watch/search?type=" + type + "&q=" + encodeURIComponent(q))).items : (await get("./api/watch/home?type=" + type)).rows.flatMap((r) => r.items);
        if (tok !== st.tok) return;
        st.more = !q;
        st.busy = false;
        wall.reset(fresh(list));
        if (q && !wall.items.length) {
          note.textContent = "Nothing found for “" + q + "”";
          note.hidden = false;
          return;
        }
        if (near()) more();
      } catch {
        if (tok !== st.tok) return;
        st.busy = false;
        wall.reset([]);
        note.textContent = q ? "Search isn’t working right now." : "Films are offline.";
        note.hidden = false;
      }
    };
    st.load = load;
    new IntersectionObserver((es) => es[0].isIntersecting && more(), { root, rootMargin: "0px 0px 900px 0px" }).observe(end);
    kind.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-k]");
      if (!b || b.classList.contains("on")) return;
      $$("button", kind).forEach((x) => {
        x.classList.toggle("on", x === b);
        x.setAttribute("aria-selected", x === b);
      });
      root.scrollTop = 0;
      load(b.dataset.k, st.q);
    });
    qIn.addEventListener("input", debounce(() => {
      const q = qIn.value.replace(./\s+/g, " ").trim();
      const next = q.length >= 2 ? q : "";
      if (next === st.q) return;
      root.scrollTop = 0;
      load(st.type, next);
    }, 350));
    root.addEventListener("click", (e) => {
      const p = e.target.closest(".mw-p[data-i]");
      const m = p && wall.items[+p.dataset.i];
      if (!m) return;
      if (e.target.closest("[data-go]")) return ctx.playTitle(m);
      ctx.openTitle(m, $("img", p));
    });
    root.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-p[data-i]")) {
        e.preventDefault();
        e.target.click();
      }
    });
  },
  enter(root, ctx) {
    ctx.wash(null);
    ctx.banner($("[data-adb]", root));
    if (this.st.loaded) return;
    this.st.loaded = true;
    if (ctx.config.films) this.st.load("movie", "");
    else {
      $("[data-wnote]", root).textContent = "Films are offline.";
      $("[data-wnote]", root).hidden = false;
    }
  },
};

const artAt = (u, n) => String(u || "").replace(./\/\d+x\d+bb\./, "/" + n + "x" + n + "bb.").replace(/(\/api\/listen\/art\/[yl]\/)\d+\//, "$1" + n + "/");
const baseTitle = (s) => String(s || "").toLowerCase().replace(./\s*[([].*?[)\]]/g, "").replace(./\s+-\s+.*$/, "").trim();
const uniqSongs = (list) => {
  const seen = new Set();
  return list.filter((t) => {
    const a = "a" + t.art, b = "t" + String(t.artist).toLowerCase() + "|" + baseTitle(t.title);
    if (seen.has(a) || seen.has(b)) return false;
    seen.add(a);
    seen.add(b);
    return true;
  });
};
const MTABS = [["top", "Discover", ""], ["liked", "Liked", "heart"], ["queue", "Queue", "listen"], ["hist", "History", "clock"]];
const MEMPTY = { top: "Music is offline.", liked: "No liked songs yet.", queue: "Nothing in the queue.", hist: "Nothing played yet." };
const listen = {
  html: () =>
    '<div class="mu"><div class="mw-bar r"><label class="mw-q">' + ico("search") +
    '<input data-lq type="search" maxlength="80" placeholder="Search songs or artists" aria-label="Search songs or artists" autocomplete="off" spellcheck="false"></label></div>' +
    '<div class="adb" data-adb></div>' +
    '<nav class="mu-tabs r" style="--d:.04s" data-mtabs>' + MTABS.map(([k, l, ic], i) => '<button type="button" data-mt="' + k + '"' + (i ? "" : ' class="on"') + ">" + (ic ? ico(ic) : "") + l + "</button>").join("") + "</nav>" +
    '<p class="mw-note" data-lnote hidden></p><div class="mw-wall r" style="--d:.08s" data-lwall></div>' +
    '<div class="mu-pb gl g3" data-pb hidden><div class="l"><img alt="" data-pa><div class="tx"><b data-pt></b><span data-pr></span></div></div>' +
    '<div class="c"><div class="row"><button class="cb sm gh" type="button" data-pc="like" aria-label="Like">' + ico("heart") + "</button>" +
    '<button class="cb sm" type="button" data-pc="prev" aria-label="Previous">' + ico("prev") + "</button>" +
    '<button class="cb big" type="button" data-pc="toggle" aria-label="Play">' + ico("go") + "</button>" +
    '<button class="cb sm" type="button" data-pc="next" aria-label="Next">' + ico("next") + "</button>" +
    '<button class="cb sm gh" type="button" data-pc="shuffle" aria-label="Shuffle">' + ico("shuffle") + "</button></div>" +
    '<div class="bar num"><span data-tc>0:00</span><div class="scrub" data-scrub><i data-prog></i></div><span data-td>0:00</span></div></div>' +
    '<div class="r"><button class="cb sm gh" type="button" data-pc="repeat" aria-label="Repeat">' + ico("repeat") + "</button>" +
    '<button class="cb sm gh" type="button" data-pc="mute" aria-label="Mute">' + ico("vol") + "</button>" +
    '<input class="vol" type="range" min="0" max="1" step="0.01" data-vol aria-label="Volume"></div></div></div>',
  mount(root, ctx) {
    const pl = ctx.player;
    const st = (this.st = { top: [], view: [], tab: "top", q: "", seq: 0, cur: "" });
    const note = $("[data-lnote]", root), tabs = $("[data-mtabs]", root), lq = $("[data-lq]", root), pb = $("[data-pb]", root), vol = $("[data-vol]", root);
    const eq = '<span class="eq"><i></i><i></i><i></i></span>';
    const mark = () => {
      const cur = pl.cur() && pl.cur().id;
      $$(".mw-p[data-id]", root).forEach((p) => {
        const on = p.dataset.id === cur;
        p.classList.toggle("now", on);
        p.classList.toggle("paused", on && (!pl.playing || pl.loading));
        const e = $(".eq", p);
        if (on && !e) p.insertAdjacentHTML("beforeend", eq);
        if (!on && e) e.remove();
      });
    };
    const tile = (t, i) =>
      '<div class="mw-p sq" role="button" tabindex="0" data-i="' + i + '" data-id="' + esc(t.id) + '" aria-label="' + esc(t.title) + '"><img class="fade" decoding="async" alt="" data-src="' + esc(artAt(t.art, 300)) + '">' +
      '<span class="mw-go">' + ico("go") + '</span><span class="mw-i"><b>' + esc(t.title) + "</b><span>" + esc(t.artist) + "</span></span></div>";
    const wall = brick(root, $("[data-lwall]", root), { want: 132, phone: 100, tile, square: true, done: mark });
    const lists = {
      top: () => st.top,
      liked: () => store.get("saved", []).filter((x) => /^song:/.test(x.key)),
      queue: () => (pl.cur() ? pl.list.slice(pl.i) : []),
      hist: () => ctx.history.list().filter((h) => h.kind === "song").map((h) => ({ id: h.id, vid: h.vid || "", title: h.name, artist: h.artist, art: h.art, preview: h.preview || "" })),
    };
    const show = (list, empty) => {
      st.view = list;
      note.textContent = list.length ? "" : empty;
      note.hidden = !!list.length;
      wall.reset(list);
    };
    const render = () => {
      if (!st.q) show(lists[st.tab](), MEMPTY[st.tab]);
    };
    st.render = render;
    const paintVol = () => {
      vol.style.setProperty("--v", vol.value * 100 + "%");
      $('[data-pc="mute"]', pb).classList.toggle("off", pl.audio.muted || +vol.value === 0);
    };
    const paint = () => {
      const t = pl.cur() || st.view[0] || st.top[0];
      pb.hidden = !t;
      if (!t) return;
      const a = $("[data-pa]", pb), src = artAt(t.art, 120);
      if (a.getAttribute("src") !== src) a.src = src;
      $("[data-pt]", pb).textContent = t.title;
      $("[data-pr]", pb).textContent = t.artist;
      const tg = $('[data-pc="toggle"]', pb);
      tg.innerHTML = ico(pl.playing ? "pause" : "go");
      tg.setAttribute("aria-label", pl.playing ? "Pause" : "Play");
      tg.classList.toggle("ld", pl.loading && pl.playing);
      $('[data-pc="shuffle"]', pb).classList.toggle("on", pl.shuffle);
      $('[data-pc="repeat"]', pb).classList.toggle("on", pl.repeat);
      $('[data-pc="like"]', pb).classList.toggle("on", ctx.saved.has("song:" + t.id));
      mark();
      const id = pl.cur() ? pl.cur().id : "";
      if (id !== st.cur) {
        st.cur = id;
        if (!st.q && (st.tab === "queue" || st.tab === "hist")) render();
      }
      if (ctx.is("listen")) ctx.wash(artAt(t.art, 300));
    };
    st.paint = paint;
    const tick = () => {
      const au = pl.audio, d = isFinite(au.duration) && au.duration > 0 ? au.duration : 0;
      $("[data-prog]", pb).style.width = (d ? (au.currentTime / d) * 100 : 0) + "%";
      $("[data-tc]", pb).textContent = clockText(au.currentTime);
      $("[data-td]", pb).textContent = clockText(d);
    };
    pl.on(paint);
    for (const ev of ["timeupdate", "durationchange", "emptied"]) pl.audio.addEventListener(ev, tick);
    vol.value = pl.audio.volume;
    paintVol();
    vol.addEventListener("input", () => {
      pl.audio.volume = +vol.value;
      pl.audio.muted = false;
      store.set("vol", +vol.value);
      paintVol();
    });
    const setTab = (k) => {
      st.tab = k;
      $$("button", tabs).forEach((b) => b.classList.toggle("on", b.dataset.mt === k && !st.q));
    };
    const search = debounce(async () => {
      const q = lq.value.replace(./\s+/g, " ").trim();
      const n = ++st.seq;
      if (q.length < 2) {
        if (!st.q) return;
        st.q = "";
        setTab(st.tab);
        return render();
      }
      st.q = q;
      setTab(st.tab);
      note.hidden = true;
      wall.items = [];
      wall.skeleton();
      try {
        const songs = await get("./api/listen/search?q=" + encodeURIComponent(q));
        if (n === st.seq) show(songs, "No songs found.");
      } catch {
        if (n === st.seq) show([], "Search isn’t working right now.");
      }
    }, 320);
    lq.addEventListener("input", search);
    lq.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !lq.value) return;
      e.stopPropagation();
      lq.value = "";
      search();
    });
    root.addEventListener("click", (e) => {
      const tb = e.target.closest("[data-mt]");
      if (tb) {
        lq.value = "";
        st.q = "";
        st.seq++;
        setTab(tb.dataset.mt);
        root.scrollTop = 0;
        return render();
      }
      const p = e.target.closest(".mw-p[data-i]");
      if (p) {
        const i = +p.dataset.i, t = st.view[i];
        if (!t) return;
        if (pl.cur() && pl.cur().id === t.id) return pl.toggle();
        return st.tab === "queue" && !st.q ? pl.play(pl.list, pl.i + i) : pl.play(st.view, i);
      }
      const c = e.target.closest("[data-pc]");
      if (c) {
        const k = c.dataset.pc;
        if (k === "toggle") return pl.cur() ? pl.toggle() : st.view.length && pl.play(st.view, 0);
        if (k === "next") return pl.next();
        if (k === "prev") return pl.prev();
        if (k === "shuffle") return pl.setShuffle(!pl.shuffle);
        if (k === "repeat") return pl.setRepeat(!pl.repeat);
        if (k === "mute") {
          pl.audio.muted = !pl.audio.muted;
          return paintVol();
        }
        if (k === "like") {
          const t = pl.cur() || st.view[0];
          if (!t) return;
          ctx.saved.toggle({ key: "song:" + t.id, id: t.id, vid: t.vid || "", title: t.title, artist: t.artist, art: t.art, preview: t.preview || "" });
          paint();
          if (st.tab === "liked" && !st.q) render();
        }
        return;
      }
      const s = e.target.closest("[data-scrub]");
      if (s) {
        const b = s.getBoundingClientRect();
        pl.seek((e.clientX - b.left) / b.width);
      }
    });
    root.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-p[data-i]")) {
        e.preventDefault();
        e.target.click();
      }
    });
    wall.skeleton();
    get("./api/listen/top")
      .then((songs) => {
        st.top = uniqSongs(songs);
        if (st.tab === "top") render();
        paint();
      })
      .catch(() => st.tab === "top" && !st.q && show([], MEMPTY.top));
  },
  enter(root, ctx) {
    ctx.banner($("[data-adb]", root));
    if (this.st.tab !== "top" && !this.st.q) this.st.render();
    this.st.paint();
  },
};

const play = {
  html: () =>
    '<div class="mw"><div class="mw-bar r"><label class="mw-q">' + ico("search") +
    '<input data-pq type="search" placeholder="Search games…" aria-label="Search games" autocomplete="off" spellcheck="false"></label></div>' +
    '<div class="adb" data-adb></div><p class="mw-note" data-pnote hidden></p><div class="mw-wall r" style="--d:.06s" data-grid></div><div class="mw-end" data-pend></div></div>',
  mount(root, ctx) {
    const st = (this.st = { all: [], view: [], shown: 0 });
    const note = $("[data-pnote]", root), end = $("[data-pend]", root);
    const tile = (g) =>
      '<div class="mw-p sq" role="button" tabindex="0" data-g="' + g.id + '" aria-label="' + esc(g.name) + '"><img class="fade" decoding="async" alt="" data-src="' + esc(g.cover) + '"><span class="mw-go">' + ico("go") + '</span><span class="mw-i"><b>' + esc(g.name) + "</b></span></div>";
    const wall = brick(root, $("[data-grid]", root), { want: 132, phone: 100, tile, square: true });
    const near = () => end.getBoundingClientRect().top < root.getBoundingClientRect().bottom + 900;
    const more = () => {
      if (st.shown >= st.view.length) return;
      const next = st.view.slice(st.shown, st.shown + 60);
      st.shown += next.length;
      wall.add(next);
      if (near()) more();
    };
    const show = (list) => {
      st.view = list;
      st.shown = 0;
      note.textContent = list.length ? "" : "No games match";
      note.hidden = !!list.length;
      wall.reset([]);
      more();
    };
    wall.skeleton();
    get("./api/play/games")
      .then((all) => {
        st.all = all;
        show(all);
      })
      .catch(() => {
        wall.reset([]);
        note.textContent = "Games are offline.";
        note.hidden = false;
      });
    new IntersectionObserver((es) => es[0].isIntersecting && more(), { root, rootMargin: "0px 0px 900px 0px" }).observe(end);
    const q = $("[data-pq]", root);
    q.addEventListener("input", debounce(() => {
      const s = q.value.trim().toLowerCase();
      show(s ? st.all.filter((g) => g.name.toLowerCase().includes(s)) : st.all);
    }, 120));
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      const g = st.all.find((x) => x.id === +b.dataset.g);
      if (g) ctx.playGame(g);
    });
    root.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-p[data-g]")) {
        e.preventDefault();
        e.target.click();
      }
    });
  },
  enter(root, ctx) {
    ctx.wash(null);
    ctx.banner($("[data-adb]", root));
  },
};

const TIERS = { smart: ["Smart", "ask"], fast: ["Fast", "bolt"], haiku: ["Haiku", "star"] };
const tierOf = (t) => TIERS[t] || TIERS.smart;
const chip = (f, i) =>
  '<span class="ai-chip' + (f.loading ? " ld" : "") + '">' +
  (f.kind === "photo"
    ? f.url ? '<img class="th" alt="" src="' + f.url + '">' : '<span class="fi ph">' + ico("image") + "</span>"
    : '<span class="fi">' + ico("file") + "</span>") +
  '<span class="nm"><b>' + esc(f.name) + "</b>" +
  (f.loading ? "<small>Reading…</small>" : f.pages ? "<small>" + f.pages + (f.pages > 1 ? " pages" : " page") + "</small>" : "") +
  "</span>" + (i !== undefined ? '<button class="x" type="button" data-rm="' + i + '" aria-label="Remove">' + ico("x") + "</button>" : "") + "</span>";
const qEl = (m, pics) => {
  const d = document.createElement("div");
  d.className = "ai-q";
  if (m.id) d.dataset.mid = m.id;
  const shots = pics && pics.length ? pics.map((u) => '<img class="ai-qp" alt="" src="' + u + '">').join("") : m.photos ? chip({ kind: "photo", name: m.photos > 1 ? m.photos + " photos" : "Photo" }) : "";
  const files = (m.files || []).map((f) => chip(f)).join("");
  d.innerHTML = (shots || files ? '<div class="ai-qa">' + shots + files + "</div>" : "") +
    (m.text ? '<div class="ai-qr"><button class="ai-ed" type="button" data-edit aria-label="Edit">' + ico("pencil") + '</button><div class="ai-u"></div></div>' : "");
  if (m.text) $(".ai-u", d).textContent = m.text;
  return d;
};
const aSrc = (list) =>
  list && list.length
    ? '<div class="ai-src">' + list.map((s, i) => '<a href="' + esc(s.url) + '" title="' + esc(s.title) + '"><img alt="" src="./api/icon?d=' + encodeURIComponent(s.site) + '">' +
        esc(String(s.site).replace(./^(en|m|www)\./, "")) + "<i>" + (i + 1) + "</i></a>").join("") + "</div>"
    : "";
const aFoot = (m) =>
  '<div class="ai-f">' + (m.text ? '<button type="button" data-copy aria-label="Copy">' + ico("copy") + "</button>" : "") +
  '<button type="button" data-regen aria-label="Regenerate">' + ico("reload") + "</button>" +
  (m.model ? '<span class="ai-m">' + ico(tierOf(m.model.tier)[1]) + "<b>" + tierOf(m.model.tier)[0] + "</b> · " + esc(m.model.name) + "</span>" : "") + "</div>";
const ACCEPT = "image/*,.pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xml,.js,.ts,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.sql,.yml,.yaml,.log,.tex";

const ask = {
  flush: true,
  html: () =>
    '<div class="ai"><aside class="ai-side"><button class="btn k s" type="button" data-new>' + ico("plus") + "New chat</button>" +
    '<label class="ai-find">' + ico("search") + '<input data-find placeholder="Search chats" aria-label="Search chats" autocomplete="off" spellcheck="false"></label>' +
    '<div class="ai-list srl" data-list></div></aside>' +
    '<section class="ai-main"><div class="ai-thread srl" data-thread><div class="ai-in" data-in></div></div>' +
    '<form class="ai-box gl g2" data-form><p class="ai-note" data-note hidden></p><div class="ai-atts" data-atts hidden></div>' +
    '<textarea data-aq rows="1" maxlength="8000" placeholder="Ask anything" aria-label="Ask anything"></textarea>' +
    '<div class="ai-tools"><button class="ai-t ic" type="button" data-add aria-label="Add a photo or file">' + ico("plus") + "</button>" +
    '<button class="ai-t" type="button" data-web aria-pressed="false">' + ico("web") + "Search</button>" +
    '<span class="ai-tw"><button class="ai-t" type="button" data-tier aria-haspopup="menu"><span class="tv" data-tico></span><span data-tname></span>' + ico("caret", "i car") + "</button>" +
    '<div class="ai-menu ai-tmenu gl g3" data-tmenu role="menu" hidden>' +
    Object.entries(TIERS).map(([k, [n, ic]]) => '<button type="button" role="menuitemradio" data-tv="' + k + '">' + ico(ic) + n + ico("check", "i ck") + "</button>").join("") + "</div></span>" +
    '<span class="sp"></span><button class="cb" type="submit" data-asend aria-label="Send">' + ico("send") + "</button></div>" +
    '<input type="file" data-pick multiple hidden accept="' + ACCEPT + '"></form></section></div>',
  mount(root, ctx) {
    this.root = root;
    const st = (this.st = { chat: null, list: [], ready: true, busy: null, find: "", att: [], pics: new Map(), menu: null });
    const inner = $("[data-in]", root), thread = $("[data-thread]", root), q = $("[data-aq]", root), form = $("[data-form]", root);
    const sendBtn = $("[data-asend]", root), listEl = $("[data-list]", root), atts = $("[data-atts]", root), pick = $("[data-pick]", root);
    const tmenu = $("[data-tmenu]", root), note = $("[data-note]", root), findIn = $("[data-find]", root);
    const near = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140;
    const toEnd = () => (thread.scrollTop = thread.scrollHeight);
    const grow = () => {
      q.style.height = "auto";
      q.style.height = Math.min(q.scrollHeight, 200) + "px";
    };
    const say = (t) => {
      note.textContent = t || "";
      note.hidden = !t;
    };
    const tierNow = () => {
      const t = store.get("askTier", "smart");
      return TIERS[t] ? t : "smart";
    };
    const greet = () => {
      const h = new Date().getHours();
      const me = ctx.account.me;
      return (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (me ? ", " + me.display : "") + ".";
    };
    const empty = () => {
      thread.classList.add("empty");
      inner.innerHTML = '<div class="ai-hi"><h1>' + esc(greet()) + "</h1>" +
        (st.ready ? '<div class="sugs">' + ["Explain photosynthesis simply", "Outline an essay on climate", "Quiz me on world capitals", "Fix this sentence’s grammar"].map((s) => "<button type=\"button\" data-s>" + esc(s) + "</button>").join("") + "</div>"
          : '<p class="off">Ask isn’t set up yet.</p>') + "</div>";
    };
    const order = () => st.list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
    const paintList = () => {
      const item = (c) =>
        '<div class="ai-it' + (c.id === st.chat ? " on" : "") + '" data-id="' + esc(c.id) + '" role="button" tabindex="0">' + (c.pinned ? ico("pin", "i pn") : "") +
        "<span>" + esc(c.title) + '</span><button class="mo" type="button" data-more aria-label="More">' + ico("dots") + "</button></div>";
      const pinned = st.list.filter((c) => c.pinned), rest = st.list.filter((c) => !c.pinned);
      listEl.innerHTML = st.find
        ? st.list.length ? st.list.map(item).join("") : '<p class="ai-none">No chats found</p>'
        : (pinned.length ? '<div class="ai-sec">Pinned</div>' + pinned.map(item).join("") + (rest.length ? '<div class="ai-sec">Recent</div>' : "") : "") + rest.map(item).join("");
      $$(".ai-imenu", root).forEach((x) => x.remove());
      st.menu = null;
    };
    const paintTools = () => {
      const web = !!store.get("askWeb", false), [n, ic] = tierOf(tierNow());
      const wb = $("[data-web]", root);
      wb.classList.toggle("on", web);
      wb.setAttribute("aria-pressed", web);
      $("[data-tico]", root).innerHTML = ico(ic);
      $("[data-tname]", root).textContent = n;
      $$("[data-tv]", tmenu).forEach((b) => b.setAttribute("aria-checked", b.dataset.tv === tierNow()));
    };
    const paintAtts = () => {
      atts.hidden = !st.att.length;
      atts.innerHTML = st.att.map((f, i) => chip(f, i)).join("");
    };
    this.paintAtts = paintAtts;
    this.paintTools = paintTools;
    const setBusy = (ctl) => {
      st.busy = ctl;
      sendBtn.innerHTML = ico(ctl ? "x" : "send");
      sendBtn.setAttribute("aria-label", ctl ? "Stop" : "Send");
      sendBtn.classList.toggle("stop", !!ctl);
    };
    const patch = (id, body) =>
      fetch("./api/ask/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
        .then((r) => r.json())
        .catch(() => null);
    this.load = async () => {
      try {
        const d = await (await fetch("./api/ask" + (st.find ? "?q=" + encodeURIComponent(st.find) : ""), { credentials: "same-origin" })).json();
        st.ready = d.ready !== false;
        st.list = d.chats || [];
      } catch {
        st.list = [];
      }
      if (st.chat && !st.busy && !st.find && !st.list.some((c) => c.id === st.chat)) st.chat = null;
      paintList();
      if (!st.chat) empty();
    };
    const finish = (a, m, err) => {
      const stick = near();
      if (m.id) a.dataset.mid = m.id;
      a.raw = m.text;
      a.innerHTML = (m.text ? '<div class="ai-body">' + md(m.text, { sources: m.sources, onReady: () => finish(a, m, err) }) + "</div>" : "") +
        (err ? '<p class="err">' + esc(err) + "</p>" : "") + aSrc(m.sources) + aFoot(m);
      diagrams(a).then(() => stick && toEnd());
      if (stick) toEnd();
    };
    const open = async (id) => {
      if (st.busy) return;
      st.chat = id;
      paintList();
      thread.classList.remove("empty");
      inner.innerHTML = "";
      try {
        const r = await fetch("./api/ask/" + encodeURIComponent(id), { credentials: "same-origin" });
        if (!r.ok) throw new Error("gone");
        const d = await r.json();
        if (st.chat !== id) return;
        for (const m of d.msgs || []) {
          if (m.role === "user") inner.append(qEl(m, st.pics.get(String(m.id))));
          else {
            const a = document.createElement("div");
            a.className = "ai-a";
            inner.append(a);
            finish(a, m, "");
          }
        }
        toEnd();
      } catch {
        st.chat = null;
        paintList();
        empty();
      }
    };
    const run = async (body, u) => {
      const m = { text: "", sources: [], model: null, id: 0 };
      const a = document.createElement("div");
      a.className = "ai-a";
      a.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
      inner.append(a);
      toEnd();
      const ctl = new AbortController();
      setBusy(ctl);
      let raf = 0, err = "";
      const draw = () => {
        raf = 0;
        const stick = near();
        a.innerHTML = '<div class="ai-body">' + md(m.text, { sources: m.sources, onReady: later }) + "</div>";
        if (stick) toEnd();
      };
      const later = () => {
        if (!raf) raf = requestAnimationFrame(draw);
      };
      try {
        const r = await fetch("./api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat: st.chat, tier: tierNow(), web: !!store.get("askWeb", false), ...body }),
          credentials: "same-origin",
          signal: ctl.signal,
        });
        if (!r.ok || !r.body) err = (await r.json().catch(() => ({}))).msg || "Couldn’t answer that. Try again.";
        else {
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let cut;
            while ((cut = buf.indexOf("\n\n")) > -1) {
              const block = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              let ev = "", data = "";
              for (const line of block.split("\n")) {
                if (line.startsWith("event:")) ev = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              let d = {};
              try {
                d = JSON.parse(data || "{}");
              } catch {}
              if (ev === "start") {
                const known = st.list.find((c) => c.id === d.id);
                st.chat = d.id;
                st.list = [{ id: d.id, title: known ? known.title : d.title, pinned: known ? known.pinned : false, updated: Date.now() }, ...st.list.filter((c) => c.id !== d.id)];
                order();
                if (!st.find) paintList();
                if (u && d.user) {
                  u.dataset.mid = d.user;
                  if (body.photos && body.photos.length) st.pics.set(String(d.user), body.photos);
                }
              } else if (ev === "sources") m.sources = Array.isArray(d) ? d : [];
              else if (ev === "model") m.model = d;
              else if (ev === "t") {
                m.text += d.t || "";
                later();
              } else if (ev === "fail") err = d.msg || "Couldn’t answer that. Try again.";
              else if (ev === "done") m.id = d.id || 0;
            }
          }
          if (!m.text && !err) err = "Couldn’t answer that. Try again.";
        }
      } catch {
        if (!ctl.signal.aborted) err = "Couldn’t reach Ask. Check your connection.";
        else if (!m.text) err = "Stopped.";
      }
      cancelAnimationFrame(raf);
      finish(a, m, err);
      setBusy(null);
    };
    const send = async (text) => {
      text = String(text || "").trim();
      if (st.busy) return;
      if (st.att.some((x) => x.loading)) return say("Still reading your file…");
      if (!text && !st.att.length) return;
      const att = st.att;
      st.att = [];
      paintAtts();
      say("");
      q.value = "";
      grow();
      if (!st.chat) inner.innerHTML = "";
      thread.classList.remove("empty");
      const photos = att.filter((x) => x.kind === "photo").map((x) => x.url);
      const files = att.filter((x) => x.kind !== "photo").map(({ kind, name, url, pages, text: t }) => ({ kind, name, url, pages, text: t }));
      const u = qEl({ text, files }, photos);
      inner.append(u);
      await run({ text, files, photos }, u);
    };
    const edit = (u) => {
      if (st.busy || !u.dataset.mid || $(".ai-edit", u)) return;
      const row = $(".ai-qr", u);
      const box = el('<div class="ai-edit"><textarea rows="1" maxlength="8000" aria-label="Edit message"></textarea><div class="ai-eb">' +
        '<button class="btn s" type="button" data-ecancel>Cancel</button><button class="btn k s" type="button" data-esend>Send</button></div></div>');
      const ta = $("textarea", box);
      ta.value = $(".ai-u", u).textContent;
      row.hidden = true;
      u.append(box);
      const fit = () => {
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
      };
      const stop = () => {
        box.remove();
        row.hidden = false;
      };
      const go = () => {
        const text = ta.value.trim();
        if (!text || st.busy) return;
        const mid = u.dataset.mid, pics = st.pics.get(mid) || [];
        while (u.nextElementSibling) u.nextElementSibling.remove();
        const nu = qEl({ text }, null);
        const qa = $(".ai-qa", u);
        if (qa) nu.prepend(qa);
        u.replaceWith(nu);
        run({ text, edit: +mid, photos: pics }, nu);
      };
      ta.addEventListener("input", fit);
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          go();
        } else if (e.key === "Escape") stop();
      });
      $("[data-ecancel]", box).addEventListener("click", stop);
      $("[data-esend]", box).addEventListener("click", go);
      fit();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
    const regen = (a) => {
      if (st.busy || !st.chat) return;
      const u = a.previousElementSibling;
      const pics = u && u.dataset.mid ? st.pics.get(u.dataset.mid) || [] : [];
      a.remove();
      run({ regen: true, photos: pics }, null);
    };
    const copy = async (btn, text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      const old = btn.innerHTML;
      btn.innerHTML = ico("check");
      setTimeout(() => (btn.innerHTML = old), 1200);
    };
    const addFiles = async (files) => {
      say("");
      for (const f of files) {
        const photo = isPhoto(f);
        if (st.att.filter((x) => (x.kind === "photo") === photo).length >= 3) {
          say(photo ? "Up to 3 photos at a time." : "Up to 3 files at a time.");
          continue;
        }
        const slot = { kind: photo ? "photo" : "file", name: f.name || (photo ? "Photo" : "File"), loading: true };
        st.att.push(slot);
        paintAtts();
        try {
          const r = await (photo ? readPhoto(f) : readDoc(f));
          if (st.att.includes(slot)) Object.assign(slot, r, { loading: false });
        } catch (e) {
          const i = st.att.indexOf(slot);
          if (i > -1) st.att.splice(i, 1);
          say(e.message);
        }
        paintAtts();
      }
    };
    const closeMenu = () => {
      $$(".ai-imenu", root).forEach((m) => m.remove());
      st.menu = null;
    };
    const openMenu = (it) => {
      closeMenu();
      const c = st.list.find((x) => x.id === it.dataset.id);
      if (!c) return;
      st.menu = c.id;
      const m = el('<div class="ai-menu ai-imenu gl g3" role="menu"><button type="button" data-act="rename">' + ico("pencil") + "Rename</button>" +
        '<button type="button" data-act="pin">' + ico("pin") + (c.pinned ? "Unpin" : "Pin") + '</button><button type="button" class="bad" data-act="del">' + ico("trash") + "Delete</button></div>");
      const side = $(".ai-side", root), r = it.getBoundingClientRect(), b = side.getBoundingClientRect();
      m.style.top = r.bottom - b.top + 4 + "px";
      m.style.left = Math.max(8, Math.min(r.right - b.left - 176, b.width - 184)) + "px";
      side.append(m);
    };
    const rename = (id) => {
      const c = st.list.find((x) => x.id === id);
      const it = $$(".ai-it", listEl).find((x) => x.dataset.id === id);
      if (!c || !it) return;
      const inp = el('<input class="ai-ren" maxlength="60" aria-label="Chat name">');
      inp.value = c.title;
      $("span", it).replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const save = async (keep) => {
        if (done) return;
        done = true;
        const t = inp.value.replace(./\s+/g, " ").trim();
        if (keep && t && t !== c.title) {
          c.title = t;
          const r = await patch(id, { title: t });
          if (r && r.title) c.title = r.title;
        }
        paintList();
      };
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save(true);
        } else if (e.key === "Escape") save(false);
      });
      inp.addEventListener("blur", () => save(true));
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (st.busy) st.busy.abort();
      else send(q.value);
    });
    q.addEventListener("input", grow);
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!st.busy) send(q.value);
      }
    });
    q.addEventListener("paste", (e) => {
      const shots = [...(e.clipboardData ? e.clipboardData.files : [])].filter(isPhoto);
      if (!shots.length) return;
      e.preventDefault();
      addFiles(shots);
    });
    form.addEventListener("dragover", (e) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      form.classList.add("drop");
    });
    form.addEventListener("dragleave", (e) => !form.contains(e.relatedTarget) && form.classList.remove("drop"));
    form.addEventListener("drop", (e) => {
      form.classList.remove("drop");
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      addFiles([...e.dataTransfer.files]);
    });
    $("[data-add]", root).addEventListener("click", () => pick.click());
    pick.addEventListener("change", () => {
      const files = [...pick.files];
      pick.value = "";
      addFiles(files);
    });
    atts.addEventListener("click", (e) => {
      const x = e.target.closest("[data-rm]");
      if (!x) return;
      st.att.splice(+x.dataset.rm, 1);
      paintAtts();
      say("");
    });
    $("[data-web]", root).addEventListener("click", () => {
      store.set("askWeb", !store.get("askWeb", false));
      paintTools();
    });
    $("[data-tier]", root).addEventListener("click", () => (tmenu.hidden = !tmenu.hidden));
    tmenu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tv]");
      if (!b) return;
      store.set("askTier", b.dataset.tv);
      tmenu.hidden = true;
      paintTools();
    });
    document.addEventListener("click", (e) => {
      if (st.menu && !e.target.closest(".ai-imenu,[data-more]")) closeMenu();
      if (!tmenu.hidden && !e.target.closest("[data-tmenu],[data-tier]")) tmenu.hidden = true;
    });
    findIn.addEventListener("input", debounce(() => {
      st.find = findIn.value.trim();
      this.load();
    }, 220));
    $("[data-new]", root).addEventListener("click", () => {
      if (st.busy) return;
      st.chat = null;
      paintList();
      empty();
      q.focus();
    });
    listEl.addEventListener("click", (e) => {
      const it = e.target.closest("[data-id]");
      if (!it || e.target.closest(".ai-ren")) return;
      if (e.target.closest("[data-more]")) return st.menu === it.dataset.id ? closeMenu() : openMenu(it);
      closeMenu();
      if (it.dataset.id !== st.chat) open(it.dataset.id);
    });
    listEl.addEventListener("scroll", () => st.menu && closeMenu(), { passive: true });
    $(".ai-side", root).addEventListener("click", async (e) => {
      const act = e.target.closest(".ai-imenu [data-act]");
      if (!act) return;
      const id = st.menu, c = st.list.find((x) => x.id === id);
      closeMenu();
      if (!c) return;
      if (act.dataset.act === "rename") return rename(id);
      if (act.dataset.act === "pin") {
        c.pinned = !c.pinned;
        order();
        paintList();
        return patch(id, { pinned: c.pinned });
      }
      if (st.busy && st.chat === id) return;
      await fetch("./api/ask/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" }).catch(() => {});
      st.list = st.list.filter((x) => x.id !== id);
      if (st.chat === id) {
        st.chat = null;
        empty();
      }
      paintList();
    });
    listEl.addEventListener("keydown", (e) => {
      const it = e.target.closest("[data-id]");
      if (!it || e.target.closest(".ai-ren,[data-more]")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (it.dataset.id !== st.chat) open(it.dataset.id);
      }
    });
    inner.addEventListener("click", (e) => {
      const s = e.target.closest("[data-s]");
      if (s) return send(s.textContent);
      const ed = e.target.closest("[data-edit]");
      if (ed) return edit(ed.closest(".ai-q"));
      const cp = e.target.closest("[data-copy]");
      if (cp) return copy(cp, cp.closest(".ai-a").raw || "");
      const rg = e.target.closest("[data-regen]");
      if (rg) return regen(rg.closest(".ai-a"));
      const cc = e.target.closest("[data-cpy]");
      if (cc) return copy(cc, $("code", cc.closest("pre")).textContent);
      const link = e.target.closest(".ai-a a[href]");
      if (link) {
        e.preventDefault();
        ctx.openWeb(link.href);
      }
    });
  },
  enter(root, ctx) {
    ctx.wash(null);
    if (this.paintTools) this.paintTools();
    if (this.load) this.load();
    setTimeout(() => $("[data-aq]", root).focus(), 60);
  },
};
const AUTH = {
  in: { fields: ["email", "password"], btn: "Sign in", seg: "in", alt: [["reset", "Forgot password?"], ["code", "Email me a code"]] },
  up: { fields: ["user", "email", "password"], btn: "Create account", seg: "up" },
  upCode: { fields: ["code"], btn: "Verify", seg: "up", note: true, back: "up" },
  code: { fields: ["email"], btn: "Send code", title: "Email code", back: "in" },
  codeIn: { fields: ["code"], btn: "Sign in", title: "Email code", note: true, back: "code" },
  reset: { fields: ["email"], btn: "Send code", title: "Forgot password", back: "in" },
  resetIn: { fields: ["code", "password"], btn: "Reset password", title: "Forgot password", note: true, back: "reset" },
};
const lic = (k, a, b) => '<span class="lic" style="background:linear-gradient(145deg,' + a + "," + b + ')">' + ico(k) + "</span>";
async function square(file, size) {
  if (file.size > 25e6) throw new Error("That picture is too big.");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't open that picture.");
  }
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close();
  const enc = (type) => new Promise((r) => c.toBlob(r, type, 0.86));
  let out = await enc("image/webp");
  if (!out || out.type !== "image/webp") out = await enc("image/jpeg");
  if (!out) throw new Error("Couldn't open that picture.");
  return out;
}
const lrow = (ic, a, b, label, key, val) =>
  '<div class="lr">' + lic(ic, a, b) + "<h3>" + label + "</h3>" +
  (val ? '<span class="val" data-v' + key + "></span>" : "") +
  '<button class="btn s' + (key === "del" ? " bad" : "") + '" type="button" data-' + key + 'btn>' + (key === "del" ? "Delete" : "Change") + "</button></div>";
const codeField = (attrs) =>
  '<label class="fld code"' + (attrs || "") + '><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Code" aria-label="Code"></label>';
const account = {
  html: () =>
    '<div class="acct">' +
    '<section class="auth gl g2 r" data-auth hidden><img class="auth-logo" src="./img/boba-cup.svg" alt="">' +
    '<div class="seg" data-amode><span class="th"></span><button type="button" class="on" data-v="in">Sign in</button><button type="button" data-v="up">Create account</button></div>' +
    '<h2 class="ah" data-atitle hidden></h2>' +
    '<form data-aform novalidate><p class="note" data-anote hidden></p>' +
    '<label class="fld" data-f="user">' + ico("user") +
    '<input name="user" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="Username" aria-label="Username"></label>' +
    '<label class="fld" data-f="email">' + ico("mail") +
    '<input name="email" type="email" maxlength="254" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="Email" aria-label="Email"></label>' +
    codeField(' data-f="code"') +
    '<label class="fld" data-f="password">' + ico("lock") +
    '<input name="password" type="password" maxlength="200" autocomplete="current-password" placeholder="Password" aria-label="Password"></label>' +
    '<p class="msg" data-amsg hidden></p><button class="btn k" type="submit" data-asub>Sign in</button><div class="alt" data-alt></div></form></section>' +
    '<div class="acg" data-mine hidden>' +
    '<section class="pass r" data-pass><div class="top"><span class="av" data-pf></span><div class="nm"><h1 data-name></h1><p data-user></p></div>' +
    '<div class="pbs"><button class="pb" type="button" data-czbtn>Customize</button><button class="pb" type="button" data-out>' + ico("signout") + "Sign out</button></div></div>" +
    '<div class="bot">Member since<b data-since></b></div><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">' + N.home + "</svg></section>" +
    '<section class="about gl g2 r" style="--d:.04s"><div class="abh">' + lic("ask", "#c084fc", "#7c3aed") + "<h3>About you</h3><span>Ask reads this in every chat</span></div>" +
    '<form data-abform novalidate><textarea name="about" maxlength="300" placeholder="Your grade, subjects, how you like answers" aria-label="About you"></textarea>' +
    '<div class="abf"><p class="msg" hidden></p><button class="btn k s" type="submit">Save</button></div></form></section>' +
    '<section class="cz gl g2" data-cz hidden><input type="file" accept="image/*" data-file hidden><h3>Avatar</h3><div class="avs">' +
    '<button class="avu" type="button" data-up aria-label="Upload photo"></button>' +
    AVATARS.map((c, i) => '<button class="sw" type="button" data-av="' + i + '" aria-label="Colour ' + (i + 1) + '" style="background:linear-gradient(145deg,' + c[0] + "," + c[1] + ')"></button>').join("") +
    '</div><button class="btn s" type="button" data-czdone>Done</button><h3>Cover</h3><div class="covs" data-covs></div><p class="msg" data-czmsg hidden></p></section>' +
    '<section class="grp gl g2 r" style="--d:.08s"><h3 class="cardh">Account</h3>' +
    lrow("user", "#b98cff", "#7a4cf0", "Display name", "dn", true) +
    '<form class="lf one" data-dnform hidden novalidate><label class="fld"><input name="display" maxlength="32" autocomplete="nickname" placeholder="Display name" aria-label="Display name"></label>' +
    '<button class="btn k s" type="submit">Save</button><p class="msg" hidden></p></form>' +
    lrow("mail", "#43c2ff", "#3058f0", "Email", "em", true) +
    '<form class="lf" data-emform hidden novalidate>' +
    '<label class="fld" data-s1><input name="email" type="email" maxlength="254" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="New email" aria-label="New email"></label>' +
    '<label class="fld" data-s1><input name="password" type="password" maxlength="200" autocomplete="current-password" placeholder="Password" aria-label="Password"></label>' +
    codeField(" data-s2 hidden") +
    '<button class="btn k s" type="submit">Send code</button><p class="msg" hidden></p></form>' +
    lrow("lock", "#8b93a3", "#555e6e", "Password", "pw") +
    '<form class="lf" data-pwform hidden novalidate><label class="fld"><input type="password" name="current" autocomplete="current-password" placeholder="Current password" aria-label="Current password"></label>' +
    '<label class="fld"><input type="password" name="password" autocomplete="new-password" placeholder="New password" aria-label="New password"></label>' +
    '<button class="btn k s" type="submit">Save</button><p class="msg" hidden></p></form></section>' +
    '<section class="grp gl g2 r" style="--d:.12s"><h3 class="cardh">Privacy</h3>' +
    '<div class="lr">' + lic("clock", "#5ee08a", "#139b48") + '<h3>Save history</h3><button class="tg" type="button" role="switch" aria-label="Save history" data-keep><i></i></button></div>' +
    '<div class="lr">' + lic("shield", "#2be0e6", "#0b8f86") + '<h3>Auto‑clear</h3><div class="seg" data-forget><span class="th"></span>' +
    '<button type="button" data-fg="0">Never</button><button type="button" data-fg="1">1 day</button><button type="button" data-fg="7">1 week</button></div></div>' +
    '<div class="lr">' + lic("trash", "#ffbe2e", "#ff7a1a") + '<h3>Clear history</h3><button class="btn s" type="button" data-clr>Clear</button></div></section>' +
    '<section class="grp gl g2 wide r" style="--d:.16s"><h3 class="cardh">Your data</h3>' +
    '<div class="lr">' + lic("down", "#43c2ff", "#3058f0") + '<h3>Download my data</h3><button class="btn s" type="button" data-dl>Download</button></div>' +
    lrow("trash", "#ff6b6b", "#d62e4a", "Delete account", "del") +
    '<form class="lf" data-delform hidden novalidate><label class="fld"><input type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password"></label>' +
    '<button class="btn s bad" type="submit">Delete for good</button><p class="msg" hidden></p></form></section></div></div>',
  mount(root, ctx) {
    const form = $("[data-aform]", root), msg = $("[data-amsg]", root), sub = $("[data-asub]", root);
    const seg = $("[data-amode]", root), title = $("[data-atitle]", root), note = $("[data-anote]", root), alt = $("[data-alt]", root);
    const st = (this.st = { state: "in", email: "", tok: "", sent: 0, timer: 0, was: false, form });
    const say = (el, text, good) => {
      el.hidden = !text;
      el.textContent = text || "";
      el.classList.toggle("ok", !!good);
    };
    const paintAlt = () => {
      const c = AUTH[st.state];
      const links = [...(c.alt || [])];
      const left = Math.ceil((st.sent + 60000 - Date.now()) / 1000);
      if (c.note) links.push(["resend", left > 0 ? "Resend in " + left + "s" : "Resend code", left > 0]);
      if (c.back) links.push(["back", "Back"]);
      alt.innerHTML = links.map(([k, label, off]) => '<button type="button" data-al="' + k + '"' + (off ? " disabled" : "") + ">" + label + "</button>").join("");
      alt.hidden = !links.length;
      clearTimeout(st.timer);
      if (c.note && left > 0) st.timer = setTimeout(paintAlt, 1000);
    };
    const show = (s, focus) => {
      const c = AUTH[s];
      st.state = s;
      for (const k of ["user", "email", "code", "password"]) $('[data-f="' + k + '"]', root).hidden = !c.fields.includes(k);
      seg.hidden = !c.seg;
      if (c.seg) {
        $$("button", seg).forEach((b) => b.classList.toggle("on", b.dataset.v === c.seg));
        segThumb(seg);
      }
      title.hidden = !c.title;
      title.textContent = c.title || "";
      note.hidden = !c.note;
      if (c.note) note.innerHTML = "Code sent to <b>" + esc(st.email) + "</b>";
      sub.textContent = c.btn;
      form.password.placeholder = s === "resetIn" ? "New password" : "Password";
      form.password.autocomplete = s === "in" ? "current-password" : "new-password";
      if (c.note) form.code.value = "";
      say(msg, "");
      paintAlt();
      if (focus) {
        const first = c.fields.map((k) => form[k]).find((i) => !i.value) || form[c.fields[0]];
        setTimeout(() => first.focus(), 30);
      }
    };
    st.show = show;
    const run = async (fn) => {
      sub.disabled = true;
      say(msg, "");
      try {
        await fn();
      } catch (err) {
        say(msg, err.message);
      }
      sub.disabled = false;
    };
    const mail = () => form.email.value.trim();
    const code = () => form.code.value.replace(./\D/g, "");
    const sent = (s, email, again) => {
      st.email = email;
      st.sent = Date.now();
      show(s, true);
      if (again) say(msg, "New code sent.", true);
    };
    const send = (again) =>
      run(async () => {
        const s = st.state;
        if (s === "up" || s === "upCode") {
          const d = await ctx.account.register(form.user.value.trim(), mail(), form.password.value);
          st.tok = d.tok;
          return sent("upCode", d.email, again);
        }
        const purpose = s.startsWith("code") ? "login" : "reset";
        const d = await ctx.account.sendCode(mail(), purpose);
        sent(purpose === "login" ? "codeIn" : "resetIn", d.email, again);
      });
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (b && b.dataset.v !== AUTH[st.state].seg) show(b.dataset.v, true);
    });
    alt.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-al]");
      if (!b || b.disabled) return;
      if (b.dataset.al === "back") return show(AUTH[st.state].back, true);
      if (b.dataset.al === "resend") return send(true);
      show(b.dataset.al, true);
    });
    form.code.addEventListener("input", () => (form.code.value = code()));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const s = st.state, c = AUTH[s];
      if (c.fields.includes("code") && code().length !== 6) return say(msg, "Enter the 6-digit code.");
      if (c.fields.some((k) => !form[k].value.trim())) return say(msg, "Fill in every field.");
      if (s === "in") return run(() => ctx.account.login(mail(), form.password.value));
      if (s === "upCode") return run(() => ctx.account.verify(st.email, code(), st.tok));
      if (s === "codeIn") return run(() => ctx.account.codeLogin(st.email, code()));
      if (s === "resetIn") return run(() => ctx.account.reset(st.email, code(), form.password.value));
      send(false);
    });
    show("in");
    $("[data-out]", root).addEventListener("click", () => ctx.account.leave());
    const pair = (btnSel, formSel, open, run) => {
      const f = $(formSel, root), m = $(".msg", f);
      $(btnSel, root).addEventListener("click", () => {
        f.hidden = !f.hidden;
        say(m, "");
        if (f.hidden) return;
        if (open) open(f);
        [...f.querySelectorAll("input")].find((i) => !i.closest("[hidden]")).focus();
      });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const b = f.querySelector("button[type=submit]");
        b.disabled = true;
        try {
          await run(f, m);
        } catch (err) {
          say(m, err.message);
        }
        b.disabled = false;
      });
    };
    pair("[data-dnbtn]", "[data-dnform]", (f) => (f.display.value = ctx.account.me.display), async (f) => {
      await ctx.account.profile({ display: f.display.value });
      f.hidden = true;
    });
    const cz = $("[data-cz]", root);
    $("[data-czbtn]", root).addEventListener("click", () => {
      cz.hidden = !cz.hidden;
      if (!cz.hidden) this.covers(root, ctx);
    });
    $("[data-czdone]", root).addEventListener("click", () => (cz.hidden = true));
    const czm = $("[data-czmsg]", root), file = $("[data-file]", root), up = $("[data-up]", root);
    cz.addEventListener("click", async (e) => {
      if (e.target.closest("[data-up]")) return file.click();
      const b = e.target.closest("[data-av],[data-cov]");
      if (!b || b.classList.contains("on")) return;
      say(czm, "");
      try {
        if (!("av" in b.dataset)) return await ctx.account.profile({ cover: b.dataset.cov });
        if (ctx.account.me.pic) await ctx.account.dropPic();
        await ctx.account.profile({ color: +b.dataset.av });
      } catch (err) {
        say(czm, err.message);
      }
    });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      up.classList.add("ld");
      say(czm, "");
      try {
        await ctx.account.upload(await square(f, 256));
      } catch (err) {
        say(czm, err.message);
      }
      up.classList.remove("ld");
    });
    const ab = $("[data-abform]", root), abm = $(".msg", ab);
    ab.about.addEventListener("input", () => {
      ab.dataset.dirty = "1";
      say(abm, "");
    });
    ab.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("button", ab);
      b.disabled = true;
      try {
        await ctx.account.profile({ about: ab.about.value });
        delete ab.dataset.dirty;
        ab.about.value = ctx.account.me.about;
        say(abm, "Saved", true);
      } catch (err) {
        say(abm, err.message);
      }
      b.disabled = false;
    });
    $("[data-keep]", root).addEventListener("click", () => {
      store.set("keep", !store.get("keep", true));
      this.privacy(root);
    });
    $("[data-forget]", root).addEventListener("click", (e) => {
      const b = e.target.closest("button[data-fg]");
      if (!b) return;
      store.set("forget", +b.dataset.fg);
      store.set("history", ctx.history.list());
      this.privacy(root);
    });
    const clr = $("[data-clr]", root);
    let armed = 0;
    clr.addEventListener("click", () => {
      clearTimeout(armed);
      if (!clr.classList.contains("bad")) {
        clr.classList.add("bad");
        clr.textContent = "Clear all?";
        armed = setTimeout(() => {
          clr.classList.remove("bad");
          clr.textContent = "Clear";
        }, 4000);
        return;
      }
      store.set("cleared", Date.now());
      store.set("history", []);
      clr.classList.remove("bad");
      clr.textContent = "Cleared";
      armed = setTimeout(() => (clr.textContent = "Clear"), 2000);
    });
    const dl = $("[data-dl]", root);
    dl.addEventListener("click", async () => {
      dl.disabled = true;
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(await ctx.account.download());
        a.download = "boba-" + ctx.account.me.name + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch {
        dl.textContent = "Try again";
        setTimeout(() => (dl.textContent = "Download"), 2500);
      }
      dl.disabled = false;
    });
    const emf = $("[data-emform]", root);
    const emStage = (two) => {
      $$("[data-s1]", emf).forEach((x) => (x.hidden = two));
      $$("[data-s2]", emf).forEach((x) => (x.hidden = !two));
      emf.classList.toggle("one", two);
      $("button[type=submit]", emf).textContent = two ? "Confirm" : "Send code";
    };
    emf.code.addEventListener("input", () => (emf.code.value = emf.code.value.replace(./\D/g, "")));
    pair("[data-embtn]", "[data-emform]", (f) => {
      f.reset();
      emStage(false);
    }, async (f, m) => {
      if (f.code.closest("[data-s2]").hidden) {
        const d = await ctx.account.changeEmail(f.email.value.trim(), f.password.value);
        emStage(true);
        say(m, "Code sent to " + d.email, true);
        f.code.focus();
        return;
      }
      await ctx.account.confirmEmail(f.code.value);
      f.reset();
      emStage(false);
      f.hidden = true;
    });
    pair("[data-pwbtn]", "[data-pwform]", null, async (f, m) => {
      await ctx.account.password(f.current.value, f.password.value);
      f.reset();
      say(m, "Password changed.", true);
    });
    pair("[data-delbtn]", "[data-delform]", null, async (f) => {
      await ctx.account.remove(f.password.value);
      f.reset();
      f.hidden = true;
    });
  },
  enter(root, ctx) {
    const me = ctx.account.me;
    const st = this.st;
    $("[data-auth]", root).hidden = !!me;
    $("[data-mine]", root).hidden = !me;
    ctx.wash(null);
    if (!me) {
      if (st.was) {
        st.form.reset();
        st.show("in");
      } else st.show(st.state);
      st.was = false;
      return;
    }
    if (!st.was) {
      st.form.reset();
      st.show("in");
    }
    st.was = true;
    const c = AVATARS[me.color] || AVATARS[0];
    const av = $("[data-pf]", root), pass = $("[data-pass]", root), up = $("[data-up]", root);
    av.textContent = me.pic ? "" : initials(me.display);
    av.style.background = me.pic ? 'center/cover url("' + me.pic + '")' : "linear-gradient(145deg," + c[0] + "," + c[1] + ")";
    up.innerHTML = me.pic ? '<img alt="" src="' + esc(me.pic) + '">' : ico("plus");
    up.classList.toggle("on", !!me.pic);
    pass.style.backgroundImage = me.cover ? 'linear-gradient(180deg,rgba(18,10,4,.12),rgba(18,10,4,.72)),url("' + still(me.cover, "w780") + '")' : "";
    pass.classList.toggle("img", !!me.cover);
    $("[data-name]", root).textContent = me.display;
    $("[data-user]", root).textContent = "@" + me.name;
    $("[data-since]", root).textContent = new Date(me.created).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    $$("[data-av]", root).forEach((b) => b.classList.toggle("on", !me.pic && +b.dataset.av === me.color));
    $$("[data-cov]", root).forEach((b) => b.classList.toggle("on", b.dataset.cov === me.cover));
    $("[data-vdn]", root).textContent = me.display;
    $("[data-vem]", root).textContent = me.email;
    const ab = $("[data-abform]", root);
    if (!ab.dataset.dirty) ab.about.value = me.about;
    this.privacy(root);
  },
  async covers(root, ctx) {
    const box = $("[data-covs]", root);
    if (box.childElementCount) return;
    const btn = (path, name) =>
      '<button class="cov" type="button" data-cov="' + esc(path) + '" aria-label="' + esc(name) + '">' + (path ? '<img alt="" src="' + still(path, "w300") + '">' : "") + "</button>";
    box.innerHTML = btn("", "Boba");
    let list = [];
    try {
      list = (await get("./api/watch/home?type=movie")).rows[0].items.filter((x) => x.backdrop).slice(0, 7).map((x) => [x.backdrop, x.name]);
    } catch {}
    const mine = ctx.account.me && ctx.account.me.cover;
    if (mine && !list.some(([p]) => p === mine)) list.unshift([mine, "Cover"]);
    box.innerHTML = btn("", "Boba") + list.map(([p, n]) => btn(p, n)).join("");
    $$("[data-cov]", box).forEach((b) => b.classList.toggle("on", b.dataset.cov === (mine || "")));
  },
  privacy(root) {
    const on = !!store.get("keep", true);
    const k = $("[data-keep]", root);
    k.classList.toggle("on", on);
    k.setAttribute("aria-checked", on);
    const seg = $("[data-forget]", root), f = String(store.get("forget", 0) || 0);
    $$("button", seg).forEach((b) => b.classList.toggle("on", b.dataset.fg === f));
    segThumb(seg);
  },
};
const settings = {
  html: () => {
    return '<div class="set"><h1 class="r">Settings</h1>' +
      '<div class="gt r" style="--d:.04s">Look</div><section class="grp gl g2 r" style="--d:.04s">' +
      '<div class="lr">' + lic("tv", "#7d8ba0", "#4a5566") + "<h3>Theme</h3></div>" +
      '<div class="thms" data-themes>' + THEMES.map(([v, n, m]) => '<button class="thm" type="button" data-v="' + v + '" data-pal="' + v + '" data-mode="' + m + '" aria-label="' + n + '"><span class="pv"></span><span>' + n + "</span></button>").join("") + "</div>" +
      '<div class="lr">' + lic("star", "#ffb547", "#ff7a1a") + '<h3>Accent</h3><div class="sws" data-acc>' +
      ACCENTS.map((c, i) => '<button class="sw" data-i="' + i + '" aria-label="Accent ' + (i + 1) + '" style="background:' + c[0] + '"></button>').join("") + "</div></div>" +
      '<div class="lr">' + lic("ask", "#c084fc", "#7c3aed") + '<h3>Effects</h3><div class="seg" data-fx><span class="th"></span><button data-v="full">Full</button><button data-v="lite">Lite</button></div></div></section>' +
      '<div class="gt r" style="--d:.08s">Browsing</div><section class="grp gl g2 r" style="--d:.08s">' +
      '<div class="lr">' + lic("web", "#43c2ff", "#3058f0") + '<h3>Default mode</h3><div class="seg" data-dmode><span class="th"></span><button data-v="swift">Swift</button><button data-v="deep">Deep</button></div></div>' +
      '<div class="lr">' + lic("shield", "#5ee08a", "#139b48") + '<h3>Block ads</h3><div class="tg" data-ads><i></i></div></div>' +
      '<div class="lr">' + lic("link", "#2be0e6", "#0b8f86") + '<h3>Connection</h3><span class="netst"><i data-cn></i><span data-cnm>Checking</span></span></div></section>' +
      '<div class="gt r" style="--d:.12s">This tab</div><section class="grp gl g2 r" style="--d:.12s">' +
      '<div class="lr">' + lic("lock", "#8b93a3", "#555e6e") + '<h3>Disguise</h3><select data-dz aria-label="Disguise"><option value="">Off</option>' +
      Object.keys(DISGUISES).map((k) => '<option value="' + k + '">' + k + "</option>").join("") + "</select></div>" +
      '<div class="lr">' + lic("out", "#ff7ac0", "#9b6bff") + '<h3>Detached window</h3><button class="btn k s" data-detach>Open</button></div>' +
      '<div class="lr">' + lic("signout", "#ffbe2e", "#ff4f2b") + "<h3>Quick exit</h3><span><kbd>Shift</kbd> <kbd>Esc</kbd></span></div>" +
      '<div class="lr">' + lic("trash", "#ff6b6b", "#d62e4a") + '<h3>Wipe everything</h3><button class="btn s" style="background:rgba(229,72,77,.12);color:#d62e4a" data-wipe>Wipe</button></div></section></div>';
  },
  mount(root, ctx) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest(".seg button[data-v]");
      if (b) {
        const seg = b.closest(".seg");
        if (seg.matches("[data-fx]")) ctx.setFx(b.dataset.v);
        if (seg.matches("[data-dmode]")) store.set("mode", b.dataset.v);
        return this.paint(root, ctx);
      }
      const th = e.target.closest(".thm[data-v]");
      if (th) {
        const t = THEMES.find((x) => x[0] === th.dataset.v);
        if (t && t[3] !== undefined) ctx.setAccent(t[3]);
        ctx.setTheme(th.dataset.v);
        return this.paint(root, ctx);
      }
      const sw = e.target.closest(".sw[data-i]");
      if (sw) {
        ctx.setAccent(+sw.dataset.i);
        return this.paint(root, ctx);
      }
      if (e.target.closest("[data-ads]")) {
        const on = !store.get("ads", true);
        store.set("ads", on);
        ctx.engine.setAdblock(on);
        return this.paint(root, ctx);
      }
      if (e.target.closest("[data-detach]")) return ctx.detach();
      if (e.target.closest("[data-wipe]")) return ctx.wipe();
    });
    $("[data-dz]", root).addEventListener("change", (e) => ctx.disguise(e.target.value));
  },
  paint(root) {
    const set = (sel, v) => {
      const seg = $(sel, root);
      $$("button", seg).forEach((x) => x.classList.toggle("on", x.dataset.v === v));
      segThumb(seg);
    };
    const theme = store.get("theme", "boba");
    $$(".thm", root).forEach((t) => {
      t.classList.toggle("on", t.dataset.v === theme);
      t.setAttribute("aria-pressed", t.dataset.v === theme);
    });
    set("[data-fx]", store.get("fx", "full"));
    set("[data-dmode]", store.get("mode", "deep"));
    const acc = store.get("accent", 6);
    $$(".sw", root).forEach((s) => s.classList.toggle("on", +s.dataset.i === acc));
    $("[data-ads]", root).classList.toggle("on", store.get("ads", true));
    $("[data-dz]", root).value = store.get("disguise", "");
  },
  enter(root, ctx) {
    this.paint(root, ctx);
    ctx.wash(null);
    ctx.engine.boot().then(
      () => {
        $("[data-cn]", root).classList.remove("off");
        $("[data-cnm]", root).textContent = "Connected";
      },
      () => {
        $("[data-cn]", root).classList.add("off");
        $("[data-cnm]", root).textContent = "Offline";
      }
    );
  },
};

export const VIEWS = { home, watch, listen, play, ask, account, settings };
export { metaRow, posterTile, runtime };
