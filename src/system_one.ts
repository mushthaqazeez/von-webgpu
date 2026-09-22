// system_one.ts - Zero-Python Edge Runtime for von-1.0 (WebGPU / WASM / Node)
import * as ort from "onnxruntime-web";
import { AutoTokenizer } from "@xenova/transformers";
import {
  resolveChoice,
  resolveNoul,
  resolveScore,
  ChoiceResult,
  NoulResult,
  ScoreResult,
} from "./primitives.js";
import { loadModelWithCache, ProgressCallback } from "./cache.js";

export interface SystemOneInitOptions {
  /** Local file path (Node), URL, or raw ArrayBuffer of the quantized ONNX model */
  modelSource?: string | ArrayBuffer;
  /** Hugging Face repo ID or custom path for the ModernBERT tokenizer */
  tokenizerId?: string;
  /** Execution providers in priority order. Defaults to ['webgpu', 'wasm'] */
  executionProviders?: string[];
  /** Optional callback to monitor download progress when fetching remote weights */
  onProgress?: ProgressCallback;
  /** ONNX Graph optimization level */
  graphOptimizationLevel?: "disabled" | "basic" | "extended" | "all";
}

export interface BatchQuery {
  question: string;
  choices: string[];
}

export interface InferenceMetadata {
  latencyMs: number;
  batchSize: number;
  provider: string;
}

export class SystemOneRuntime {
  private session: ort.InferenceSession | null = null;
  private tokenizer: any = null;
  private activeProvider: string = "unknown";
  public lastInferenceMeta: InferenceMetadata | null = null;

  /**
   * Initializes the ModernBERT tokenizer and ONNX Runtime session
   */
  async init(options: SystemOneInitOptions | string = "./von_1.0_int8.onnx") {
    const opts: SystemOneInitOptions =
      typeof options === "string" ? { modelSource: options } : options;

    const tokenizerId = opts.tokenizerId ?? "wfzyx/von-1.0";
    const executionProviders = opts.executionProviders ?? ["webgpu", "wasm"];

    // 1. Initialize ModernBERT tokenizer in pure WASM/JS
    console.log(`[*] Initializing ModernBERT tokenizer (${tokenizerId})...`);
    this.tokenizer = await AutoTokenizer.from_pretrained(tokenizerId);

    // 2. Resolve model source (local path, URL via CacheStorage, or ArrayBuffer)
    let modelBufferOrPath: string | Uint8Array = "./von_1.0_int8.onnx";

    if (opts.modelSource) {
      if (opts.modelSource instanceof ArrayBuffer) {
        modelBufferOrPath = new Uint8Array(opts.modelSource);
      } else if (typeof opts.modelSource === "string") {
        if (opts.modelSource.startsWith("http://") || opts.modelSource.startsWith("https://")) {
          console.log(`[*] Fetching model weights from ${opts.modelSource}...`);
          const arrayBuffer = await loadModelWithCache(opts.modelSource, opts.onProgress);
          modelBufferOrPath = new Uint8Array(arrayBuffer);
        } else {
          modelBufferOrPath = opts.modelSource;
        }
      }
    }

    // 3. Create ONNX inference session with WebGPU and fallback
    console.log(`[*] Spawning ONNX session with providers: ${executionProviders.join(", ")}...`);
    
    // Configure wasm paths or env if available
    try {
      this.session = await ort.InferenceSession.create(modelBufferOrPath as any, {
        executionProviders,
        graphOptimizationLevel: opts.graphOptimizationLevel ?? "all",
      });
      this.activeProvider = executionProviders[0];
      console.log(`[✓] System 1 Session Ready (active provider: ${this.activeProvider}).`);
    } catch (err) {
      console.warn(`[!] Primary provider failed, attempting fallback to wasm:`, err);
      this.session = await ort.InferenceSession.create(modelBufferOrPath as any, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "basic",
      });
      this.activeProvider = "wasm";
      console.log(`[✓] System 1 Session Ready (fallback provider: wasm).`);
    }
  }

  /**
   * Set custom session (useful for tests or mocking)
   */
  setSession(session: ort.InferenceSession, tokenizer: any) {
    this.session = session;
    this.tokenizer = tokenizer;
    this.activeProvider = "custom";
  }

  /**
   * Forward pass: tokenizes text and runs ONNX inference with batching support
   */
  async forward(texts: string | string[]): Promise<number[][]> {
    if (!this.session || !this.tokenizer) {
      throw new Error("SystemOneRuntime is not initialized. Call await engine.init() first.");
    }

    const textList = Array.isArray(texts) ? texts : [texts];
    const batchSize = textList.length;

    // Tokenize using ModernBERT tokenizer
    const encoded = await this.tokenizer(textList, {
      padding: true,
      truncation: true,
      max_length: 512,
    });

    const seqLen = encoded.input_ids.dims ? encoded.input_ids.dims[1] : encoded.input_ids.data.length / batchSize;

    // Build ONNX input tensors with 64-bit integer values
    const inputIdsData = BigInt64Array.from(encoded.input_ids.data);
    const attentionMaskData = BigInt64Array.from(encoded.attention_mask.data);

    const inputIds = new ort.Tensor("int64", inputIdsData, [batchSize, seqLen]);
    const attentionMask = new ort.Tensor("int64", attentionMaskData, [batchSize, seqLen]);

    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIds,
      attention_mask: attentionMask,
    };

    const t0 = performance.now();
    const results = await this.session.run(feeds);
    const latency = performance.now() - t0;

    this.lastInferenceMeta = {
      latencyMs: Number(latency.toFixed(2)),
      batchSize,
      provider: this.activeProvider,
    };

    const logitsTensor = results.logits;
    const logitsRaw = Array.from(logitsTensor.data as Float32Array);

    // Reshape output [batchSize, numClasses]
    const numClasses = logitsRaw.length / batchSize;
    const batchedLogits: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      batchedLogits.push(logitsRaw.slice(i * numClasses, (i + 1) * numClasses));
    }

    return batchedLogits;
  }

  /**
   * Choice Primitive: High-speed categorical routing
   */
  async decide(state: string, question: string, choices: string[]): Promise<ChoiceResult> {
    const formatted = `State: ${state}\nQuestion: ${question}\nCandidate: ${choices.join(", ")}`;
    const [logits] = await this.forward(formatted);
    return resolveChoice(choices, logits.slice(0, choices.length));
  }

  /**
   * Noul Primitive: Sub-15ms calibrated boolean policy verification
   */
  async judge(state: string, assertion: string): Promise<NoulResult> {
    const formatted = `State: ${state}\nAssertion: ${assertion}`;
    const [logits] = await this.forward(formatted);
    return resolveNoul([logits[0], logits[1]]);
  }

  /**
   * Score Primitive: Ordinal evaluation along a rubric
   */
  async rate(state: string, metric: string, levels: number = 5): Promise<ScoreResult> {
    const formatted = `State: ${state}\nMetric: ${metric}\nLevels: ${levels}`;
    const [logits] = await this.forward(formatted);
    return resolveScore(logits.slice(0, levels));
  }

  // ==========================================
  // Milestone 2: Speculative Batch Fan-Out
  // ==========================================

  /**
   * Speculative Multi-Assertion Fan-Out:
   * Verifies multiple safety or logic conditions over the same state in a SINGLE inference pass!
   */
  async judgeBatch(state: string, assertions: string[]): Promise<NoulResult[]> {
    if (assertions.length === 0) return [];
    const formattedList = assertions.map(
      (assertion) => `State: ${state}\nAssertion: ${assertion}`
    );
    const batchLogits = await this.forward(formattedList);
    return batchLogits.map((logits) => resolveNoul([logits[0], logits[1]]));
  }

  /**
   * Speculative Multi-Question Fan-Out:
   * Evaluates multiple discrete questions/choices over the same state in a SINGLE inference pass.
   */
  async decideBatch(state: string, queries: BatchQuery[]): Promise<ChoiceResult[]> {
    if (queries.length === 0) return [];
    const formattedList = queries.map(
      (q) => `State: ${state}\nQuestion: ${q.question}\nCandidate: ${q.choices.join(", ")}`
    );
    const batchLogits = await this.forward(formattedList);
    return queries.map((q, idx) =>
      resolveChoice(q.choices, batchLogits[idx].slice(0, q.choices.length))
    );
  }
}
