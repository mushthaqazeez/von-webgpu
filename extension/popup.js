// popup.js — Mentat Extension Popup Controller

document.getElementById("btn-summon-hud").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat" });
    window.close();
  }
});

// Clickable sample chips
document.querySelectorAll(".quick-chip").forEach((chip) => {
  chip.addEventListener("click", async () => {
    const text = chip.innerText.replace(/"/g, "");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat" });
      window.close();
    }
  });
});
