importScripts("colors.js");

const UNMARK_ID = "tm-unmark";

function normalize(text) {
  // strip invisible characters (zero-width, BOM, soft hyphen), then trim whitespace incl. non-breaking spaces
  return text.replace(/[​-‍⁠﻿­]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function isEnabled() {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  return enabled;
}

async function refreshUi() {
  const enabled = await isEnabled();
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#888" });
  const ids = [UNMARK_ID, ...COLORS.map((c) => "tm-mark-" + c.id)];
  for (const id of ids) {
    chrome.contextMenus.update(id, { visible: enabled }).catch(() => {});
  }
}

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: UNMARK_ID, title: "unmark", contexts: ["selection"] });
    for (const c of COLORS) {
      chrome.contextMenus.create({
        id: "tm-mark-" + c.id,
        title: c.icon + "  mark",
        contexts: ["selection"]
      });
    }
    refreshUi();
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(refreshUi);

chrome.action.onClicked.addListener(async () => {
  await chrome.storage.local.set({ enabled: !(await isEnabled()) });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) refreshUi();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const word = normalize(info.selectionText || "");
  if (!word) return;
  const { marks = {} } = await chrome.storage.local.get("marks");
  if (info.menuItemId === UNMARK_ID) {
    delete marks[word];
  } else {
    const color = COLORS.find((c) => "tm-mark-" + c.id === info.menuItemId);
    if (!color) return;
    marks[word] = color.hex;
  }
  await chrome.storage.local.set({ marks });
});
