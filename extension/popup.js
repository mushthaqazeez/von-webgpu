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

// System 2 Reasoning Cortex Controller
const sys2Toggle = document.getElementById("system2-toggle");
const sys2Body = document.getElementById("system2-body");
const sys2StatusPill = document.getElementById("sys2-status-pill");
const sys2Provider = document.getElementById("sys2-provider");
const sys2Endpoint = document.getElementById("sys2-endpoint");
const sys2Model = document.getElementById("sys2-model");
const sys2ApiKey = document.getElementById("sys2-apikey");
const sys2KeyContainer = document.getElementById("sys2-key-container");
const sys2BtnTest = document.getElementById("sys2-btn-test");
const sys2BtnSave = document.getElementById("sys2-btn-save");
const sys2Feedback = document.getElementById("sys2-feedback");

// Provider default templates
const PROVIDER_DEFAULTS = {
  ollama: { endpoint: "http://localhost:11434/v1", model: "qwen2.5:3b", needsKey: false },
  groq: { endpoint: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", needsKey: true },
  openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", needsKey: true },
  anthropic: { endpoint: "https://api.anthropic.com/v1", model: "claude-3-5-haiku-20241022", needsKey: true },
};

async function loadSystem2Config() {
  if (!window.MentatSystemTwo) return;
  const config = await window.MentatSystemTwo.getConfig();

  sys2Provider.value = config.provider || "ollama";
  sys2Endpoint.value = config.endpoint || PROVIDER_DEFAULTS[config.provider]?.endpoint || "";
  sys2Model.value = config.model || PROVIDER_DEFAULTS[config.provider]?.model || "";
  sys2ApiKey.value = config.apiKey || "";

  updateKeyVisibility(config.provider);
  checkSystem2Health();
}

function updateKeyVisibility(provider) {
  const needsKey = PROVIDER_DEFAULTS[provider]?.needsKey ?? true;
  sys2KeyContainer.style.display = needsKey ? "block" : "none";
}

sys2Provider.addEventListener("change", () => {
  const p = sys2Provider.value;
  const def = PROVIDER_DEFAULTS[p];
  if (def) {
    sys2Endpoint.value = def.endpoint;
    sys2Model.value = def.model;
  }
  updateKeyVisibility(p);
});

async function checkSystem2Health() {
  if (!window.MentatSystemTwo) return;
  sys2StatusPill.className = "status-pill pill-offline";
  sys2StatusPill.innerText = "Checking...";

  const test = await window.MentatSystemTwo.testConnection();
  if (test.success) {
    sys2StatusPill.className = "status-pill pill-connected";
    sys2StatusPill.innerText = `Online (${test.latencyMs}ms)`;
  } else {
    sys2StatusPill.className = "status-pill pill-offline";
    sys2StatusPill.innerText = "Offline";
  }
}

sys2BtnTest.addEventListener("click", async () => {
  sys2Feedback.innerText = "Testing connection...";
  sys2Feedback.style.color = "#94a3b8";

  const keyVal = sys2ApiKey.value.trim();
  const providerVal = sys2Provider.value;

  // Helpful key prefix check
  if (providerVal === "groq" && keyVal.startsWith("sk-") && !keyVal.startsWith("gsk_")) {
    sys2Feedback.innerText = "⚠️ That key starts with 'sk-', which is an OpenAI key. If you have an OpenAI key, switch Provider to 'OpenAI'. For Groq, keys start with 'gsk_'.";
    sys2Feedback.style.color = "#fbbf24";
    return;
  }
  if (providerVal === "openai" && keyVal.startsWith("gsk_")) {
    sys2Feedback.innerText = "⚠️ That key starts with 'gsk_', which is a Groq key. Switch Provider to 'Groq'.";
    sys2Feedback.style.color = "#fbbf24";
    return;
  }

  const tempConfig = {
    provider: providerVal,
    endpoint: sys2Endpoint.value.trim(),
    model: sys2Model.value.trim(),
    apiKey: keyVal,
  };

  const test = await window.MentatSystemTwo.testConnection(tempConfig);
  if (test.success) {
    sys2Feedback.innerText = `✓ Reachable! Response in ${test.latencyMs}ms.`;
    sys2Feedback.style.color = "#34d399";
    sys2StatusPill.className = "status-pill pill-connected";
    sys2StatusPill.innerText = `Online (${test.latencyMs}ms)`;
  } else {
    sys2Feedback.innerText = `✗ Failed: ${test.error}`;
    sys2Feedback.style.color = "#f87171";
    sys2StatusPill.className = "status-pill pill-offline";
    sys2StatusPill.innerText = "Offline";
  }
});

sys2BtnSave.addEventListener("click", async () => {
  const newConfig = {
    provider: sys2Provider.value,
    endpoint: sys2Endpoint.value.trim(),
    model: sys2Model.value.trim(),
    apiKey: sys2ApiKey.value.trim(),
  };

  await window.MentatSystemTwo.saveConfig(newConfig);
  sys2Feedback.innerText = "✓ System 2 configuration saved!";
  sys2Feedback.style.color = "#38bdf8";
  checkSystem2Health();
});

loadSystem2Config();
