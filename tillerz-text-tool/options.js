const $ = (id) => document.getElementById(id);
const norm = (s) => s.replace(/[​-‍⁠﻿­]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

$("names").textContent = COLORS.map((c) => c.id).join(", ");
for (const c of COLORS) $("def").add(new Option(c.icon + " " + c.id, c.id));

function toHex(name) {
  const c = COLORS.find((c) => c.id === name.toLowerCase());
  if (c) return c.hex;
  return /^#[0-9a-f]{3,8}$/i.test(name) ? name : null;
}

function parse(text) {
  const result = {};
  let skipped = 0;
  const defHex = toHex($("def").value);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.lastIndexOf("|");
    let word = line, hex = defHex;
    if (i >= 0) {
      word = line.slice(0, i);
      hex = toHex(line.slice(i + 1).trim());
      if (!hex) { skipped++; continue; }
    }
    word = norm(word);
    if (word) result[word] = hex;
  }
  return { result, skipped };
}

async function load() {
  const { marks = {} } = await chrome.storage.local.get("marks");
  return marks;
}

function format(marks) {
  return Object.keys(marks).sort().map((w) => {
    const c = COLORS.find((c) => c.hex === marks[w]);
    return w + " | " + (c ? c.id : marks[w]);
  }).join("\n");
}

function status(msg) { $("status").textContent = msg; }

async function doImport(replace) {
  const { result, skipped } = parse($("text").value);
  const marks = replace ? result : { ...(await load()), ...result };
  await chrome.storage.local.set({ marks });
  status(`Imported ${Object.keys(result).length} entries` + (skipped ? `, ${skipped} lines skipped (unknown color)` : "") + `. Total: ${Object.keys(marks).length}.`);
}

$("import").onclick = () => doImport(false);
$("replace").onclick = () => {
  if (confirm("Replace ALL existing marks with the list in the text box?")) doImport(true);
};
$("export").onclick = async () => {
  const marks = await load();
  $("text").value = format(marks);
  status(`${Object.keys(marks).length} entries loaded.`);
};
$("download").onclick = async () => {
  const blob = new Blob([format(await load())], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "text-marker-export.txt";
  a.click();
};

chrome.storage.local.get("markdown", (d) => { $("md").checked = !!d.markdown; });
$("md").onchange = () => chrome.storage.local.set({ markdown: $("md").checked });
chrome.storage.local.get("wholeWords", (d) => { $("whole").checked = !!d.wholeWords; });
$("whole").onchange = () => chrome.storage.local.set({ wholeWords: $("whole").checked });

// ---- Text appearance ----
const SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];
$("size").add(new Option("Page default", ""));
for (const s of SIZES) $("size").add(new Option(s + " px", s));

// Sample highlights in the preview, styled exactly like the real ones (see content.js)
document.querySelectorAll("#preview mark.pv").forEach((m) => {
  const c = COLORS[Number(m.dataset.c) % COLORS.length];
  m.style.cssText = `background:color-mix(in srgb, ${c.hex} 70%, transparent);color:#1a1a1a;padding:0;border-radius:2px;`;
});

function updatePreview() {
  const p = $("preview").style;
  p.fontFamily = $("font").value ? `"${$("font").value}", sans-serif` : "";
  p.fontSize = $("size").value ? $("size").value + "px" : "";
  p.lineHeight = $("lhDef").checked ? "" : $("lh").value;
  p.letterSpacing = $("lsDef").checked ? "" : $("ls").value + "px";
  p.wordSpacing = $("wsDef").checked ? "" : $("ws").value + "px";
  p.backgroundColor = $("bgDef").checked ? "" : $("bg").value;
  p.color = $("fgDef").checked ? "" : $("fg").value;
  $("bg").disabled = $("bgDef").checked;
  $("fg").disabled = $("fgDef").checked;
  p.columnCount = $("cols").value;
  p.columnGap = "2em";
  $("colsOut").textContent = $("cols").value;
  $("lh").disabled = $("lhDef").checked;
  $("ls").disabled = $("lsDef").checked;
  $("ws").disabled = $("wsDef").checked;
  $("wsOut").textContent = $("wsDef").checked ? "" : $("ws").value + " px";
  $("lhOut").textContent = $("lhDef").checked ? "" : $("lh").value;
  $("lsOut").textContent = $("lsDef").checked ? "" : $("ls").value + " px";
}

function saveTypo() {
  updatePreview();
  chrome.storage.local.set({
    typo: {
      on: $("typoOn").checked,
      font: $("font").value,
      size: $("size").value ? Number($("size").value) : null,
      lh: $("lhDef").checked ? null : Number($("lh").value),
      ls: $("lsDef").checked ? null : Number($("ls").value),
      ws: $("wsDef").checked ? null : Number($("ws").value),
      bg: $("bgDef").checked ? null : $("bg").value,
      fg: $("fgDef").checked ? null : $("fg").value,
      cols: Number($("cols").value)
    }
  });
}

async function initTypo() {
  const { typo = {} } = await chrome.storage.local.get("typo");
  $("font").add(new Option("Page default", ""));
  let names = [];
  try {
    names = (await chrome.fontSettings.getFontList()).map((f) => f.displayName);
  } catch (e) { /* font list unavailable */ }
  if (typo.font && !names.includes(typo.font)) names.push(typo.font);
  for (const n of [...new Set(names)].sort((a, b) => a.localeCompare(b))) {
    $("font").add(new Option(n, n));
  }
  $("typoOn").checked = !!typo.on;
  $("font").value = typo.font || "";
  $("size").value = typo.size || "";
  $("lhDef").checked = typo.lh == null;
  $("lh").value = typo.lh ?? 1.5;
  $("lsDef").checked = typo.ls == null;
  $("ls").value = typo.ls ?? 0;
  $("wsDef").checked = typo.ws == null;
  $("ws").value = typo.ws ?? 0;
  $("cols").value = typo.cols || 1;
  $("bgDef").checked = !typo.bg;
  if (typo.bg) $("bg").value = typo.bg;
  $("fgDef").checked = !typo.fg;
  if (typo.fg) $("fg").value = typo.fg;
  updatePreview();
  for (const id of ["typoOn", "font", "size", "lhDef", "lsDef", "wsDef", "bgDef", "fgDef"]) $(id).onchange = saveTypo;
  for (const id of ["lh", "ls", "ws", "cols", "bg", "fg"]) $(id).oninput = saveTypo;
}
initTypo();

$("export").click();
