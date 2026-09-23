// content.js — Mentat Cognitive Browser Pilot (Content Script)

(() => {
  // Prevent executing in sub-iframes or tracker iframes
  if (window.self !== window.top) {
    return;
  }

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
          <span id="mentat-model-badge" class="mentat-badge-live" title="On-device Neural Model Telemetry">
            <span id="mentat-model-dot" class="mentat-badge-live-dot"></span>
            <span id="mentat-model-name">Checking Model...</span>
          </span>
          <span id="mentat-latency-readout">Ready</span>
        </div>
      </div>

      <div class="mentat-input-row">
        <input type="text" id="mentat-prompt-input" placeholder="Speak or type command (e.g. 'go back', 'dim spam', 'import project')..." autocomplete="off" spellcheck="false" />
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
  const modelBadgeEl = overlayRoot.querySelector("#mentat-model-badge");
  const modelDotEl = overlayRoot.querySelector("#mentat-model-dot");
  const modelNameEl = overlayRoot.querySelector("#mentat-model-name");

  function updateModelBadge() {
    if (!window.MentatEngine || !modelBadgeEl) return;
    const status = window.MentatEngine.getModelStatus();

    modelNameEl.innerText = status.badgeText;
    modelBadgeEl.title = status.tooltip;

    modelBadgeEl.classList.remove("warming", "fallback");
    modelDotEl.classList.remove("warning", "danger");

    if (status.state === "warming") {
      modelBadgeEl.classList.add("warming");
      modelDotEl.classList.add("warning");
    } else if (status.state === "fallback") {
      modelBadgeEl.classList.add("fallback");
      modelDotEl.classList.add("danger");
    }
  }

  // Update badge status periodically
  setInterval(updateModelBadge, 1500);

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
      updateModelBadge();
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

  // 4b. Page State Detector (Approach A: State Awareness)
  function detectPageState() {
    const isThreadView = Boolean(
      document.querySelector('div[role="main"] h2, .ha, .gE, .adn, article, div[data-message-id]')
    );
    const hasRows = document.querySelectorAll("tr.zA, div[role='row'].zA, table[role='grid'] tr").length > 0;
    const isDialog = Boolean(document.querySelector('[role="dialog"], .modal, .popup'));

    if (isDialog) {
      return { mode: "modal_view", description: "Modal dialog or popup overlay open" };
    }
    if (isThreadView && !hasRows) {
      return { mode: "thread_view", description: "Reading opened email or detail thread" };
    }
    if (hasRows) {
      return { mode: "list_view", description: "Browsing inbox email list" };
    }
    return { mode: "general_view", description: "Viewing web page" };
  }

  // 4c. Visual Icon Classifier (Approach A: Visual Semantics)
  function classifyVisualIcon(el) {
    const htmlStr = (el.innerHTML || "").toLowerCase();
    let classStr = "";
    if (typeof el.className === "string") {
      classStr = el.className.toLowerCase();
    } else if (el.className && typeof el.className.baseVal === "string") {
      classStr = el.className.baseVal.toLowerCase();
    }
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const tooltip = (el.getAttribute("data-tooltip") || "").toLowerCase();
    const combined = `${classStr} ${aria} ${tooltip}`;

    // 1. Back / Return Arrow
    if (
      combined.includes("back") ||
      combined.includes("return") ||
      combined.includes("previous") ||
      htmlStr.includes("m20 11h7.83") || // Material Back Arrow
      htmlStr.includes("m15.41 7.41") ||
      htmlStr.includes("chevron-left")
    ) {
      return "arrow_left";
    }

    // 2. Search / Magnifier
    if (combined.includes("search") || combined.includes("find") || htmlStr.includes("m15.5 14h-.79")) {
      return "search";
    }

    // 3. Close / Dismiss
    if (combined.includes("close") || combined.includes("dismiss") || combined.includes("clear") || htmlStr.includes("m19 6.41")) {
      return "close";
    }

    // 4. Trash / Delete
    if (combined.includes("trash") || combined.includes("delete") || combined.includes("bin") || htmlStr.includes("m6 19c0")) {
      return "trash";
    }

    // 5. Compose / Add / Apply
    if (combined.includes("compose") || combined.includes("create") || combined.includes("add") || combined.includes("apply") || htmlStr.includes("m19 13h-6v6")) {
      return "compose";
    }

    // 6. Refresh / Sync
    if (combined.includes("refresh") || combined.includes("reload") || combined.includes("sync")) {
      return "refresh";
    }

    return "none";
  }

  // 4d. Spatial Topology Classifier
  function classifySpatialTopology(rect) {
    if (rect.top < 120 && rect.height < 90) return "top_toolbar";
    if (rect.left < 260 && rect.width < 320) return "left_sidebar";
    if (rect.bottom > window.innerHeight - 80) return "bottom_bar";
    return "main_container";
  }

  // 5. DOM Interactive Node Harvester with Affordance Synthesizer
  function harvestInteractiveNodes(pageState = detectPageState()) {
    const selector = "a, button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], [role='row'], tr.zA, tr[role='row'], .artdeco-button, [onclick], [tabindex]";
    const rawElements = Array.from(document.querySelectorAll(selector));

    const candidates = [];
    for (const el of rawElements) {
      try {
        // Visibility check
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const style = window.getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          continue;
        }

        // Ignore elements inside our own HUD
        if (overlayRoot && overlayRoot.contains(el)) continue;

        // Filter out micro-elements nested inside email rows to prevent candidate flooding (393 -> 25)
        const parentRow = el.closest("tr.zA, div[role='row'].zA");
        if (parentRow && parentRow !== el) continue;

        const isEmailRow = el.matches ? (el.matches("tr.zA, div[role='row'].zA, tr[role='row']") || el.classList.contains("zA")) : false;
        const text = (el.innerText || el.textContent || "").trim();
        const ariaLabel = el.getAttribute("aria-label") || "";
        const placeholder = el.getAttribute("placeholder") || "";
        const name = el.getAttribute("name") || "";
        const title = el.getAttribute("title") || "";
        const role = el.getAttribute("role") || el.tagName.toLowerCase();

        const icon = classifyVisualIcon(el);
        const location = classifySpatialTopology(rect);

        // Determine affordance action tag
        let affordanceAction = "interaction";
        const fullLabel = `${text} ${ariaLabel} ${title} ${placeholder}`.toLowerCase();
        if (icon === "arrow_left" || fullLabel.includes("back") || ariaLabel.toLowerCase().includes("back")) {
          affordanceAction = "navigate_back";
        } else if (icon === "compose" || fullLabel.includes("compose") || fullLabel.includes("new mail") || fullLabel.includes("apply")) {
          affordanceAction = "compose_or_action";
        } else if (icon === "search" || role === "searchbox" || fullLabel.includes("search")) {
          affordanceAction = "search";
        } else if (isEmailRow) {
          affordanceAction = "read_email_row";
        } else if (role === "button" || el.tagName === "BUTTON") {
          affordanceAction = "action_button";
        }

        const cleanLabel = (ariaLabel || title || placeholder || text).slice(0, 70).replace(/[\r\n\t]+/g, " ");
        const affordanceStr = `[AFFORDANCE: ${affordanceAction} | ROLE: ${role} | LOCATION: ${location} | LABEL: '${cleanLabel}' | ICON: ${icon}]`;

        candidates.push({
          element: el,
          tag: el.tagName,
          text: text.slice(0, 140),
          ariaLabel,
          placeholder,
          name,
          title,
          role,
          isEmailRow,
          rect,
          icon,
          location,
          affordanceAction,
          affordanceStr,
        });

        // Cap to the top 45 most prominent screen controls to guarantee sub-20ms inference
        if (candidates.length >= 45) break;
      } catch (err) {
        // Gracefully ignore single rogue node errors and proceed
      }
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

  // 7. Email Row Harvester (Gmail & Webmail Lists)
  function harvestEmailRows() {
    const selectors = [
      "tr.zA",
      "tr[role='row']",
      "div[role='row'].zA",
      "tbody tr",
      "table[role='grid'] tr"
    ];

    let rawRows = [];
    for (const sel of selectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) {
        rawRows = found;
        break;
      }
    }

    const emailItems = [];
    for (const row of rawRows) {
      if (row.querySelector("th") || row.classList.contains("thead")) continue;

      const senderEl = row.querySelector(".yW, .zF, span[name], span[email], td:nth-child(4), td:nth-child(3)");
      const senderText = senderEl ? (senderEl.innerText || senderEl.textContent || "").trim() : "";

      const subjectEl = row.querySelector(".y6, span.bog, [data-thread-id], .xY, td:nth-child(5)");
      const subjectText = subjectEl ? (subjectEl.innerText || subjectEl.textContent || "").trim() : "";

      const snippetEl = row.querySelector(".y2, span.y2");
      const snippetText = snippetEl ? (snippetEl.innerText || snippetEl.textContent || "").trim() : "";

      const fullText = (row.innerText || row.textContent || "").trim();

      if (fullText.length > 10) {
        emailItems.push({
          element: row,
          sender: senderText || fullText.slice(0, 35),
          subject: subjectText || fullText.slice(35, 120),
          snippet: snippetText || fullText.slice(120, 200),
        });
      }
    }

    return emailItems;
  }

  // 8. Apply Color Grading
  function applyEmailColorGrading(classificationResult) {
    clearEmailColorGrading();

    classificationResult.results.forEach(({ item, category, probSpam, probImportant }) => {
      const row = item.element;

      if (category === "spam") {
        row.classList.add("mentat-dimmed-row");

        if (!row.querySelector(".mentat-tag-spam")) {
          const tag = document.createElement("span");
          tag.className = "mentat-tag-spam";
          tag.innerText = `PROMO ${(probSpam * 100).toFixed(0)}%`;
          const targetCell = row.querySelector(".y6, span.bog, td:nth-child(5)") || row;
          targetCell.appendChild(tag);
        }
      } else if (category === "important") {
        row.classList.add("mentat-highlighted-row");

        if (!row.querySelector(".mentat-tag-important")) {
          const tag = document.createElement("span");
          tag.className = "mentat-tag-important";
          tag.innerText = `IMPORTANT ${(probImportant * 100).toFixed(0)}%`;
          const targetCell = row.querySelector(".y6, span.bog, td:nth-child(5)") || row;
          targetCell.appendChild(tag);
        }
      }
    });
  }

  // 9. Clear Color Grading
  function clearEmailColorGrading() {
    document.querySelectorAll(".mentat-dimmed-row").forEach((el) => {
      el.classList.remove("mentat-dimmed-row");
    });
    document.querySelectorAll(".mentat-highlighted-row").forEach((el) => {
      el.classList.remove("mentat-highlighted-row");
    });
    document.querySelectorAll(".mentat-tag-spam, .mentat-tag-important").forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  // 11. Atomic Motor Execution Dispatchers
  function executeClick(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const clickTarget = (el.matches && el.matches("tr.zA, div[role='row'].zA, tr[role='row']"))
      ? (el.querySelector(".y6, span.bog, td:nth-child(5)") || el)
      : el;
    clickTarget.focus();
    const opts = { bubbles: true, cancelable: true, view: window };
    clickTarget.dispatchEvent(new PointerEvent("pointerdown", opts));
    clickTarget.dispatchEvent(new MouseEvent("mousedown", opts));
    clickTarget.dispatchEvent(new PointerEvent("pointerup", opts));
    clickTarget.dispatchEvent(new MouseEvent("mouseup", opts));
    clickTarget.click();
  }

  async function executeType(el, text, pressEnter = false) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();

    if (el.isContentEditable || el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox") {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } else {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (pressEnter) {
      await new Promise((r) => setTimeout(r, 120));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }
  }

  function executeWaitFor(selector, timeoutMs = 3000) {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found && found.offsetParent !== null) return resolve(found);

      const t0 = performance.now();
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
          observer.disconnect();
          resolve(el);
        } else if (performance.now() - t0 > timeoutMs) {
          observer.disconnect();
          resolve(null);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }

  // 12. Muscle Memory Cache (chrome.storage.local)
  function getMuscleMemory(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (res) => resolve(res[key] || null));
      } else {
        resolve(null);
      }
    });
  }

  function saveMuscleMemory(key, plan) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: plan });
    }
  }

  // 13. System 2 Playbook Executor
  async function executePlaybook(playbook, pageState) {
    const steps = playbook.steps || [];
    statusEl.innerText = `Executing ${playbook.workflow || "workflow"} (${steps.length} steps)...`;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      statusEl.innerText = `[${i + 1}/${steps.length}] ${step.desc || step.action}`;

      if (step.action === "WAIT_FOR") {
        if (step.selector) {
          await executeWaitFor(step.selector, step.timeoutMs || 2500);
        } else {
          await new Promise((r) => setTimeout(r, 600));
        }
        continue;
      }

      if (step.action === "SCROLL") {
        const topDelta = step.direction === "up" ? -window.innerHeight * 0.7 : window.innerHeight * 0.7;
        window.scrollBy({ top: topDelta, behavior: "smooth" });
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      if (step.action === "NAVIGATE") {
        if (step.value === "back" || step.action === "back") window.history.back();
        else if (step.value === "forward" || step.action === "forward") window.history.forward();
        else if (step.value === "refresh" || step.action === "refresh") window.location.reload();
        else if (step.value) window.location.href = step.value;
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      // Motor Target Grounding (CLICK / TYPE)
      const currentCandidates = harvestInteractiveNodes(detectPageState());
      let targetEl = null;

      if (step.selector) {
        targetEl = document.querySelector(step.selector);
      }

      if (!targetEl && step.target) {
        // System 1 WebGPU Affordance grounding
        const match = await window.MentatEngine.groundCommandToElements(step.target, currentCandidates, detectPageState());
        if (match && match.winner && match.isActionable) {
          targetEl = match.winner.element;
        }
      }

      if (!targetEl) {
        console.warn(`[Mentat System 1] Could not locate target for step ${i + 1}:`, step);
        continue;
      }

      drawTargetLock(targetEl, 0.95, 12);
      await new Promise((r) => setTimeout(r, 220));

      if (step.action === "CLICK") {
        executeClick(targetEl);
      } else if (step.action === "TYPE") {
        await executeType(targetEl, step.value || "", step.pressEnter || false);
      }

      clearTargetLock();
      await new Promise((r) => setTimeout(r, 350));
    }

    statusEl.innerText = `Completed "${playbook.workflow || "task"}".`;
    setTimeout(() => toggleHud(false), 900);
  }

  // 14. Dual-Brain Execution Pipeline
  async function executeMentatCommand(command) {
    const engine = window.MentatEngine;
    if (!engine) {
      statusEl.innerText = "Engine initializing...";
      return;
    }

    const lower = command.trim().toLowerCase();

    // 1. Control Token: Clear / Reset
    if (lower === "reset" || lower === "clear" || lower === "clear colors") {
      clearEmailColorGrading();
      statusEl.innerText = "Cleared Mentat color grading. Normal inbox restored.";
      latencyEl.innerText = "0ms";
      setTimeout(() => toggleHud(false), 900);
      return;
    }

    // 2. Direct Reflex Check: Navigation
    const navReflexes = ["go back", "back", "forward", "scroll down", "scroll up", "page down", "refresh", "reload"];
    if (navReflexes.includes(lower)) {
      const intent = await engine.detectCommandIntent(command);
      if (intent.type === "ACTION_NAV") {
        if (intent.action === "back") {
          const backBtn = document.querySelector('[aria-label*="Back" i], [title*="Back" i], div[act="19"], button.back-btn');
          if (backBtn && backBtn.offsetParent !== null) {
            drawTargetLock(backBtn, 0.98, 5);
            setTimeout(() => { backBtn.click(); clearTargetLock(); toggleHud(false); }, 300);
            return;
          }
          window.history.back();
          toggleHud(false);
          return;
        }
        if (intent.action === "scroll_down") { window.scrollBy({ top: window.innerHeight * 0.75, behavior: "smooth" }); toggleHud(false); return; }
        if (intent.action === "scroll_up") { window.scrollBy({ top: -window.innerHeight * 0.75, behavior: "smooth" }); toggleHud(false); return; }
        if (intent.action === "refresh") { window.location.reload(); return; }
      }
    }

    // 3. Direct Reflex Check: Batch Color
    const hasVisualVerb = ["color", "colour", "dim", "highlight all", "filter", "shade"].some((v) => lower.includes(v));
    if (hasVisualVerb && (lower.includes("mail") || lower.includes("email") || lower.includes("spam") || lower.includes("noise"))) {
      const emails = harvestEmailRows();
      if (emails.length > 0) {
        statusEl.innerText = `Evaluating ${emails.length} emails with Neural Embeddings on WebGPU...`;
        const batchResult = await engine.classifyEmailBatch(emails);
        applyEmailColorGrading(batchResult);
        latencyEl.innerText = `${batchResult.latencyMs}ms`;
        statusEl.innerText = `Classified ${emails.length} emails (${batchResult.spamCount} dimmed, ${batchResult.importantCount} highlighted).`;
        setTimeout(() => toggleHud(false), 1400);
        return;
      }
    }

    // 4. Muscle Memory Check (Reflex Compilation)
    const memKey = `mentat_mem_${window.location.hostname}_${lower.replace(/\s+/g, "_")}`;
    const cachedPlaybook = await getMuscleMemory(memKey);
    if (cachedPlaybook) {
      statusEl.innerText = `⚡ Replaying from Muscle Memory (${cachedPlaybook.workflow})...`;
      latencyEl.innerText = "5ms";
      await executePlaybook(cachedPlaybook, detectPageState());
      return;
    }

    // 5. Dual-Brain System 2 Reasoning Planner
    const pageState = detectPageState();
    const candidates = harvestInteractiveNodes(pageState);

    // If System 2 is available, invoke reasoning cortex
    if (window.MentatSystemTwo) {
      const sys2Config = await window.MentatSystemTwo.getConfig();
      if (sys2Config && (sys2Config.apiKey || sys2Config.provider === "ollama")) {
        statusEl.innerText = `🧠 System 2 Planning (${sys2Config.provider})...`;
        const planResult = await window.MentatSystemTwo.planWorkflow(command, {
          title: document.title,
          url: window.location.href,
          ...pageState,
        }, candidates);

        if (planResult.success && planResult.plan && planResult.plan.steps && planResult.plan.steps.length > 0) {
          latencyEl.innerText = `${planResult.latencyMs}ms`;
          saveMuscleMemory(memKey, planResult.plan);
          await executePlaybook(planResult.plan, pageState);
          return;
        }
      }
    }

    // 6. System 1 Direct Affordance Motor Grounding (Fallback / Direct Reflex)
    statusEl.innerText = `System 1 Affordance Grounding (${candidates.length} controls)...`;
    const result = await engine.groundCommandToElements(command, candidates, pageState);
    latencyEl.innerText = `${result.latencyMs}ms`;

    if (!result.winner || !result.isActionable) {
      statusEl.innerText = `Ambiguous target (P=${(result.probability * 100).toFixed(1)}%). Try a more specific phrasing.`;
      return;
    }

    const targetEl = result.winner.element;
    drawTargetLock(targetEl, result.confidence, result.latencyMs);
    statusEl.innerText = `Target Lock: <${result.winner.tag}> "${result.winner.text.slice(0, 30)}"`;

    setTimeout(() => {
      executeClick(targetEl);
      setTimeout(() => {
        clearTargetLock();
        toggleHud(false);
      }, 600);
    }, 300);
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
