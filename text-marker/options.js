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

chrome.storage.local.get("wholeWords", (d) => { $("whole").checked = !!d.wholeWords; });
$("whole").onchange = () => chrome.storage.local.set({ wholeWords: $("whole").checked });

$("export").click();
