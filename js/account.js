import { store, unexpired } from "./ui.js";

const SETTINGS = ["theme", "accent", "fx", "mode", "ads", "keep", "forget", "cleared", "links"];
const SYNC = new Set(["history", "saved", ...SETTINGS]);
const subs = new Set();
let me = null, applying = false, timer = 0, dirty = false;

async function call(path, body, method) {
  const r = await fetch("./api/account" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    keepalive: method === "PUT",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.msg || "Something went wrong. Try again.");
  return d;
}

const snapshot = () => ({
  history: unexpired(store.get("history", [])),
  saved: store.get("saved", []),
  settings: Object.fromEntries(SETTINGS.map((k) => [k, store.get(k, null)]).filter(([, v]) => v !== null)),
});

const byKey = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x.key === "string") : []);

function apply(d, merge) {
  d = d && typeof d === "object" ? d : {};
  applying = true;
  const s = d.settings && typeof d.settings === "object" ? d.settings : {};
  const cleared = Math.max(+store.get("cleared", 0) || 0, +s.cleared || 0);
  for (const k of SETTINGS) if (k in s) store.set(k, s[k]);
  if (cleared) store.set("cleared", cleared);
  const seen = new Map();
  for (const x of [...byKey(store.get("history", [])), ...byKey(d.history)]) {
    const o = seen.get(x.key);
    if (!o || (x.at || 0) > (o.at || 0)) seen.set(x.key, o ? { ...o, ...x } : x);
  }
  store.set("history", unexpired([...seen.values()]).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 60));
  const local = byKey(store.get("saved", []));
  const remote = byKey(d.saved);
  const saved = merge || !Array.isArray(d.saved) ? [...local, ...remote.filter((x) => !local.some((y) => y.key === x.key))] : remote;
  store.set("saved", saved.slice(0, 300));
  applying = false;
}

async function push() {
  if (!me || !dirty) return;
  dirty = false;
  try {
    await call("./data", { data: snapshot() }, "PUT");
  } catch {
    dirty = true;
  }
}

const later = (ms = 1200) => {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(push, ms);
};

store.watch((k) => {
  if (me && !applying && SYNC.has(k)) later();
});
addEventListener("visibilitychange", () => document.visibilityState === "hidden" && dirty && push());

const emit = () => subs.forEach((fn) => fn(me));

const signedIn = (d) => {
  me = d.user;
  apply(d.data, true);
  later(0);
  emit();
  return me;
};
const updated = (d) => {
  me = d.user;
  emit();
  return me;
};

export const account = {
  get me() {
    return me;
  },
  on: (fn) => subs.add(fn),
  async boot() {
    try {
      const d = await call("");
      if (d.user) {
        me = d.user;
        apply(d.data, false);
      }
    } catch {}
    emit();
  },
  login: (email, password) => call("./login", { email, password }).then(signedIn),
  register: (name, email, password) => call("./register", { name, email, password }),
  verify: (email, code, tok) => call("./register/verify", { email, code, tok }).then(signedIn),
  sendCode: (email, purpose) => call("./code", { email, purpose }),
  codeLogin: (email, code) => call("./code/login", { email, code }).then(signedIn),
  reset: (email, code, password) => call("./reset", { email, code, password }).then(signedIn),
  changeEmail: (email, password) => call("./email", { email, password }),
  confirmEmail: (code) => call("./email/verify", { code }).then(updated),
  profile: (fields) => call("./profile", fields).then(updated),
  async upload(blob) {
    const r = await fetch("./api/account/pic", { method: "POST", headers: { "Content-Type": blob.type }, body: blob, credentials: "same-origin" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.msg || "Something went wrong. Try again.");
    return updated(d);
  },
  dropPic: () => call("./pic", null, "DELETE").then(updated),
  async download() {
    const r = await fetch("./api/account/export", { credentials: "same-origin" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).msg || "Something went wrong. Try again.");
    return r.blob();
  },
  async leave() {
    await push();
    try {
      await call("./logout", {});
    } catch {}
    me = null;
    emit();
  },
  password: (current, password) => call("./password", { current, password }),
  async remove(password) {
    await call("./delete", { password });
    me = null;
    emit();
  },
};
