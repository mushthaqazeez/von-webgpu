// content.js — Mentat Cognitive Browser Pilot (Content Script)

(() => {
  if (window.__mentat_pilot_injected) {
    return;
  }
  window.__mentat_pilot_injected = true;

  let isHudVisible = false;
  let recognition = null;
  let isListening = false;
  let targetLockEl = null;

  // 1. Inject Overlay Root & HUD into DOM
  const overlayRoot = document.createElement("div");
  overlayRoot.id = "mentat-overlay-root";

  overlayRoot.innerHTML = `
    <div id="mentat-hud">
      <div class="mentat-hud-header">
        <div class="mentat-brand">
          <div class="mentat-brand-icon"><div class="mentat-brand-dot"></div></div>
          <span>Mentat Pilot</span>
        </div>
        <div class="mentat-telemetry">
          <span class="mentat-badge-live"><span class="mentat-badge-live-dot"></span>System 1 Active</span>
          <span id="mentat-latency-readout">Ready</span>
        </div>
      </div>

      <div class="mentat-input-row">
        <input type="text" id="mentat-prompt-input" placeholder="Speak or type command (e.g. 'click on repositories', 'search for laptops')..." autocomplete="off" spellcheck="false" />
        <button id="mentat-mic-btn" title="Toggle Voice Recognition (Speak command)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
      </div>

      <div class="mentat-feedback-box">
        <span id="mentat-status-text">It is by will alone I set my mind in motion.</span>
        <span class="mentat-shortcut-hint"><kbd>Alt+M</kbd> to toggle • <kbd>Esc</kbd> to exit</span>
      </div>
    </div>
  `;

  function mountOverlay() {
    if (document.getElementById("mentat-overlay-root")) return;
    const container = document.body || document.documentElement;
    if (container) {
      container.appendChild(overlayRoot);
    } else {
      window.addEventListener("DOMContentLoaded", () => {
        (document.body || document.documentElement).appendChild(overlayRoot);
      });
    }
  }
  mountOverlay();

  const hudEl = overlayRoot.querySelector("#mentat-hud");
  const inputEl = overlayRoot.querySelector("#mentat-prompt-input");
  const micBtn = overlayRoot.querySelector("#mentat-mic-btn");
  const latencyEl = overlayRoot.querySelector("#mentat-latency-readout");
  const statusEl = overlayRoot.querySelector("#mentat-status-text");

  // 2. Initialize Speech Recognition (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      statusEl.innerText = "Listening to voice...";
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      inputEl.value = transcript;

      // Auto-submit on final recognized utterance
      if (event.results[0].isFinal) {
        statusEl.innerText = `Heard: "${transcript}" — Resolving...`;
        executeMentatCommand(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.warn("[Mentat] Speech recognition error:", event.error);
      isListening = false;
      micBtn.classList.remove("listening");
      statusEl.innerText = `Mic: ${event.error}`;
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
    };
  } else {
    micBtn.style.display = "none";
  }

  micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  // 3. Toggle HUD visibility
  function toggleHud(forceState) {
    mountOverlay();
    isHudVisible = typeof forceState === "boolean" ? forceState : !isHudVisible;
    if (isHudVisible) {
      hudEl.classList.add("active");
      setTimeout(() => inputEl.focus(), 50);
      statusEl.innerText = "Scanning page DOM nodes...";
      const nodes = harvestInteractiveNodes();
      statusEl.innerText = `${nodes.length} interactive candidates indexed in RAM.`;
    } else {
      hudEl.classList.remove("active");
      if (recognition && isListening) recognition.stop();
      clearTargetLock();
    }
  }

  // 4. Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleHud();
    } else if (e.key === "Escape" && isHudVisible) {
      e.preventDefault();
      toggleHud(false);
    }
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const query = inputEl.value.trim();
      if (query) executeMentatCommand(query);
    }
  });

  // 5. DOM Interactive Node Harvester
  function harvestInteractiveNodes() {
    const selector = "a, button, input, select, textarea, [role='button'], [role='link'], [onclick], [tabindex]:not([tabindex='-1'])";
    const rawElements = Array.from(document.querySelectorAll(selector));

    const candidates = [];
    for (const el of rawElements) {
      // Visibility check
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        continue;
      }

      // Ignore elements inside our own HUD
      if (overlayRoot.contains(el)) continue;

      const text = el.innerText || el.textContent || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const placeholder = el.getAttribute("placeholder") || "";
      const name = el.getAttribute("name") || "";
      const title = el.getAttribute("title") || "";
      const role = el.getAttribute("role") || "";

      candidates.push({
        element: el,
        tag: el.tagName,
        text: text.slice(0, 100),
        ariaLabel,
        placeholder,
        name,
        title,
        role,
        rect,
      });
    }

    return candidates;
  }

  // 6. Draw Cybernetic Target Lock
  function drawTargetLock(element, confidence, latency) {
    clearTargetLock();
    const rect = element.getBoundingClientRect();

    targetLockEl = document.createElement("div");
    targetLockEl.className = "mentat-target-lock";
    targetLockEl.style.top = `${rect.top + window.scrollY - 4}px`;
    targetLockEl.style.left = `${rect.left + window.scrollX - 4}px`;
    targetLockEl.style.width = `${rect.width + 8}px`;
    targetLockEl.style.height = `${rect.height + 8}px`;

    const tag = document.createElement("div");
    tag.className = "mentat-target-tag";
    tag.innerHTML = `<span>⚡ Target Acquired</span><span>${(confidence * 100).toFixed(0)}% Conf</span><span>${latency}ms</span>`;
    targetLockEl.appendChild(tag);

    overlayRoot.appendChild(targetLockEl);
  }

  function clearTargetLock() {
    if (targetLockEl && targetLockEl.parentNode) {
      targetLockEl.parentNode.removeChild(targetLockEl);
      targetLockEl = null;
    }
  }

  // 7. Execute Mentat Command Pipeline
  function executeMentatCommand(command) {
    const candidates = harvestInteractiveNodes();
    statusEl.innerText = `Computing over ${candidates.length} candidates...`;

    // Invoke Mentat Decision Engine (fallback safely if engine wasn't ready)
    const engine = window.MentatEngine;
    if (!engine) {
      statusEl.innerText = "Engine initializing...";
      return;
    }

    const result = engine.groundCommandToElements(command, candidates);

    latencyEl.innerText = `${result.latencyMs}ms`;

    if (!result.winner || !result.isActionable) {
      statusEl.innerText = `Ambiguous target (P=${(result.probability * 100).toFixed(1)}%). Try a more specific phrasing.`;
      return;
    }

    const targetEl = result.winner.element;
    drawTargetLock(targetEl, result.confidence, result.latencyMs);

    statusEl.innerText = `Target Lock: <${result.winner.tag}> "${result.winner.text.slice(0, 30)}"`;

    // Scroll into view if offscreen
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // Handle typing vs clicking
    setTimeout(() => {
      const lower = command.toLowerCase();
      if (lower.startsWith("type ") || lower.startsWith("fill ") || lower.startsWith("search ")) {
        const textToType = command.replace(/^(type|fill|search)\s+/i, "");
        targetEl.focus();
        targetEl.value = textToType;
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        targetEl.dispatchEvent(new Event("change", { bubbles: true }));
        statusEl.innerText = `Typed: "${textToType}"`;
      } else {
        targetEl.focus();
        targetEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        targetEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        targetEl.click();
        statusEl.innerText = `Executed click on target.`;
      }

      // Hide HUD after completion
      setTimeout(() => {
        toggleHud(false);
      }, 900);
    }, 350);
  }

  // Listen for messages from background script or popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle-mentat") {
      toggleHud();
      if (request.command) {
        inputEl.value = request.command;
        executeMentatCommand(request.command);
      }
      sendResponse({ status: "toggled" });
    }
  });

  console.log("[Mentat] Cognitive Browser Pilot injected and standing by (Alt+M).");
})();
