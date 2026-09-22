import os
import sys
import argparse
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from onnxruntime.quantization import quantize_dynamic, QuantType

def export_and_quantize(
    model_id: str = "wfzyx/von-1.0",
    output_onnx: str = "von_1.0.onnx",
    output_int8: str = "von_1.0_int8.onnx",
    opset: int = 17,
):
    print(f"===========================================================")
    print(f"[*] Exporting '{model_id}' to ONNX and INT8 Quantization")
    print(f"===========================================================")

    print(f"[*] Loading tokenizer and model: {model_id}...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForSequenceClassification.from_pretrained(model_id)
    except Exception as e:
        print(f"[!] Error loading model/tokenizer: {e}")
        sys.exit(1)

    model.eval()

    # Dummy input to trace computational graph
    dummy_text = "The quick brown fox jumps over the lazy dog"
    inputs = tokenizer(dummy_text, return_tensors="pt")

    print(f"[*] Exporting computational graph to {output_onnx} (opset {opset})...")
    torch.onnx.export(
        model,
        (inputs["input_ids"], inputs["attention_mask"]),
        output_onnx,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "attention_mask": {0: "batch_size", 1: "seq_len"},
            "logits": {0: "batch_size"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )
    onnx_size_mb = os.path.getsize(output_onnx) / (1024 * 1024)
    print(f"[✓] Full precision model saved to {output_onnx} ({onnx_size_mb:.2f} MB)")

    # Quantize to INT8 for edge execution (shrinks from ~1.5GB to ~380MB)
    print(f"[*] Performing dynamic INT8 quantization...")
    quantize_dynamic(
        output_onnx,
        output_int8,
        weight_type=QuantType.QInt8,
    )
    int8_size_mb = os.path.getsize(output_int8) / (1024 * 1024)
    print(f"[✓] Edge quantized model saved to {output_int8} ({int8_size_mb:.2f} MB)")
    print(f"[✓] Compression ratio: {onnx_size_mb / int8_size_mb:.1f}x reduction")
    print(f"===========================================================")
    print(f"[🎉] Export complete! Model is ready for zero-Python WebGPU runtime.")

def main():
    parser = argparse.ArgumentParser(description="Export and quantize von-1.0 to ONNX for WebGPU edge execution.")
    parser.add_argument("--model-id", default="wfzyx/von-1.0", help="Hugging Face model ID")
    parser.add_argument("--output-onnx", default="von_1.0.onnx", help="Output path for FP32 ONNX model")
    parser.add_argument("--output-int8", default="von_1.0_int8.onnx", help="Output path for INT8 quantized model")
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    args = parser.parse_args()

    export_and_quantize(
        model_id=args.model_id,
        output_onnx=args.output_onnx,
        output_int8=args.output_int8,
        opset=args.opset,
    )

if __name__ == "__main__":
    main()
