export function popHourly() {
  if (window.__bpu) return;
  window.__bpu = 1;
  const s = document.createElement("script");
  s.src = "./js/pop.js";
  (document.body || document.documentElement).appendChild(s);
}

export function banner(slot) {
  if (!slot || slot.dataset.on || innerWidth < 800) return;
  slot.dataset.on = "1";
  window.atOptions = {
    key: "df666d179d477ed91585a5e22b5ff66d",
    format: "iframe",
    height: 90,
    width: 728,
    params: {},
  };
  const s = document.createElement("script");
  s.src = "https://bicea.org/22/df666d179d477ed91585a5e22b5ff66d";
  slot.appendChild(s);
}
