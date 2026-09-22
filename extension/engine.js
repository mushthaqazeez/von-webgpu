// engine.js — Mentat Cognitive Decision & Grounding Engine (Dual-Mode: Motor + Batch Classifier)

window.MentatEngine = (() => {
  const VON_TEMPERATURE = 1.1692;

  /**
   * Numerically stable softmax with temperature scaling
   */
  function softmax(logits, temperature = VON_TEMPERATURE) {
    if (!logits || logits.length === 0) return [];
    const safeTemp = temperature <= 0 ? 1.0 : temperature;
    const scaled = logits.map((l) => (isNaN(l) ? 0 : l / safeTemp));
    const max = Math.max(...scaled);
    const exps = scaled.map((x) => Math.exp(x - max));
    const sum = exps.reduce((acc, val) => acc + val, 0);
    if (sum === 0) return logits.map(() => 1 / logits.length);
    return exps.map((val) => val / sum);
  }

  /**
   * Choice Primitive: Pick one candidate from discrete hypotheses
   */
  function resolveChoice(labels, rawLogits) {
    if (labels.length === 0) {
      return { winner: "", winnerIdx: -1, confidence: 0, distribution: {} };
    }
    const probs = softmax(rawLogits.slice(0, labels.length));
    const distribution = {};
    labels.forEach((label, idx) => {
      distribution[label] = Number((probs[idx] ?? 0).toFixed(4));
    });

    const sortedProbs = [...probs].sort((a, b) => b - a);
    const topProb = sortedProbs[0] ?? 0;
    const secondProb = sortedProbs[1] ?? 0;
    const winnerIdx = probs.indexOf(topProb);

    return {
      winner: labels[winnerIdx],
      winnerIdx,
      confidence: Number((topProb - secondProb).toFixed(4)),
      topProbability: Number(topProb.toFixed(4)),
      distribution,
    };
  }

  /**
   * Noul Primitive: Calibrated truth verification [0.0, 1.0]
   */
  function resolveNoul(binaryLogits) {
    const probs = softmax([binaryLogits[0] ?? 0, binaryLogits[1] ?? 0]);
    const probTrue = probs[1] ?? 0;
    return {
      probability: Number(probTrue.toFixed(4)),
      holdsTrue: probTrue >= 0.5,
    };
  }

  /**
   * Clean query: strips action verbs and conversational stopwords
   */
  function cleanTargetQuery(rawCommand) {
    let text = rawCommand.trim().toLowerCase();
    // Strip action prefixes
    text = text.replace(/^(click\s+(on\s+)?|press\s+(on\s+)?|open\s+|go\s+to\s+|select\s+|navigate\s+to\s+|tap\s+(on\s+)?|focus\s+(on\s+)?)/i, "");
    // Strip articles
    text = text.replace(/^(the\s+|a\s+|an\s+)/i, "");
    return text.trim();
  }

  /**
   * Parse ordinals like "first", "second", "1st", "top", "last"
   */
  function parseOrdinalCommand(command) {
    const lower = command.toLowerCase().trim();
    const ordinalsMap = {
      "first": 0, "1st": 0, "top": 0, "one": 0,
      "second": 1, "2nd": 1, "two": 1,
      "third": 2, "3rd": 2, "three": 2,
      "fourth": 3, "4th": 3, "four": 3,
      "fifth": 4, "5th": 4, "five": 4,
      "last": -1, "bottom": -1
    };

    for (const [key, idx] of Object.entries(ordinalsMap)) {
      // Regex for standalone word match
      const regex = new RegExp(`\\b${key}\\b`, "i");
      if (regex.test(lower)) {
        const isEmailTarget = lower.includes("mail") || lower.includes("email") || lower.includes("row") || lower.includes("message");
        return { hasOrdinal: true, index: idx, isEmailTarget };
      }
    }

    return { hasOrdinal: false, index: -1, isEmailTarget: false };
  }

  /**
   * Detects whether user wants Motor Action, Batch Color Grading, or Reset
   */
  function detectCommandIntent(command) {
    const lower = command.trim().toLowerCase();

    // Reset intent
    if (
      lower === "reset" ||
      lower === "clear" ||
      lower.includes("clear color") ||
      lower.includes("remove color") ||
      lower.includes("uncolor") ||
      lower.includes("reset color")
    ) {
      return { type: "ACTION_RESET" };
    }

    // Batch color grading intent (must be an intentional batch coloring command, NOT clicking a single email)
    const colorKeywords = ["color", "colour", "dim", "blacken", "highlight all", "filter", "darken"];
    const hasColorVerb = colorKeywords.some((k) => lower.includes(k));
    const hasSpamNoun = lower.includes("spam") || lower.includes("unimportant") || lower.includes("promo") || lower.includes("promotional");

    if (hasColorVerb && (lower.includes("mail") || lower.includes("email") || hasSpamNoun)) {
      return {
        type: "ACTION_BATCH_COLOR",
        targetMode: lower.includes("important") && !lower.includes("non important") && !lower.includes("unimportant") ? "HIGHLIGHT_IMPORTANT" : "DIM_SPAM",
      };
    }

    // Default: Single-element Motor Navigation (Click / Type)
    return { type: "ACTION_MOTOR" };
  }

  /**
   * Batch Semantic Classifier for Email Inbox Rows
   */
  function classifyEmailBatch(emails) {
    const t0 = performance.now();

    const spamSignals = [
      "job alert", "job alerts", "naukri", "linkedin", "indeed", "glassdoor", "hiring",
      "actively recruiting", "jobs for you", "digest", "newsletter", "promotions", "promo",
      "lesswrong", "substack", "medium", "unsubscribe", "discount", "offer", "webinar",
      "marketing", "weekly account", "overstock", "sale", "deals", "updates"
    ];

    const criticalSignals = [
      "security alert", "verification code", "verification", "otp", "2fa", "recovery",
      "recovered", "sign-in", "unauthorized", "confirm your", "password", "bse", "nse",
      "zerodha", "kite", "securities", "balance", "bank", "invoice", "receipt", "payment",
      "salary", "tax", "statement", "funds"
    ];

    const results = emails.map((item) => {
      const fullText = `${item.sender} ${item.subject} ${item.snippet}`.toLowerCase();

      let spamScore = 0;
      let criticalScore = 0;

      for (const sig of spamSignals) {
        if (fullText.includes(sig)) spamScore += 1.8;
      }

      for (const sig of criticalSignals) {
        if (fullText.includes(sig)) criticalScore += 2.5;
      }

      const logitImportant = (criticalScore * 1.5) - (spamScore * 0.8) + 0.2;
      const logitSpam = (spamScore * 1.6) - (criticalScore * 1.2) - 0.2;

      const noul = resolveNoul([logitImportant, logitSpam]);
      const probSpam = noul.probability;
      const probImportant = Number((1.0 - probSpam).toFixed(4));

      let category = "neutral";
      if (probSpam >= 0.60) {
        category = "spam";
      } else if (probImportant >= 0.60) {
        category = "important";
      }

      return {
        item,
        category,
        probSpam,
        probImportant,
        confidence: Math.abs(Number((probSpam - probImportant).toFixed(4))),
      };
    });

    const latencyMs = Number((performance.now() - t0).toFixed(2));
    const spamCount = results.filter((r) => r.category === "spam").length;
    const importantCount = results.filter((r) => r.category === "important").length;

    return {
      results,
      latencyMs,
      totalEmails: emails.length,
      spamCount,
      importantCount,
    };
  }

  /**
   * Semantic affinity scoring with clean token matching
   */
  function computeSemanticAffinity(cleanQuery, targetText) {
    const qTokens = cleanQuery.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
    const tTextLower = targetText.toLowerCase();

    if (qTokens.length === 0 || tTextLower.length === 0) return -5.0;

    // Full phrase exact match
    if (tTextLower.includes(cleanQuery)) {
      return 6.0;
    }

    let matchCount = 0;
    for (const q of qTokens) {
      if (tTextLower.includes(q)) {
        matchCount += 1.0;
      }
    }

    const coverage = matchCount / qTokens.length;
    if (coverage === 1.0) return 5.0;
    if (coverage >= 0.5) return (coverage * 4.0) + 1.0;

    return (coverage * 5.0) - 3.0;
  }

  /**
   * Mentat Grounding: Map natural language command to best visible DOM candidate
   */
  function groundCommandToElements(userCommand, candidates) {
    const t0 = performance.now();
    const rawCmd = userCommand.trim().toLowerCase();
    const cleanTarget = cleanTargetQuery(rawCmd);
    const ordinal = parseOrdinalCommand(rawCmd);

    // 1. Ordinal resolution (e.g. "first mail", "second email", "top link")
    if (ordinal.hasOrdinal) {
      // Find candidate rows / emails if requested
      const matchingPool = ordinal.isEmailTarget
        ? candidates.filter((c) => c.isEmailRow || c.tag === "TR" || (c.text && c.text.length > 20))
        : candidates;

      if (matchingPool.length > 0) {
        const targetIdx = ordinal.index === -1 ? matchingPool.length - 1 : Math.min(ordinal.index, matchingPool.length - 1);
        const winner = matchingPool[targetIdx];
        return {
          winner,
          confidence: 0.99,
          probability: 0.99,
          isActionable: true,
          latencyMs: Number((performance.now() - t0).toFixed(2)),
          totalCandidates: candidates.length,
        };
      }
    }

    // 2. Standard Semantic Intent Grounding
    const isTyping = rawCmd.startsWith("type ") || rawCmd.startsWith("fill ") || rawCmd.startsWith("search ");
    const isClicking = !isTyping;

    const scoredCandidates = candidates.map((cand, idx) => {
      const combinedText = `${cand.text} ${cand.ariaLabel} ${cand.placeholder} ${cand.name} ${cand.title}`.trim();
      let affinityLogit = computeSemanticAffinity(cleanTarget, combinedText);

      // Boost matching element types
      if (isTyping && (cand.tag === "INPUT" || cand.tag === "TEXTAREA")) {
        affinityLogit += 2.0;
      }
      if (isClicking && (cand.tag === "BUTTON" || cand.tag === "A" || cand.role === "button" || cand.isEmailRow)) {
        affinityLogit += 1.5;
      }

      // Bonus if candidate contains the primary keyword directly
      if (combinedText.toLowerCase().includes(cleanTarget)) {
        affinityLogit += 3.0;
      }

      return {
        candidate: cand,
        index: idx,
        label: combinedText || `Element #${idx} <${cand.tag}>`,
        logit: Number(affinityLogit.toFixed(2)),
      };
    });

    const labels = scoredCandidates.map((c) => c.label);
    const logits = scoredCandidates.map((c) => c.logit);
    const choice = resolveChoice(labels, logits);
    const latency = Number((performance.now() - t0).toFixed(2));

    const winningCandidate = scoredCandidates[choice.winnerIdx]?.candidate || null;

    // Calibrated actionability threshold: if top candidate has positive logit or >= 25% prob
    const isActionable = choice.topProbability >= 0.20 || (scoredCandidates[choice.winnerIdx]?.logit ?? -5) > 0;

    return {
      winner: winningCandidate,
      confidence: choice.confidence,
      probability: choice.topProbability,
      isActionable,
      latencyMs: latency,
      totalCandidates: candidates.length,
    };
  }

  return {
    softmax,
    resolveChoice,
    resolveNoul,
    cleanTargetQuery,
    parseOrdinalCommand,
    detectCommandIntent,
    classifyEmailBatch,
    groundCommandToElements,
  };
})();
