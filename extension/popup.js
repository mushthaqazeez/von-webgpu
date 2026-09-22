// popup.js — Mentat Extension Popup Controller

function showAlert(message) {
  const alertEl = document.getElementById("popup-alert");
  if (alertEl) {
    alertEl.innerText = message;
    alertEl.style.display = "block";
  }
}

async function triggerMentatInActiveTab(commandText = null) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showAlert("No active tab found.");
      return;
    }

    const url = tab.url || "";
    // Check for internal browser URLs where Chrome blocks extensions
    if (
      url.startsWith("chrome://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("view-source:") ||
      url.includes("chromewebstore.google.com")
    ) {
      showAlert("⚠️ Mentat cannot run on internal browser pages (like chrome://). Please switch to a website (e.g. github.com, google.com) and try again.");
      return;
    }

    // Try sending toggle message to existing content script
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat", command: commandText });
      window.close();
      return;
    } catch (msgErr) {
      console.log("[Mentat Popup] Content script not detected, attempting dynamic injection...", msgErr);
    }

    // Content script not loaded yet (e.g. page was open before extension installed/reloaded)
    // Dynamically inject scripts & styles
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["transformers.min.js", "engine.js", "content.js"],
      });

      // Brief delay to allow content script initialization
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "toggle-mentat", command: commandText });
          window.close();
        } catch (retryErr) {
          showAlert("Could not activate HUD. Please refresh the page and try Alt+M.");
        }
      }, 150);
    } catch (injectErr) {
      if (injectErr && injectErr.message && (injectErr.message.includes("chrome://") || injectErr.message.includes("Cannot access"))) {
        showAlert("⚠️ Mentat cannot run on internal browser pages (like chrome://). Please switch to a website (e.g. github.com, google.com) and try again.");
      } else {
        console.warn("[Mentat Popup] Injection notice:", injectErr);
        showAlert(`Could not inject Mentat into tab: ${injectErr.message || "Permission restricted."}`);
      }
    }
  } catch (err) {
    showAlert("Unexpected error occurred while communicating with tab.");
  }
}

document.getElementById("btn-summon-hud").addEventListener("click", () => {
  triggerMentatInActiveTab();
});

// Clickable sample chips
document.querySelectorAll(".quick-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const text = chip.innerText.replace(/"/g, "");
    triggerMentatInActiveTab(text);
  });
});
