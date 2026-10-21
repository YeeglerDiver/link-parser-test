importScripts("./a/core.js", "./a/cfg.js", "./a/work.js", "./a/d/all.js");

const swift = new NetSW();
const SWIFT_PREFIX = self.__io$config.prefix;
const DEEP_PREFIX = "./d/";

let deep = null;
let deepCfg = null;

function deepWorker() {
  if (deep) return deep;
  const load = self.$scramjetLoadWorker;
  if (typeof load !== "function") return null;
  const { ScramjetServiceWorker } = load();
  deep = new ScramjetServiceWorker();
  const dispatch = deep.dispatch.bind(deep);
  deep.dispatch = async (client, data) => {
    if (data && data.scramjet$type === "cookie" && !String(data.cookie).includes("=")) return;
    dispatch(client, data);
  };
  return deep;
}

function deepReady() {
  const w = deepWorker();
  if (!w) return Promise.reject(new Error("deep unavailable"));
  deepCfg = deepCfg || w.loadConfig();
  return deepCfg;
}

const BLOCK = [
  "googlesyndication.com", "googleadservices.com", "doubleclick.net", "adservice.google",
  "googletagservices.com", "adnxs.com", "amazon-adsystem.com", "rubiconproject.com",
  "pubmatic.com", "criteo.com", "criteo.net", "openx.net", "taboola.com", "outbrain.com",
  "moatads.com", "casalemedia.com", "adsafeprotected.com", "smartadserver.com", "media.net",
  "scorecardresearch.com", "quantserve.com", "krxd.net", "demdex.net", "hotjar.com",
  "mixpanel.com", "segment.io", "popads.net", "popcash.net", "propellerads.com",
  "hilltopads.net", "adsterra.com", "adsterra.net", "onclickads.net", "onclkds.com",
  "clickadu.com", "exoclick.com", "exosrv.com", "juicyads.com", "trafficstars.com",
  "adcash.com", "admaven", "ad-maven", "mgid.com", "revcontent.com", "bidvertiser.com",
  "zeropark.com", "propu.sh", "poptm.com", "monetag.com", "yllix.com", "popunder",
  "highperformanceformat", "creativecdn.com", "adskeeper.com", "zedo.com", "2mdn.net",
  "./pagead/", "./ptracking", "./popunder", "./pop.js", "./push-sw", "./adframe", "./advert",
  "fundingchoicesmessages.google.com", "cdn.privacy-mgmt.com", "prebid.org", "browsiprod.com",
];

let adblock = true;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("message", ({ data }) => {
  if (data && data.type === "adblock") adblock = !!data.on;
});

function realOf(u) {
  if (u.origin !== location.origin) return u.href;
  if (u.pathname.startsWith(SWIFT_PREFIX)) {
    try {
      return self.__io$config.decodeUrl(u.pathname.slice(SWIFT_PREFIX.length) + u.search);
    } catch {
      return "";
    }
  }
  if (u.pathname.startsWith(DEEP_PREFIX)) return decodeURIComponent(u.pathname.slice(DEEP_PREFIX.length));
  return u.href;
}

const blocked = (s) => adblock && !!s && BLOCK.some((p) => s.includes(p));
const isDoc = (req) => req.destination === "document" || req.destination === "iframe";

async function fail(req) {
  if (!isDoc(req)) return Response.error();
  const tpl = await fetch("./stall.html", { cache: "no-store" }).then((r) => r.text()).catch(() => "");
  if (!tpl) return Response.error();
  return new Response(tpl, {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

self.addEventListener("fetch", (event) => {
  let u;
  try {
    u = new URL(event.request.url);
  } catch {
    return;
  }

  if (u.origin === location.origin && blocked(realOf(u))) return event.respondWith(new Response(null, { status: 204 }));

  if (u.origin === location.origin && (u.pathname.startsWith(DEEP_PREFIX) || (u.pathname === "./a/d/rw.wasm" && event.request.destination === "script"))) {
    return event.respondWith(
      (async () => {
        try {
          await deepReady();
          return await deep.fetch(event);
        } catch {
          return fail(event.request);
        }
      })()
    );
  }

  if (!swift.route(event)) return;
  event.respondWith(
    (async () => {
      try {
        const r = await swift.fetch(event);
        if (r.status === 500 && isDoc(event.request) && (await r.clone().text()).includes('id="errorTrace"')) return fail(event.request);
        return r;
      } catch {
        return fail(event.request);
      }
    })()
  );
});
