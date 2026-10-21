const cache = new Map();

export function get(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

export const still = (path, size = "w342") => (path ? "https://image.tmdb.org/t/p/" + size + path : "");

export const favicon = (domain) => "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=128";

export const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(./^www\./, "");
  } catch {
    return "";
  }
};
