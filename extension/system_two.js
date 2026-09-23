// system_two.js — Mentat System 2 Prefrontal Reasoning Cortex
// Orchestrates strategic task decomposition and planning via Local Ollama, Groq, OpenAI, or Claude.

window.MentatSystemTwo = (() => {
  const DEFAULT_CONFIG = {
    provider: "ollama", // "ollama" | "groq" | "openai" | "anthropic" | "custom"
    endpoint: "http://localhost:11434/v1",
    model: "qwen2.5:3b",
    apiKey: "",
    temperature: 0.1,
  };

  /**
   * Loads System 2 configuration from persistent extension storage
   */
  async function getConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["mentat_system2_config"], (result) => {
          resolve({ ...DEFAULT_CONFIG, ...(result.mentat_system2_config || {}) });
        });
      } else {
        resolve(DEFAULT_CONFIG);
      }
    });
  }

  /**
   * Saves updated configuration to storage
   */
  async function saveConfig(newConfig) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mentat_system2_config: newConfig }, () => resolve(true));
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Tests if the configured endpoint and model are reachable
   */
  async function testConnection(customConfig = null) {
    const config = customConfig || (await getConfig());
    const t0 = performance.now();

    try {
      if (config.provider === "anthropic") {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: config.model || "claude-3-5-haiku-20241022",
            max_tokens: 10,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        if (!resp.ok) throw new Error(`Anthropic error: ${resp.status} ${resp.statusText}`);
        return { success: true, latencyMs: Number((performance.now() - t0).toFixed(0)), provider: "anthropic" };
      }

      // OpenAI-compatible format (Local Ollama, Groq, OpenAI, OpenRouter)
      const baseUrl = config.endpoint.replace(/\/+$/, "");
      const headers = { "Content-Type": "application/json" };
      if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          max_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (!resp.ok) {
        const errRaw = await resp.text().catch(() => resp.statusText);
        let errMsg = `HTTP ${resp.status}`;
        try {
          const parsed = JSON.parse(errRaw);
          if (parsed.error && parsed.error.message) {
            errMsg += `: ${parsed.error.message}`;
          } else {
            errMsg += `: ${errRaw.slice(0, 100)}`;
          }
        } catch (_) {
          errMsg += `: ${errRaw.slice(0, 100)}`;
        }

        // On 404 or access error, attempt to query /models to discover what models the key has access to
        if (resp.status === 404 || resp.status === 400) {
          try {
            const modelsResp = await fetch(`${baseUrl}/models`, { headers });
            if (modelsResp.ok) {
              const modelsData = await modelsResp.json();
              const avail = (modelsData.data || []).map((m) => m.id).filter((id) => !id.includes("whisper") && !id.includes("embed")).slice(0, 5);
              if (avail.length > 0) {
                errMsg += ` | Try one of: ${avail.join(", ")}`;
              }
            }
          } catch (_) {}
        }
        throw new Error(errMsg);
      }

      return { success: true, latencyMs: Number((performance.now() - t0).toFixed(0)), provider: config.provider };
    } catch (err) {
      return { success: false, error: err.message, provider: config.provider };
    }
  }

  /**
   * Plans an end-to-end multi-step workflow from user intent and current screen affordances
   */
  async function planWorkflow(userPrompt, pageContext, candidates) {
    const config = await getConfig();
    const t0 = performance.now();

    // Categorize candidates for rich prefrontal reasoning context
    const searchAffordances = [];
    const sidebarAffordances = [];
    const actionAffordances = [];
    const generalAffordances = [];

    candidates.slice(0, 60).forEach((c) => {
      const line = `- ${c.affordanceStr || c.text}`;
      if (c.affordanceAction === "search_control" || (c.text && c.text.toLowerCase().includes("search"))) {
        searchAffordances.push(line);
      } else if (c.location === "left_sidebar" || c.affordanceAction === "sidebar_history_item") {
        sidebarAffordances.push(line);
      } else if (c.role === "button" || c.affordanceAction === "action_button" || c.affordanceAction === "create_action") {
        actionAffordances.push(line);
      } else {
        generalAffordances.push(line);
      }
    });

    const affordanceCatalog = [
      "=== SEARCH & FILTER CONTROLS ===",
      searchAffordances.length ? searchAffordances.join("\n") : "(none detected)",
      "=== SIDEBAR HISTORY & RECENTS ===",
      sidebarAffordances.length ? sidebarAffordances.join("\n") : "(none detected)",
      "=== ACTIONS & CONTROLS ===",
      actionAffordances.length ? actionAffordances.join("\n") : "(none detected)",
      "=== VISIBLE PAGE LINKS & NODES ===",
      generalAffordances.length ? generalAffordances.slice(0, 20).join("\n") : "(none detected)",
    ].join("\n");

    const systemPrompt = `You are JARVIS System 2 (Prefrontal Reasoning Cortex), an elite browser automation strategist.
You decompose user commands into an executable sequence of atomic motor actions for System 1 (the on-device motor engine).

SYSTEM 1 MOTOR PRIMITIVES:
- CLICK: { "action": "CLICK", "target": "semantic target label or exact visible text" }
- TYPE: { "action": "TYPE", "target": "input element", "value": "text to type", "pressEnter": true | false }
- WAIT_FOR: { "action": "WAIT_FOR", "timeoutMs": 400, "desc": "wait for modal/results" }
- SCROLL: { "action": "SCROLL", "direction": "down" | "up" }
- NAVIGATE: { "action": "NAVIGATE", "value": "back" | "forward" | "refresh" | "url" }
- COLOR_FILTER: { "action": "COLOR_FILTER", "filterMode": "DIM_SPAM" | "HIGHLIGHT_IMPORTANT" }

WEB ERGONOMICS & PLAYBOOK RULES:
1. SEARCH-FIRST RULE: When a user wants to find, locate, or open a specific chat, conversation, contact, email, or item:
   - If a Search control exists (e.g. 'Search chats', 'Search', magnifier icon):
     Step 1: CLICK the search button/input.
     Step 2: WAIT_FOR 300ms for input focus or modal to settle.
     Step 3: TYPE the keyword into the search input with "pressEnter": true.
     Step 4: WAIT_FOR 400ms for search results to appear.
   - If the exact or closely related item is ALREADY visible in SIDEBAR HISTORY or RECENTS (e.g. 'Mahindra BE6', 'Bolero'), simply CLICK it directly!
2. EXACT TARGET MATCHING: For "target", use the exact button/link text or label found in the affordance catalog (e.g. "Search chats", "New chat", "Capital Wars").
3. CONCISE DESCRIPTIONS: Provide clear human-readable "desc" for each step so the user sees live progress on their screen.

Return ONLY valid JSON matching this schema:
{
  "thought": "brief reasoning explaining strategy",
  "workflow": "concise_name",
  "steps": [
    {
      "action": "CLICK" | "TYPE" | "SCROLL" | "WAIT_FOR" | "NAVIGATE" | "COLOR_FILTER",
      "target": "target element label",
      "value": "string if TYPE or NAVIGATE",
      "pressEnter": true | false,
      "direction": "down" | "up",
      "timeoutMs": 300,
      "desc": "human readable status for HUD (e.g. 'Click Search chats', 'Type bolero')"
    }
  ]
}`;

    const userMessage = `Current Web View:
- Page Title: "${pageContext.title || document.title}"
- State: ${pageContext.mode || "general"}
- Available Screen Controls & History:
${affordanceCatalog}

User Goal: "${userPrompt}"

Generate the exact execution plan. Output raw JSON only.`;

    try {
      let rawResponseText = "";

      if (config.provider === "anthropic") {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: config.model || "claude-3-5-haiku-20241022",
            max_tokens: 600,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        if (!resp.ok) throw new Error(`Anthropic error: ${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        rawResponseText = data.content?.[0]?.text || "";
      } else {
        // OpenAI-compatible (Ollama, Groq, OpenAI)
        const baseUrl = config.endpoint.replace(/\/+$/, "");
        const headers = { "Content-Type": "application/json" };
        if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: config.model,
            temperature: 0.1,
            max_tokens: 600,
            response_format: config.provider === "ollama" ? { type: "json_object" } : undefined,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
          }),
        });

        if (!resp.ok) {
          const errDetail = await resp.text().catch(() => resp.statusText);
          throw new Error(`System 2 (${config.provider}) failed: ${resp.status} - ${errDetail.slice(0, 120)}`);
        }

        const data = await resp.json();
        rawResponseText = data.choices?.[0]?.message?.content || "";
      }

      // Strip reasoning tags (e.g. <think>...</think> from Qwen/DeepSeek) and Markdown blocks
      let cleanJson = rawResponseText.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(json)?/gi, "").trim();
      const firstBrace = cleanJson.indexOf("{");
      const lastBrace = cleanJson.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
      }
      const plan = JSON.parse(cleanJson);

      return {
        success: true,
        plan,
        provider: config.provider,
        model: config.model,
        latencyMs: Number((performance.now() - t0).toFixed(0)),
      };
    } catch (err) {
      console.warn("[Mentat System 2] Planning error:", err);
      return {
        success: false,
        error: err.message,
        provider: config.provider,
        latencyMs: Number((performance.now() - t0).toFixed(0)),
      };
    }
  }

  return {
    getConfig,
    saveConfig,
    testConnection,
    planWorkflow,
  };
})();
