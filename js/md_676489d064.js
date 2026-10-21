import { esc, ico } from "./ui.js";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/";
export const LIBS = {
  katexCss: [CDN + "KaTeX/0.16.11/katex.min.css", "sha512-aOFyMMzZF7l7ei3vOKgQiRhZnYqk9YC/uMzl4T0j5N5D3Kul+QAFU8ssENDRMAqr/lxDOjMF69dSYJ8HYqY+WQ=="],
  katex: [CDN + "KaTeX/0.16.11/katex.min.js", "sha512-UPFOadao2nEorjtjl0xUTtN3w20Ja143UPEU6EyJ1mi5MB2bDtMkiWmqGDqi47xNLB5z1dy31GKJDEWhjUJFiQ=="],
  mhchem: [CDN + "KaTeX/0.16.11/contrib/mhchem.min.js", "sha512-mxjNw/u1lIsFC09k/unscDRY3ofIYPVFbWkP8slrePcS36ht4d/OZ8rRu5yddB2uiqajhTcLD8+jupOWuYPebg=="],
  mermaid: [CDN + "mermaid/11.15.0/mermaid.min.js", "sha512-HH52omhHpZF6RfVnGiQwYgYm4H/ya2xsZYLl5xJ4+tLfX+rN4+8zF7V/H/KLeicPrKZYi1g6iBmVkk2AhXTGlg=="],
  pdf: [CDN + "pdf.js/3.11.174/pdf.min.js", "sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ=="],
  pdfWorker: CDN + "pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: [CDN + "mammoth/1.8.0/mammoth.browser.min.js", "sha512-wuWo/cLB9W5BsZeyTYLuiTwr+FDlvjQC7C6atr+To7Jk92XHWI7WsImJZiruw7C9bnc8Zg7N0ncQI2Q/B4PQYw=="],
};

const loaded = new Map();
export function load([src, sri]) {
  if (!loaded.has(src))
    loaded.set(
      src,
      new Promise((res, rej) => {
        const css = src.endsWith(".css");
        const node = document.createElement(css ? "link" : "script");
        if (css) {
          node.rel = "stylesheet";
          node.href = src;
        } else node.src = src;
        node.integrity = sri;
        node.crossOrigin = "anonymous";
        node.onload = res;
        node.onerror = () => {
          loaded.delete(src);
          node.remove();
          rej(new Error("load"));
        };
        document.head.append(node);
      }),
    );
  return loaded.get(src);
}

let mathing = null;
const mathLib = () =>
  (mathing ||= Promise.all([load(LIBS.katexCss), load(LIBS.katex)])
    .then(() => load(LIBS.mhchem))
    .catch((e) => {
      mathing = null;
      throw e;
    }));

const ENV = /\\begin\{(aligned|align\*?|gather\*?|equation\*?|cases|[pbvBV]?matrix|array)\}[\s\S]+?\\end\{\1\}/g;
function grab(s, maths) {
  const put = (tex, display) => {
    maths.push({ tex: tex.trim(), display });
    const n = maths.length - 1;
    return display ? "\n\u0002" + n + "\u0002\n" : "\u0001" + n + "\u0001";
  };
  return s
    .replace(./\$\$([\s\S]+?)\$\$/g, (_, t) => put(t, true))
    .replace(./\\\[([\s\S]+?)\\\]/g, (_, t) => put(t, true))
    .replace(ENV, (m) => put(m, true))
    .replace(./\\\(([\s\S]+?)\\\)/g, (_, t) => put(t, false))
    .replace(/(^|[^\\\w$])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?![\w$])/g, (_, pre, t) => pre + put(t, false));
}
function protect(src, maths) {
  const out = [];
  let fence = false, buf = [];
  const flush = () => {
    if (buf.length) out.push(buf.join("\n").split(/(`[^`\n]+`)/g).map((p, i) => (i % 2 ? p : grab(p, maths))).join(""));
    buf = [];
  };
  for (const l of src.split("\n")) {
    if (./^\s*```/.test(l)) {
      if (!fence) flush();
      fence = !fence;
      out.push(l);
    } else if (fence) out.push(l);
    else buf.push(l);
  }
  flush();
  return out.join("\n");
}
const texHtml = (m, display) => {
  if (!m) return "";
  if (window.katex)
    try {
      return window.katex.renderToString(m.tex, { displayMode: display, throwOnError: false, output: "html" });
    } catch {}
  return '<code class="tex">' + esc(m.tex) + "</code>";
};

let cites = [];
const mdInline = (s) =>
  String(s)
    .split(/(`[^`\n]+`)/g)
    .map((part, i) =>
      i % 2
        ? "<code>" + esc(part.slice(1, -1)) + "</code>"
        : esc(part)
            .replace(./\*\*(.+?)\*\*/g, "<b>$1</b>")
            .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
            .replace(./\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
            .replace(./【(\d{1,2})(?:†[^】]*)?】/g, "[$1]")
            .replace(./\[(\d{1,2})\](?!\()/g, (m, n) => (cites[n - 1] ? '<a class="cite" href="' + esc(cites[n - 1].url) + '">' + n + "</a>" : m)),
    )
    .join("");

const SPECIAL = /^\s*(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||\u0002|([-*_])(\s*\2){2,}\s*$)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const cells = (row) => row.trim().replace(./^\||\|$/g, "").split("|").map((c) => c.trim());

export function md(src, { sources = [], onReady } = {}) {
  const maths = [];
  const lines = protect(String(src).replace(./\r/g, ""), maths).split("\n");
  cites = Array.isArray(sources) ? sources : [];
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(./^\s*```\s*([\w+#.-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      const closed = i < lines.length;
      i++;
      const code = buf.join("\n");
      if (./^mermaid$/i.test(fence[1]))
        out.push('<div class="mmd" data-mmd="' + esc(code) + '"' + (closed ? "" : " data-open") + '><span class="ai-dots"><i></i><i></i><i></i></span></div>');
      else out.push('<pre><button class="cpy" type="button" data-cpy aria-label="Copy code">' + ico("copy") + "</button><code>" + esc(code) + "</code></pre>");
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    if (./^\s*\u0002\d+\u0002\s*$/.test(l)) {
      out.push(l.trim());
      i++;
      continue;
    }
    const h = l.match(./^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const n = Math.min(6, h[1].length + 2);
      out.push("<h" + n + ">" + mdInline(h[2]) + "</h" + n + ">");
      i++;
      continue;
    }
    if (./^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push("<table><thead><tr>" + head.map((c) => "<th>" + mdInline(c) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => "<td>" + mdInline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    if (RULE.test(l)) {
      out.push("<hr>");
      i++;
      continue;
    }
    const list = l.match(./^\s*([-*+]|\d+[.)])\s+/);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) item += "<br>" + lines[i++].trim();
        items.push(item);
      }
      const tag = ordered ? "ol" : "ul";
      out.push("<" + tag + ">" + items.map((x) => "<li>" + x.split("<br>").map(mdInline).join("<br>") + "</li>").join("") + "</" + tag + ">");
      continue;
    }
    if (./^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(./^\s*>\s?/, ""));
      out.push("<blockquote>" + buf.map(mdInline).join("<br>") + "</blockquote>");
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !SPECIAL.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push("<p>" + buf.map(mdInline).join("<br>") + "</p>");
  }
  cites = [];
  if (maths.length && !window.katex && onReady) mathLib().then(onReady, () => {});
  return out
    .join("")
    .replace(./\u0002(\d+)\u0002/g, (_, n) => '<div class="mth">' + texHtml(maths[+n], true) + "</div>")
    .replace(./\u0001(\d+)\u0001/g, (_, n) => texHtml(maths[+n], false));
}

let drawing = null, drawn = 0;
const asCode = (box) => {
  box.classList.add("done");
  box.innerHTML = '<pre><button class="cpy" type="button" data-cpy aria-label="Copy code">' + ico("copy") + "</button><code>" + esc(box.dataset.mmd) + "</code></pre>";
};
export async function diagrams(root) {
  const boxes = [...root.querySelectorAll(".mmd:not(.done):not([data-open])")];
  if (!boxes.length) return;
  try {
    await (drawing ||= load(LIBS.mermaid).catch((e) => {
      drawing = null;
      throw e;
    }));
  } catch {
    return boxes.forEach(asCode);
  }
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => cs.getPropertyValue(k).trim();
  const dark = document.documentElement.dataset.theme === "dark";
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "Inter, system-ui, sans-serif",
    flowchart: { curve: "basis", padding: 14 },
    themeVariables: {
      darkMode: dark,
      background: "transparent",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "14px",
      primaryColor: dark ? "#232733" : "#ffffff",
      primaryTextColor: v("--ink"),
      primaryBorderColor: v("--ink-3"),
      lineColor: v("--acc"),
      secondaryColor: dark ? "#2b303d" : "#f6f1ea",
      tertiaryColor: dark ? "#1b1e27" : "#fbf8f4",
      textColor: v("--ink"),
    },
  });
  for (const box of boxes) {
    if (!box.isConnected) continue;
    box.classList.add("done");
    const code = box.dataset.mmd, tries = [code];
    if (./^\s*(flowchart|graph)\b/.test(code)) tries.push(quoteLabels(code));
    for (const src of tries) {
      try {
        const { svg } = await window.mermaid.render("mmd" + ++drawn, src);
        box.innerHTML = svg;
        break;
      } catch {
        document.getElementById("dmmd" + drawn)?.remove();
      }
    }
    if (!box.querySelector(":scope > svg")) asCode(box);
  }
}
const quoteLabels = (code) =>
  code.replace(./\b([\w-]+)\[(?!["[(./\\])([^\]\n]*[(){}<>|#;:,][^\]\n]*)\](?!\])/g, (_, id, label) => id + '["' + label.replace(/"./g, "'") + '"]');
