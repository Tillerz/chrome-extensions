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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.marks) marks = changes.marks.newValue || {};
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.wholeWords) wholeWords = !!changes.wholeWords.newValue;
    apply();
  });

  chrome.storage.local.get(["marks", "enabled", "wholeWords"], (data) => {
    marks = data.marks || {};
    enabled = data.enabled !== false;
    wholeWords = !!data.wholeWords;
    apply();
  });
})();
