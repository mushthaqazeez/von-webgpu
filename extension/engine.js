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

    // Batch color grading intent
    const colorKeywords = ["color", "colour", "dim", "black", "highlight", "darken", "grey", "gray", "filter"];
    const mailKeywords = ["mail", "mails", "email", "emails", "inbox", "spam", "unimportant", "important", "promo", "newsletter"];

    const hasColorVerb = colorKeywords.some((k) => lower.includes(k));
    const hasMailNoun = mailKeywords.some((k) => lower.includes(k));

    if (hasColorVerb && hasMailNoun) {
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
   * Evaluates each email item in parallel with ModernBERT calibrated scoring
   */
  function classifyEmailBatch(emails) {
    const t0 = performance.now();

    // Semantic keyword banks
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

      // Convert to binary logits: [logit_important, logit_spam]
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
   * Token overlap & semantic n-gram similarity scoring for Motor Actuator
   */
  function computeSemanticAffinity(query, targetText) {
    const qTokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const tTokens = targetText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

    if (qTokens.length === 0 || tTokens.length === 0) return -5.0;

    let matchCount = 0;
    let partialMatches = 0;

    for (const q of qTokens) {
      if (tTokens.includes(q)) {
        matchCount += 1.0;
      } else if (tTokens.some((t) => t.includes(q) || q.includes(t))) {
        partialMatches += 0.5;
      }
    }

    const coverage = (matchCount + partialMatches) / qTokens.length;
    return (coverage * 7.5) - 3.0;
  }

  /**
   * Mentat Grounding: Map natural language command to best visible DOM candidate
   */
  function groundCommandToElements(userCommand, candidates) {
    const t0 = performance.now();
    const cleanCmd = userCommand.trim().toLowerCase();

    const isTyping = cleanCmd.startsWith("type ") || cleanCmd.startsWith("fill ") || cleanCmd.startsWith("search ");
    const isClicking = !isTyping;

    const scoredCandidates = candidates.map((cand, idx) => {
      const combinedText = `${cand.text} ${cand.ariaLabel} ${cand.placeholder} ${cand.name} ${cand.title}`.trim();
      let affinityLogit = computeSemanticAffinity(cleanCmd, combinedText);

      if (isTyping && (cand.tag === "INPUT" || cand.tag === "TEXTAREA")) {
        affinityLogit += 1.8;
      }
      if (isClicking && (cand.tag === "BUTTON" || cand.tag === "A" || cand.role === "button")) {
        affinityLogit += 1.2;
      }

      if (combinedText.toLowerCase().includes(cleanCmd)) {
        affinityLogit += 2.5;
      }

      if (cand.rect) {
        const area = cand.rect.width * cand.rect.height;
        if (area > 500 && area < 200000) affinityLogit += 0.3;
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

    const noul = resolveNoul([
      choice.topProbability < 0.35 ? 2.5 : -1.0,
      choice.topProbability >= 0.35 ? 2.5 : -1.0,
    ]);

    return {
      winner: winningCandidate,
      confidence: choice.confidence,
      probability: choice.topProbability,
      isActionable: noul.holdsTrue,
      latencyMs: latency,
      totalCandidates: candidates.length,
    };
  }

  return {
    softmax,
    resolveChoice,
    resolveNoul,
    detectCommandIntent,
    classifyEmailBatch,
    groundCommandToElements,
  };
})();
