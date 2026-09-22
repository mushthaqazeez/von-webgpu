# Von-WebGPU ⚡

> **Zero-Python, sub-15ms client-side System 1 inference for `wfzyx/von-1.0` (ModernBERT) directly over WebGPU.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Runtime](https://img.shields.io/badge/Runtime-WebGPU%20%7C%20WASM%20%7C%20Node-blueviolet)](https://github.com/mushthaqazeez/von-webgpu)
[![Model](https://img.shields.io/badge/Backbone-ModernBERT-success)](https://huggingface.co/wfzyx/von-1.0)
[![Python Dependency](https://img.shields.io/badge/Python%20Runtime-0%25%20(Pure%20JS)-orange)](#)

---

## 💡 What is This?

When building AI agents or smart web applications, **calling a 70B LLM like Claude or GPT-4 for simple reflex decisions is too slow (1,000ms–2,000ms) and expensive.**

**Von-WebGPU** brings **`wfzyx/von-1.0`** (a decision network trained on ModernBERT) directly into **JavaScript/TypeScript**:
- **0ms network latency to cloud** — Runs 100% locally on user hardware via WebGPU.
- **$0 API bills** — Zero external API calls.
- **Zero Python runtime** — No PyTorch, no CUDA drivers, no server backends.
- **Quantized to ~380MB INT8** — Edge-ready and cached offline in browser `CacheStorage`.

---

## ⚡ Use Cases

| Primitive | Use Case | Latency | Example |
| :--- | :--- | :--- | :--- |
| **`judge` (Noul)** | Agent Safety Gating & Policy Verification | **~15ms** | Block dangerous bash commands (`rm -rf`) before execution |
| **`decide` (Choice)** | Instant Ticket & Query Routing | **~25ms** | Categorize support inquiries directly in client or edge worker |
| **`rate` (Score)** | Rubric Evaluation & Quality Scoring | **~25ms** | Rate response quality or coherence along an ordinal scale |
| **`judgeBatch`** | **Speculative Fan-Out** (Milestone 2) | **~30ms** | Run 5 parallel safety checks on the same context in **1 pass** |

---

## 🏗️ Architecture

```text
+-------------------------------------------------------------------------------+
|                             Application Layer                                 |
|  - Agent Safety Gates (judge / Noul)    - Ticket Triage (decide / Choice)     |
|  - Evaluation / Rubrics (rate / Score)  - Multi-question Batch Fan-Out        |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
|                      SystemOneRuntime Core Engine                             |
|  - Prompt hypothesis formatting        - ModernBERT Tokenizer (Transformers.js)|
|  - Speculative batching fan-out        - Model Caching (CacheStorage / FS)    |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
|                   Decision Math & Calibration Layer                           |
|  - Calibrated Temperature (T = 1.1692) - Numerically Stable Softmax           |
|  - Choice, Noul, Score Primitives                                            |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
|                 ONNX Runtime (WebGPU / WASM / Node)                           |
|  - Edge-quantized von_1.0_int8.onnx (~380MB)                                  |
+-------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart

### 1. Installation

```bash
npm install von-webgpu onnxruntime-web @xenova/transformers
```

### 2. High-Speed Agent Guardrail (`judge` / Noul)

```typescript
import { SystemOneRuntime } from "von-webgpu";

const engine = new SystemOneRuntime();
await engine.init("./von_1.0_int8.onnx");

// Sub-15ms Safety Verification
const command = "Agent executing: rm -rf /var/log/* on target prod-db";
const safety = await engine.judge(
  command,
  "Is this command safe for automated headless execution?"
);

console.log(safety.holdsTrue);     // false
console.log(safety.probability);   // 0.0382 (Calibrated truth value)
```

### 3. Triage & Ticket Routing (`decide` / Choice)

```typescript
const ticket = "Payment failed on Stripe invoice #9201. Customer received 402 Card Declined.";

const routing = await engine.decide(
  ticket,
  "Which department handles this incident?",
  ["billing", "technical_support", "sales", "legal"]
);

console.log(`Routed to: ${routing.winner}`); // "billing"
console.log(`Confidence: +${routing.confidence}`);
console.log("Distribution:", routing.distribution);
```

### 4. Speculative Batch Fan-Out (Parallel Checks in 1 Pass)

Instead of running multiple serial inferences, evaluate multiple assertions simultaneously:

```typescript
const assertions = [
  "Does this command target production systems?",
  "Does this command delete non-recoverable data?",
  "Does this command require sudo privileges?",
  "Is this command safe for headless execution?"
];

// Single forward pass over WebGPU!
const results = await engine.judgeBatch(command, assertions);
results.forEach((res, i) => {
  console.log(`${assertions[i]} -> ${res.holdsTrue} (P: ${res.probability})`);
});
```

---

## 🌐 Running in the Browser / Chrome Extensions

Weights are lazy-loaded and cached directly to the browser's `CacheStorage`:

```typescript
import { SystemOneRuntime } from "von-webgpu";

const engine = new SystemOneRuntime();
await engine.init({
  modelSource: "https://your-cdn.com/models/von_1.0_int8.onnx",
  executionProviders: ["webgpu", "wasm"],
  onProgress: (p) => console.log(`Download progress: ${p.percent}%`),
});
```

Try the interactive browser showcase by opening `demo/index.html` in Chrome or Edge!

---

## 📦 Model Export & Quantization

To export `wfzyx/von-1.0` from Hugging Face into an edge-quantized INT8 ONNX graph (~380MB):

```bash
# 1. Install export dependencies
pip install -r requirements.txt

# 2. Run export script
python export_von.py
```

This exports `von_1.0.onnx` and generates `von_1.0_int8.onnx` with dynamic axes for sequence length and batch size.

---

## 🧪 Running Tests

```bash
npm test
```

Verifies temperature scaling ($T = 1.1692$), numerical stability of extreme logits, margin confidence calculations, and ordinal expectation formulas.

---

## 🤝 Contributing

Contributions are warmly welcomed! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to get started.

## 📄 License

[MIT](./LICENSE) © Mushthaq azeez
