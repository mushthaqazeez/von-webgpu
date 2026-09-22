// primitives.ts - Decision Math & Calibration Layer

/**
 * Calibrated temperature fitted by Von during training.
 * ModernBERT sequence classification outputs are scaled by this factor before softmax.
 */
export const VON_TEMPERATURE = 1.1692;

export interface ChoiceResult {
  winner: string;
  confidence: number; // Top1 prob - Top2 prob
  distribution: Record<string, number>;
}

export interface NoulResult {
  probability: number; // 0.0 to 1.0 calibrated truth value
  holdsTrue: boolean;
}

export interface ScoreResult {
  expectedScore: number;
  distribution: number[];
}

/**
 * Numerically stable softmax with temperature scaling
 */
export function softmax(logits: number[], temperature: number = VON_TEMPERATURE): number[] {
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
 * Choice Primitive: Pick one candidate from a set of discrete hypotheses
 * Computes margin confidence between Top 1 and Top 2 candidate.
 */
export function resolveChoice(labels: string[], rawLogits: number[]): ChoiceResult {
  if (labels.length === 0) {
    return { winner: "", confidence: 0, distribution: {} };
  }

  const probs = softmax(rawLogits.slice(0, labels.length));
  
  const distribution: Record<string, number> = {};
  labels.forEach((label, idx) => {
    distribution[label] = Number((probs[idx] ?? 0).toFixed(4));
  });

  const sortedProbs = [...probs].sort((a, b) => b - a);
  const topProb = sortedProbs[0] ?? 0;
  const secondProb = sortedProbs[1] ?? 0;
  
  const winnerIdx = probs.indexOf(topProb);
  
  return {
    winner: labels[winnerIdx] ?? labels[0],
    confidence: Number((topProb - secondProb).toFixed(4)),
    distribution,
  };
}

/**
 * Noul Primitive: Calibrated condition verification [0.0, 1.0]
 * Uses binary softmax over [false_logit, true_logit].
 */
export function resolveNoul(binaryLogits: [number, number] | number[]): NoulResult {
  const logitsSlice = [binaryLogits[0] ?? 0, binaryLogits[1] ?? 0];
  const probs = softmax(logitsSlice);
  const probTrue = probs[1] ?? 0;

  return {
    probability: Number(probTrue.toFixed(4)),
    holdsTrue: probTrue >= 0.5,
  };
}

/**
 * Score Primitive: Ordinal rating calculation (expected value)
 * Computes expected score across 0..K-1 discrete levels.
 */
export function resolveScore(logits: number[]): ScoreResult {
  if (logits.length === 0) {
    return { expectedScore: 0, distribution: [] };
  }

  const probs = softmax(logits);
  // Expected value over 0..K-1 levels
  const expected = probs.reduce((sum, p, level) => sum + level * p, 0);

  return {
    expectedScore: Number(expected.toFixed(3)),
    distribution: probs.map((p) => Number(p.toFixed(4))),
  };
}
