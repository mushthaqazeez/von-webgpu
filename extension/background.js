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
    if (!tab || !tab.id) return;

    const url = tab.url || "";
    if (
      url.startsWith("chrome://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("view-source:")
    ) {
      console.warn("[Mentat] Cannot run on internal browser URLs:", url);
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat" });
    } catch (err) {
      console.log("[Mentat Background] Tab missing content script. Injecting dynamically...", err);
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content.css"],
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["engine.js", "content.js"],
        });

        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat" });
          } catch (retryErr) {
            console.error("[Mentat Background] Retry failed:", retryErr);
          }
        }, 120);
      } catch (injectErr) {
        console.warn("[Mentat Background] Dynamic injection failed:", injectErr);
      }
    }
  }
});
