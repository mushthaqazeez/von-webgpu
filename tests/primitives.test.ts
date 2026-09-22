import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  softmax,
  resolveChoice,
  resolveNoul,
  resolveScore,
  VON_TEMPERATURE,
} from "../src/primitives.js";

describe("Decision Math & Calibration Primitives", () => {
  it("should have calibrated temperature set to 1.1692", () => {
    assert.equal(VON_TEMPERATURE, 1.1692);
  });

  describe("softmax", () => {
    it("sums to 1.0", () => {
      const probs = softmax([2.0, 1.0, 0.1]);
      const sum = probs.reduce((acc, v) => acc + v, 0);
      assert.ok(Math.abs(sum - 1.0) < 1e-5);
    });

    it("handles extreme logits without NaN or overflow", () => {
      const probs = softmax([1000, 1000, 999]);
      assert.ok(!probs.some(isNaN));
      assert.ok(probs[0] > 0);
    });

    it("handles negative logits safely", () => {
      const probs = softmax([-10, -20, -30]);
      assert.ok(!probs.some(isNaN));
      assert.ok(probs[0] > probs[1]);
      assert.ok(probs[1] > probs[2]);
    });
  });

  describe("resolveChoice", () => {
    it("selects winner with highest logit and computes confidence margin", () => {
      const labels = ["billing", "technical_support", "sales", "legal"];
      // Billing has highest logit, technical_support second
      const logits = [4.5, 2.0, 0.1, -1.0];
      const result = resolveChoice(labels, logits);

      assert.equal(result.winner, "billing");
      assert.ok(result.confidence > 0);
      assert.ok(result.distribution["billing"] > result.distribution["technical_support"]);
      assert.equal(typeof result.distribution["billing"], "number");
    });
  });

  describe("resolveNoul", () => {
    it("evaluates true condition when true logit exceeds false logit", () => {
      // [false_logit, true_logit]
      const result = resolveNoul([-1.5, 2.5]);
      assert.equal(result.holdsTrue, true);
      assert.ok(result.probability > 0.5);
    });

    it("evaluates false condition when false logit exceeds true logit", () => {
      const result = resolveNoul([3.0, -1.0]);
      assert.equal(result.holdsTrue, false);
      assert.ok(result.probability < 0.5);
    });
  });

  describe("resolveScore", () => {
    it("computes expected score across ordinal levels", () => {
      // 5 levels (0, 1, 2, 3, 4) with highest weight on level 4
      const logits = [-2.0, -1.0, 0.0, 2.0, 4.0];
      const result = resolveScore(logits);

      assert.ok(result.expectedScore > 2.5);
      assert.equal(result.distribution.length, 5);
    });
  });
});
