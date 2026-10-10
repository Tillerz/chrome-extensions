(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE_EDITOR"]);
  let marks = {};
  let enabled = true;
  let wholeWords = false;
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
        if (!p || SKIP.has(p.tagName) || p.isContentEditable || p.closest("mark.tm-mark")) {
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
  }

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
        ? `${/^text\/(?!html)/.test(document.contentType) ? "body > pre" : "body"}` +
          `{column-count:${cols} !important;column-gap:2em !important;width:auto !important;max-width:none !important;}`
        : "");
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.typo) applyTypo(changes.typo.newValue);
    if (!(changes.marks || changes.enabled || changes.wholeWords)) return;
    if (changes.marks) marks = changes.marks.newValue || {};
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.wholeWords) wholeWords = !!changes.wholeWords.newValue;
    apply();
  });

  chrome.storage.local.get(["marks", "enabled", "wholeWords", "typo"], (data) => {
    marks = data.marks || {};
    enabled = data.enabled !== false;
    wholeWords = !!data.wholeWords;
    applyTypo(data.typo);
    apply();
  });
})();
