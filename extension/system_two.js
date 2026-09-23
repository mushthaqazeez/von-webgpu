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
        const errText = await resp.text().catch(() => resp.statusText);
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 100)}`);
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

    // Distill candidates to salient affordance signatures for System 2 context
    const affordanceCatalog = candidates
      .slice(0, 25)
      .map((c, i) => `${i + 1}. ${c.affordanceStr || c.text}`)
      .join("\n");

    const systemPrompt = `You are JARVIS System 2 (Prefrontal Reasoning Cortex).
You decompose user browser commands into a sequence of atomic motor actions for System 1 (the on-device WebGPU motor engine).
System 1 supports these atomic actions:
- CLICK: click an element by semantic description
- TYPE: focus an element, fill in text, optionally pressEnter: true
- SCROLL: scroll the viewport (direction: "down" | "up", amount: number)
- WAIT_FOR: wait for a selector/modal to appear (timeoutMs: number)
- NAVIGATE: navigate browser (action: "back" | "forward" | "refresh" | url)
- COLOR_FILTER: apply batch visual highlighting/dimming (filterMode: "DIM_SPAM" | "HIGHLIGHT_IMPORTANT")

Return ONLY valid JSON matching this schema:
{
  "thought": "brief reasoning",
  "workflow": "concise_name",
  "steps": [
    {
      "action": "CLICK" | "TYPE" | "SCROLL" | "WAIT_FOR" | "NAVIGATE" | "COLOR_FILTER",
      "target": "semantic target description to match against DOM affordance",
      "value": "text to type if action is TYPE",
      "pressEnter": true | false,
      "direction": "down" | "up",
      "selector": "CSS selector to wait for if WAIT_FOR",
      "desc": "human readable status update for HUD"
    }
  ]
}`;

    const userMessage = `Current Web View:
- Page Title: "${pageContext.title || document.title}"
- State: ${pageContext.mode || "general"} (${pageContext.description || "browsing"})
- Visible Key Screen Affordances:
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

      // Clean JSON delimiters if model output Markdown backticks
      const cleanJson = rawResponseText.replace(/```(json)?/gi, "").trim();
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
