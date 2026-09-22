// background.js — Mentat Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Mentat] Extension installed. Standing by for cognitive pilot commands.");
  chrome.storage.local.set({
    mentatActive: true,
    speechEnabled: true,
    telemetryMode: "standard",
  });
});

// Handle keyboard command shortcut (Alt+M)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-mentat") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat" }).catch((err) => {
        console.warn("[Mentat] Tab not ready for content script:", err);
      });
    }
  }
});
