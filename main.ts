import fs from "node:fs";
import { SystemOneRuntime } from "./src/system_one.js";
import { resolveChoice, resolveNoul, resolveScore } from "./src/primitives.js";

async function main() {
  console.log("===============================================================");
  console.log("🚀 Von-1.0 System 1 Edge Runtime (ModernBERT / WebGPU / WASM)");
  console.log("===============================================================\n");

  const modelPath = "./von_1.0_int8.onnx";
  const hasLocalModel = fs.existsSync(modelPath);

  if (hasLocalModel) {
    console.log(`[*] Detected local model: ${modelPath}. Initializing runtime...`);
    const engine = new SystemOneRuntime();
    await engine.init(modelPath);

    // 1. Instant Agent Action Gating (Noul)
    console.log("\n--- [1] Checking Agent Tool Execution Safety (Noul) ---");
    const toolCallState = "Agent attempting to run: rm -rf /var/log/* on target production-db-01";
    const safetyCheck = await engine.judge(
      toolCallState,
      "Is this command safe for automated headless execution?"
    );
    console.log(`Command: "${toolCallState}"`);
    console.log(`P(Safe): ${safetyCheck.probability} | Approved: ${safetyCheck.holdsTrue}`);

    // 2. Sub-50ms Support Ticket Routing (Choice)
    console.log("\n--- [2] Triage Ticket Routing (Choice) ---");
    const ticket = "Payment failed on Stripe invoice #9201. Customer received 402 Card Declined.";
    const routing = await engine.decide(
      ticket,
      "Which department handles this incident?",
      ["billing", "technical_support", "sales", "legal"]
    );
    console.log(`Ticket: "${ticket}"`);
    console.log(`Assigned: ${routing.winner} (Confidence: ${routing.confidence})`);
    console.log("Probabilities:", routing.distribution);

    // 3. Rubric Evaluation (Score)
    console.log("\n--- [3] Ordinal Rubric Evaluation (Score) ---");
    const doc = "The quick brown fox jumps over the lazy dog.";
    const scoreResult = await engine.rate(doc, "Clarity and grammatical coherence", 5);
    console.log(`Expected Score (0-4): ${scoreResult.expectedScore}`);
    console.log("Distribution:", scoreResult.distribution);

    // 4. Batch Fan-Out (Milestone 2)
    console.log("\n--- [4] Speculative Batch Fan-Out (Parallel Multi-Assertion in 1 pass) ---");
    const fanOutAssertions = [
      "Is this command safe for headless execution?",
      "Does this command target production systems?",
      "Does this command delete non-recoverable data?",
      "Does this command require sudo privileges?",
    ];
    const fanOutResults = await engine.judgeBatch(toolCallState, fanOutAssertions);
    fanOutAssertions.forEach((assertion, i) => {
      console.log(`  [Assertion ${i + 1}] "${assertion}" -> P=${fanOutResults[i].probability} (True: ${fanOutResults[i].holdsTrue})`);
    });

    if (engine.lastInferenceMeta) {
      console.log(`\nLatency: ${engine.lastInferenceMeta.latencyMs}ms | Provider: ${engine.lastInferenceMeta.provider}`);
    }
  } else {
    console.log(`[i] Local model binary "${modelPath}" not yet generated.`);
    console.log(`[i] Demonstrating System 1 Decision Math & Calibration Layer with calibrated fixtures:\n`);

    // Simulated Noul check
    const toolCallState = "Agent attempting to run: rm -rf /var/log/* on target production-db-01";
    console.log("--- [1] Instant Agent Action Gating (Noul) ---");
    console.log(`State: "${toolCallState}"`);
    // Simulated logits for unsafe command: [false_logit=3.82, true_logit=-2.15]
    const noulSample = resolveNoul([3.82, -2.15]);
    console.log(`Assertion: "Is this command safe for automated headless execution?"`);
    console.log(`P(Safe): ${noulSample.probability} | Approved: ${noulSample.holdsTrue} (BLOCKED)\n`);

    // Simulated Choice routing
    const ticket = "Payment failed on Stripe invoice #9201. Customer received 402 Card Declined.";
    console.log("--- [2] Triage Ticket Routing (Choice) ---");
    console.log(`Ticket: "${ticket}"`);
    // Simulated logits: billing (4.12), technical_support (0.85), sales (-1.2), legal (-2.4)
    const choiceSample = resolveChoice(
      ["billing", "technical_support", "sales", "legal"],
      [4.12, 0.85, -1.2, -2.4]
    );
    console.log(`Winner: ${choiceSample.winner} (Confidence margin: ${choiceSample.confidence})`);
    console.log("Distribution:", choiceSample.distribution);

    // Simulated Score
    console.log("\n--- [3] Ordinal Rubric Evaluation (Score) ---");
    const scoreSample = resolveScore([-1.2, -0.4, 0.5, 2.1, 3.8]);
    console.log(`Expected Score (0-4): ${scoreSample.expectedScore}`);
    console.log("Distribution:", scoreSample.distribution);

    console.log("\n---------------------------------------------------------------");
    console.log("To export the full ONNX model from Hugging Face:");
    console.log("  python -m pip install -r requirements.txt");
    console.log("  npm run export:model");
    console.log("---------------------------------------------------------------");
  }
}

main().catch(console.error);
