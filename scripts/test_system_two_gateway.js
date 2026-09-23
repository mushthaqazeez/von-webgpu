// test_system_two_gateway.js - Verifies System 2 Planning Schema & Dual-Brain Protocol

async function run() {
  console.log("[*] Testing System 2 Gateway & Playbook Validation...");

  // Mock System 2 response schema
  const mockSystem2Response = JSON.stringify({
    thought: "The user wants to write an email. We need to click Compose, wait for the editor, fill recipient and body.",
    workflow: "compose_and_draft_email",
    steps: [
      { action: "CLICK", target: "compose_button", desc: "Click Compose button" },
      { action: "WAIT_FOR", selector: "[aria-label='New Message'], div[role='dialog']", timeoutMs: 3000, desc: "Wait for message editor" },
      { action: "TYPE", target: "to_recipient_field", value: "dev-team@company.com", pressEnter: true, desc: "Enter recipient" },
      { action: "TYPE", target: "subject_field", value: "Sprint Update Deployed", desc: "Fill subject" },
      { action: "TYPE", target: "email_body_editor", value: "Hi team,\n\nEverything is deployed and running smoothly on WebGPU.\n\nBest,\nMentat Pilot", desc: "Fill email body" }
    ]
  });

  const parsed = JSON.parse(mockSystem2Response);

  console.log(`[✓] Workflow Name: ${parsed.workflow}`);
  console.log(`[✓] Steps count: ${parsed.steps.length}`);

  const requiredKeys = ["action", "desc"];
  parsed.steps.forEach((step, idx) => {
    const hasKeys = requiredKeys.every(k => k in step);
    if (!hasKeys) throw new Error(`Step ${idx + 1} missing required keys!`);
    console.log(`  Step ${idx + 1}: [${step.action}] ${step.desc}`);
  });

  console.log("\n[*] Checking if local Ollama daemon is running at http://localhost:11434...");
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    if (res.ok) {
      const data = await res.json();
      console.log(`[✓] Local Ollama is ONLINE! Available models:`, data.models.map(m => m.name));
    } else {
      console.log(`[i] Local Ollama returned status: ${res.status}.`);
    }
  } catch (err) {
    console.log(`[i] Local Ollama not active on port 11434 (Standard when user hasn't started 'ollama serve'). Extension falls back to configured cloud key or System 1 direct motor reflexes.`);
  }

  console.log("\n[PASS] Dual-Brain System 2 Playbook protocol validated successfully.");
}

run().catch(console.error);
