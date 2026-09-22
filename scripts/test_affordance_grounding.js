// test_affordance_grounding.js - Verifying Approach A Affordance Vectors in Node
import { pipeline } from "@xenova/transformers";

const VON_TEMPERATURE = 1.1692;

function softmax(logits, temperature = VON_TEMPERATURE) {
  const scaled = logits.map((l) => l / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((x) => Math.exp(x - max));
  const sum = exps.reduce((acc, val) => acc + val, 0);
  return exps.map((val) => val / sum);
}

function cosineSimilarity(vecA, vecB, offsetB = 0) {
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    sum += vecA[i] * vecB[offsetB + i];
  }
  return sum;
}

async function run() {
  console.log("[*] Loading all-MiniLM-L6-v2 pipeline...");
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });

  // 1. Test Affordance Grounding for "go back"
  console.log("\n--- TEST 1: 'go back' in Thread View ---");
  const state = "Reading opened email thread";
  const userCommand = "go back";
  const contextualGoal = `Context: ${state}. Action goal: ${userCommand}`;

  // Candidates with rich synthesized affordances
  const candidates = [
    {
      id: "back-button",
      affordance: "[AFFORDANCE: navigate_back | ROLE: button | LOCATION: top_toolbar | LABEL: 'Back to Inbox' | ICON: arrow_left]",
      label: "Back to Inbox",
    },
    {
      id: "import-button",
      affordance: "[AFFORDANCE: primary_action | ROLE: button | LOCATION: main_container | LABEL: 'Import Project' | ICON: none]",
      label: "Import Project",
    },
    {
      id: "search-box",
      affordance: "[AFFORDANCE: text_input | ROLE: searchbox | LOCATION: top_toolbar | LABEL: 'Search mail' | ICON: search]",
      label: "Search mail",
    },
    {
      id: "more-options",
      affordance: "[AFFORDANCE: menu_toggle | ROLE: button | LOCATION: top_toolbar | LABEL: 'More options' | ICON: dots_vertical]",
      label: "More options",
    },
  ];

  const goalEmbed = await pipe(contextualGoal, { pooling: "mean", normalize: true });
  const qVec = Array.from(goalEmbed.data);
  const dim = qVec.length;

  const candEmbeds = await pipe(candidates.map((c) => c.affordance), { pooling: "mean", normalize: true });

  const rawSims = candidates.map((cand, i) => {
    return cosineSimilarity(qVec, candEmbeds.data, i * dim);
  });

  // Scale similarities as logits (Logit scaling factor = 12.0)
  const logits = rawSims.map((s) => s * 12.0);
  const probs = softmax(logits, VON_TEMPERATURE);

  console.log(`Goal: "${contextualGoal}"`);
  candidates.forEach((c, idx) => {
    console.log(`- [${c.id}] Sim: ${rawSims[idx].toFixed(4)} | Prob: ${(probs[idx] * 100).toFixed(1)}% | ${c.affordance}`);
  });

  const bestIdx = probs.indexOf(Math.max(...probs));
  console.log(`\nWinner: ${candidates[bestIdx].id} with ${(probs[bestIdx] * 100).toFixed(1)}% probability!`);

  if (candidates[bestIdx].id === "back-button" && probs[bestIdx] > 0.8) {
    console.log("[PASS] Test 1: 'go back' cleanly acquired the Back button via affordance vectors!");
  } else {
    console.error("[FAIL] Test 1 failed!");
  }

  // 2. Test Zero-Rule Intent Classification via Vector Space
  console.log("\n--- TEST 2: Vector Anchor Intent Classification ---");
  const intentAnchors = {
    ACTION_NAV: "navigate backward, go back, return to previous page, forward, reload, or scroll view",
    ACTION_BATCH_COLOR: "color, highlight, filter, or dim emails in the inbox list by category or spam",
    ACTION_RESET: "reset, clear, restore normal view, remove color grading and styling",
    ACTION_MOTOR: "click, select, open, or focus a specific interactive element or button on the screen",
  };

  const anchorKeys = Object.keys(intentAnchors);
  const anchorTexts = Object.values(intentAnchors);
  const anchorEmbeds = await pipe(anchorTexts, { pooling: "mean", normalize: true });

  const testQueries = [
    "go back",
    "dim the junk emails",
    "colour important mails",
    "clear custom colors",
    "click on import project",
  ];

  for (const q of testQueries) {
    const qEmbed = await pipe(q, { pooling: "mean", normalize: true });
    const qV = Array.from(qEmbed.data);
    const sims = anchorKeys.map((k, i) => cosineSimilarity(qV, anchorEmbeds.data, i * dim));
    const maxIdx = sims.indexOf(Math.max(...sims));
    console.log(`Query: "${q}" -> Detected Intent: ${anchorKeys[maxIdx]} (sim: ${sims[maxIdx].toFixed(3)})`);
  }
}

run().catch(console.error);
