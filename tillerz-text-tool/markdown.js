// Small Markdown renderer, no external libraries.
// Output is built only from escaped text and a fixed set of tags, and link/image URLs
// are limited to safe schemes, so rendering an untrusted file cannot inject script.
// Supports: headings (# and underline style), paragraphs, bold, italic, strikethrough,
// inline code, fenced and indented code blocks, block quotes, nested lists, task lists,
// tables, horizontal rules, links, images, autolinks and hard line breaks.
(() => {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (s) => s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const PH = /\u0000\d+\u0000/g; // placeholders used while formatting inline text
  const stripPh = (s) => s.replace(PH, "");

  function safeUrl(u) {
    u = stripPh(u).trim();
    const clean = u.replace(/[\u0000- \u007f-\u009f]/g, "");
    const m = /^([a-z][a-z0-9+.\-]*):/i.exec(clean);
    if (m && !/^(https?|mailto)$/i.test(m[1])) return "#";
    return u;
  }

  function inline(src) {
    const store = [];
    const hold = (html) => "\u0000" + (store.push(html) - 1) + "\u0000";
    const link = (url, inner, title) =>
      `<a href="${attr(safeUrl(url))}"${title ? ` title="${attr(stripPh(title))}"` : ""}` +
      ` target="_blank" rel="noopener noreferrer">${inner}</a>`;

    let t = src.replace(/\u0000/g, "");
    // code spans first, so nothing inside them is formatted
    t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, ticks, code) =>
      hold("<code>" + esc(code.replace(/\n/g, " ").replace(/^ (.*) $/, "$1")) + "</code>"));
    t = t.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/gi, (m, u) => hold(link(esc(u), esc(u))));
    t = esc(t);

    const fmt = (s) => {
      s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~])/g, (m, c) => hold(c));
      s = s.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (m, alt, url, title) =>
        hold(`<img src="${attr(safeUrl(url))}" alt="${attr(stripPh(alt))}"` +
          `${title ? ` title="${attr(stripPh(title))}"` : ""}>`));
      s = s.replace(/\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*([^\s)]*)(?:\s+"([^"]*)")?\s*\)/g,
        (m, text, url, title) => hold(link(url, fmt(text), title)));
      s = s.replace(/\bhttps?:\/\/[^\s\u0000<]+[^\s\u0000<.,:;"')\]!?]/g, (m) => hold(link(m, m)));
      s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>");
      s = s.replace(/(?<![A-Za-z0-9_])___(?=\S)([\s\S]*?\S)___(?![A-Za-z0-9_])/g, "<strong><em>$1</em></strong>");
      s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/(?<![A-Za-z0-9_])__(?=\S)([\s\S]*?\S)__(?![A-Za-z0-9_])/g, "<strong>$1</strong>");
      s = s.replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<em>$1</em>");
      s = s.replace(/(?<![A-Za-z0-9_])_(?=\S)([\s\S]*?\S)_(?![A-Za-z0-9_])/g, "<em>$1</em>");
      s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
      return s;
    };

    t = fmt(t).replace(/(?: {2,}|\\)\n/g, "<br>\n");
    for (let n = 0; n < 10 && /\u0000\d+\u0000/.test(t); n++) {
      t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => store[i]);
    }
    return t;
  }

  const isBlank = (l) => /^\s*$/.test(l);
  const indentOf = (l) => /^ */.exec(l)[0].length;
  const reFence = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  const reHeading = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
  const reHr = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const reQuote = /^ {0,3}>/;
  const reItem = /^( *)([-*+]|\d{1,9}[.)])( +|$)/;
  const reTableSep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  const splitRow = (line) => {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  };

  // Can this line end a paragraph?
  function interrupts(l) {
    if (reFence.test(l) || reHeading.test(l) || reHr.test(l) || reQuote.test(l)) return true;
    const m = reItem.exec(l);
    return !!m && l.slice(m[0].length).trim() !== "" && (!/\d/.test(m[2][0]) || parseInt(m[2], 10) === 1);
  }

  function blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }
      let m;

      if ((m = reFence.exec(line))) {
        const fence = m[1], lang = m[2], indent = indentOf(line);
        const close = new RegExp("^ {0,3}" + fence[0] + "{" + fence.length + ",}\\s*$");
        const body = [];
        i++;
        while (i < lines.length && !close.test(lines[i])) {
          body.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))));
          i++;
        }
        i++;
        out.push(`<pre class="tm-code"><code${lang ? ` class="language-${attr(esc(lang))}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
        continue;
      }

      if ((m = reHeading.exec(line))) {
        out.push(`<h${m[1].length}>${inline((m[2] || "").trim())}</h${m[1].length}>`);
        i++;
        continue;
      }

      if (reHr.test(line)) { out.push("<hr>"); i++; continue; }

      if (reQuote.test(line)) {
        const q = [];
        while (i < lines.length && !isBlank(lines[i]) && (reQuote.test(lines[i]) || !interrupts(lines[i]))) {
          q.push(lines[i].replace(/^ {0,3}> ?/, ""));
          i++;
        }
        out.push(`<blockquote>${blocks(q)}</blockquote>`);
        continue;
      }

      if (line.includes("|") && i + 1 < lines.length && reTableSep.test(lines[i + 1])) {
        const head = splitRow(line), seps = splitRow(lines[i + 1]);
        if (head.length === seps.length && seps.every((c) => /^:?-+:?$/.test(c))) {
          const al = seps.map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : ""));
          const cell = (tag, c, k) =>
            `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ""}>${inline(c)}</${tag}>`;
          const rows = [];
          i += 2;
          while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
            const cells = splitRow(lines[i]);
            rows.push("<tr>" + head.map((_, k) => cell("td", cells[k] || "", k)).join("") + "</tr>");
            i++;
          }
          out.push(`<table class="tm-table"><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead>` +
            `<tbody>${rows.join("")}</tbody></table>`);
          continue;
        }
      }

      if (/^( {4}|\t)/.test(line)) {
        const code = [];
        while (i < lines.length && (isBlank(lines[i]) || /^( {4}|\t)/.test(lines[i]))) {
          code.push(lines[i].replace(/^( {4}|\t)/, ""));
          i++;
        }
        while (code.length && isBlank(code[code.length - 1])) code.pop();
        out.push(`<pre class="tm-code"><code>${esc(code.join("\n"))}</code></pre>`);
        continue;
      }

      if ((m = reItem.exec(line))) {
        const base = m[1].length;
        const ordered = /\d/.test(m[2][0]);
        const start = ordered ? parseInt(m[2], 10) : 1;
        const items = [];
        let cur = null, loose = false, prevBlank = false;
        while (i < lines.length) {
          const l = lines[i];
          if (isBlank(l)) {
            let j = i + 1;
            while (j < lines.length && isBlank(lines[j])) j++;
            if (j >= lines.length || !cur) break;
            const nm = reItem.exec(lines[j]), ni = indentOf(lines[j]);
            if ((nm && ni === base && /\d/.test(nm[2][0]) === ordered) || ni > base) {
              cur.lines.push("");
              loose = true;
              prevBlank = true;
              i++;
              continue;
            }
            break;
          }
          const im = reItem.exec(l);
          if (im && im[1].length === base) {
            if (/\d/.test(im[2][0]) !== ordered) break;
            cur = { indent: im[0].length, lines: [l.slice(im[0].length)] };
            items.push(cur);
          } else if (im && im[1].length < base) {
            break;
          } else {
            if (!cur) break;
            if (indentOf(l) < cur.indent && !im && (prevBlank || interrupts(l))) break;
            cur.lines.push(l.slice(Math.min(cur.indent, indentOf(l))));
          }
          prevBlank = false;
          i++;
        }
        const html = items.map((it) => {
          let first = it.lines[0], box = "";
          const tm = /^\[([ xX])\]\s+/.exec(first);
          if (tm) {
            box = `<input type="checkbox" disabled${tm[1] === " " ? "" : " checked"}> `;
            it.lines[0] = first.slice(tm[0].length);
          }
          let inner = blocks(it.lines);
          if (!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
          return `<li>${box}${inner}</li>`;
        }).join("");
        out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ""}>${html}</ol>` : `<ul>${html}</ul>`);
        continue;
      }

      // paragraph, or a heading written with an === / --- underline
      const para = [line];
      let setext = 0;
      i++;
      while (i < lines.length && !isBlank(lines[i])) {
        const l = lines[i];
        if (/^ {0,3}=+\s*$/.test(l)) { setext = 1; i++; break; }
        if (/^ {0,3}-+\s*$/.test(l)) { setext = 2; i++; break; }
        if (interrupts(l)) break;
        para.push(l);
        i++;
      }
      const text = inline(para.map((l) => l.replace(/^\s+/, "")).join("\n").trim());
      out.push(setext ? `<h${setext}>${text}</h${setext}>` : `<p>${text}</p>`);
    }
    return out.join("\n");
  }

  globalThis.tmRenderMarkdown = (text) =>
    blocks(text.replace(/\r\n?/g, "\n").replace(/^\t+/gm, (t) => "    ".repeat(t.length)).split("\n"));
})();
