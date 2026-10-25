(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE_EDITOR"]);
  let marks = {};
  let enabled = true;
  let wholeWords = false;
  let markdown = false;
  let ruler = true;
  let rulerEl = null, thumbEl = null, rulerTimer = null;
  let observer = null;
  let timer = null;
  let tip = null;

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function buildRegex() {
    const words = Object.keys(marks).sort((a, b) => b.length - a.length);
    if (!words.length) return null;
    const alt = words.map((w) => escapeRe(w).replace(/ /g, "\\s+")).join("|");
    const src = wholeWords ? `(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])` : alt;
    return new RegExp(src, "giu");
  }

  function unwrapAll() {
    const els = document.querySelectorAll("mark.tm-mark");
    const parents = new Set();
    els.forEach((el) => {
      parents.add(el.parentNode);
      el.replaceWith(document.createTextNode(el.textContent));
    });
    parents.forEach((p) => p && p.normalize());
  }

  function highlight(root) {
    const re = buildRegex();
    if (!re) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName) || p.isContentEditable || p.closest("mark.tm-mark, .tm-md-src")) {
          return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const text = node.nodeValue;
      re.lastIndex = 0;
      let m, last = 0, frag = null;
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        const key = m[0].replace(/\s+/g, " ").toLowerCase();
        const color = marks[key];
        if (!color) continue;
        frag = frag || document.createDocumentFragment();
        frag.append(text.slice(last, m.index));
        const el = document.createElement("mark");
        el.className = "tm-mark";
        el.dataset.tm = key;
        el.style.cssText = `background:color-mix(in srgb, ${color} 70%, transparent) !important;color:#1a1a1a !important;padding:0;border-radius:2px;`;
        el.textContent = m[0];
        frag.append(el);
        last = m.index + m[0].length;
      }
      if (frag) {
        frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    }
  }

  function apply() {
    stopObserving();
    unwrapAll();
    if (enabled) highlight(document.body);
    startObserving();
    updateRuler();
  }

  // Overview strip at the right edge (like the VS Code scrollbar markers): one tick per
  // marked word at its relative position in the document; click a tick to jump there.
  function removeRuler() {
    if (rulerEl) rulerEl.remove();
    rulerEl = thumbEl = null;
  }

  function updateThumb() {
    if (!thumbEl) return;
    const h = Math.max(document.documentElement.scrollHeight, 1);
    thumbEl.style.top = (scrollY / h) * innerHeight + "px";
    thumbEl.style.height = Math.max((innerHeight / h) * innerHeight, 6) + "px";
  }

  function updateRuler() {
    if (window !== window.top) return;
    const els = enabled && ruler ? [...document.querySelectorAll("mark.tm-mark")] : [];
    if (!els.length) { removeRuler(); return; }

    // read all positions first, then write, to avoid layout thrashing
    const docH = Math.max(document.documentElement.scrollHeight, 1);
    const ticks = [], seen = new Set();
    for (const el of els) {
      if (!el.getClientRects().length) continue;
      const y = el.getBoundingClientRect().top + scrollY;
      const top = Math.min(Math.round((y / docH) * innerHeight), innerHeight - 3);
      const color = marks[el.dataset.tm];
      if (!color || seen.has(top + color)) continue;
      seen.add(top + color);
      ticks.push({ el, top, color });
    }

    if (!rulerEl) {
      rulerEl = document.createElement("div");
      rulerEl.style.cssText =
        "position:fixed;top:0;right:0;width:12px;height:100vh;z-index:2147483646;" +
        "background:rgba(127,127,127,.12);pointer-events:none;";
      rulerEl.addEventListener("click", (e) => {
        if (e.target._el) e.target._el.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      document.documentElement.append(rulerEl);
    }
    const frag = document.createDocumentFragment();
    thumbEl = document.createElement("div");
    thumbEl.style.cssText =
      "position:absolute;left:0;right:0;background:rgba(127,127,127,.3);pointer-events:none;";
    frag.append(thumbEl);
    for (const t of ticks) {
      const d = document.createElement("div");
      d.style.cssText =
        `position:absolute;left:1px;right:1px;top:${t.top}px;height:3px;background:${t.color};` +
        "box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:pointer;pointer-events:auto;";
      d.title = t.el.dataset.tm;
      d._el = t.el;
      frag.append(d);
    }
    rulerEl.replaceChildren(frag);
    updateThumb();
  }

  const scheduleRuler = () => { clearTimeout(rulerTimer); rulerTimer = setTimeout(updateRuler, 200); };
  addEventListener("resize", scheduleRuler);
  addEventListener("scroll", () => requestAnimationFrame(updateThumb), { passive: true });
  new ResizeObserver(scheduleRuler).observe(document.documentElement);

  function startObserving() {
    if (!enabled || !document.body) return;
    observer = observer || new MutationObserver((muts) => {
      // Ignore changes caused by our own marks
      const relevant = muts.some((m) =>
        [...m.addedNodes].some((n) => !(n.nodeType === 1 && n.classList.contains("tm-mark")) && n.nodeType !== 8) &&
        !(m.target.closest && m.target.closest("mark.tm-mark"))
      );
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(apply, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserving() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // Hover tooltip with occurrence count
  function showTip(el, x, y) {
    const key = el.dataset.tm;
    const count = [...document.querySelectorAll("mark.tm-mark")].filter((m) => m.dataset.tm === key).length;
    if (!tip) {
      tip = document.createElement("div");
      tip.style.cssText =
        "position:fixed;z-index:2147483647;background:#333;color:#fff;font:12px/1.4 sans-serif;" +
        "padding:3px 8px;border-radius:4px;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4);";
      document.documentElement.append(tip);
    }
    tip.textContent = `"${key}": ${count} on this page`;
    tip.style.left = Math.min(x + 12, innerWidth - 200) + "px";
    tip.style.top = y + 18 + "px";
    tip.style.display = "block";
  }

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest && e.target.closest("mark.tm-mark");
    if (el) showTip(el, e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", (e) => {
    if (tip && tip.style.display === "block") {
      tip.style.left = Math.min(e.clientX + 12, innerWidth - 200) + "px";
      tip.style.top = e.clientY + 18 + "px";
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (tip && e.target.closest && e.target.closest("mark.tm-mark")) tip.style.display = "none";
  });

  const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

  // Typography override: base text only (paragraphs, list items, quotes), never headings or tables.
  function applyTypo(t) {
    let style = document.getElementById("tm-typo");
    const rules = [];
    if (t && t.on) {
      if (t.font) rules.push(`font-family:"${t.font.replace(/"/g, "")}",sans-serif`);
      if (t.size) rules.push(`font-size:${t.size}px`);
      if (t.lh != null) rules.push(`line-height:${t.lh}`);
      if (t.ls != null) rules.push(`letter-spacing:${t.ls}px`);
      if (t.ws != null) rules.push(`word-spacing:${t.ws}px`);
      // Colors go on the page and text elements only. Highlights (<mark>) set their own
      // background and text color inline, so they always win and never vanish.
      if (isHex(t.fg)) rules.push(`color:${t.fg}`);
      if (isHex(t.bg)) rules.push(`background-color:${t.bg}`);
    }
    const pageBg = t && t.on && isHex(t.bg) ? t.bg : null;
    const cols = t && t.on && t.cols > 1 ? t.cols : 0;
    if (!rules.length && !cols && !pageBg) { if (style) style.remove(); return; }
    if (!style) {
      style = document.createElement("style");
      style.id = "tm-typo";
      document.documentElement.append(style);
    }
    style.textContent =
      (pageBg ? `html, body {background-color:${pageBg} !important;}` : "") +
      (rules.length
        ? ":is(p, li, blockquote, dd, dt, figcaption, pre):not(table *) {" +
          rules.map((r) => r + " !important").join(";") + "}"
        : "") +
      // Text documents (.txt/.md) are a lone <pre> in <body>; put the columns on the <pre> there.
      (cols
        ? `${/^text\/(?!html)/.test(document.contentType) ? "body > pre, body > .tm-md-root" : "body"}` +
          `{column-count:${cols} !important;column-gap:2em !important;width:auto !important;max-width:none !important;}`
        : "");
  }

  // Markdown rendering: only for .md files (a lone <pre> in a text document).
  // The original <pre> stays in the page, hidden, so switching the option off restores it.
  const MD_CSS =
    ".tm-md-src{display:none !important}" +
    ".tm-md-root{max-width:52em;margin:1.5em auto;padding:0 1em;font:16px/1.6 system-ui,sans-serif}" +
    ".tm-md-root pre.tm-code,.tm-md-root code{background:rgba(127,127,127,.18);border-radius:3px}" +
    ".tm-md-root code{padding:.1em .3em;font-family:Consolas,monospace}" +
    ".tm-md-root pre.tm-code{padding:.8em 1em;overflow:auto;white-space:pre}" +
    ".tm-md-root pre.tm-code code{padding:0;background:none}" +
    ".tm-md-root blockquote{margin:1em 0;padding:0 1em;border-left:4px solid rgba(127,127,127,.5)}" +
    ".tm-md-root table{border-collapse:collapse;margin:1em 0}" +
    ".tm-md-root th,.tm-md-root td{border:1px solid rgba(127,127,127,.5);padding:.3em .7em}" +
    ".tm-md-root hr{border:0;border-top:1px solid rgba(127,127,127,.5)}" +
    ".tm-md-root img{max-width:100%}";

  function applyMarkdown() {
    const pre = document.body && document.body.querySelector(":scope > pre");
    const isMd = document.contentType === "text/markdown" ||
      (/^text\/plain/.test(document.contentType) && /\.(md|markdown|mdown)$/i.test(location.pathname));
    if (!pre || !isMd) return;
    document.querySelectorAll("body > .tm-md-root").forEach((el) => el.remove());
    if (!markdown) { pre.classList.remove("tm-md-src"); return; }
    if (!document.getElementById("tm-md-style")) {
      const style = document.createElement("style");
      style.id = "tm-md-style";
      style.textContent = MD_CSS;
      document.documentElement.append(style);
    }
    const root = document.createElement("div");
    root.className = "tm-md-root";
    const tpl = document.createElement("template");
    tpl.innerHTML = tmRenderMarkdown(pre.textContent);
    root.append(tpl.content);
    pre.classList.add("tm-md-src");
    pre.after(root);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.typo) applyTypo(changes.typo.newValue);
    if (changes.markdown) {
      markdown = !!changes.markdown.newValue;
      stopObserving();
      applyMarkdown();
      apply();
    }
    if (changes.ruler) {
      ruler = changes.ruler.newValue !== false;
      updateRuler();
    }
    if (!(changes.marks || changes.enabled || changes.wholeWords)) return;
    if (changes.marks) marks = changes.marks.newValue || {};
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.wholeWords) wholeWords = !!changes.wholeWords.newValue;
    apply();
  });

  chrome.storage.local.get(["marks", "enabled", "wholeWords", "typo", "markdown", "ruler"], (data) => {
    marks = data.marks || {};
    ruler = data.ruler !== false;
    enabled = data.enabled !== false;
    wholeWords = !!data.wholeWords;
    markdown = !!data.markdown;
    applyTypo(data.typo);
    applyMarkdown();
    apply();
  });
})();
