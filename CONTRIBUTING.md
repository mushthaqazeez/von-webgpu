# Contributing to Von-WebGPU

Thank you for your interest in contributing to **Von-WebGPU**! We are building a high-speed, zero-Python System 1 reflex engine running client-side over WebGPU.

## How to Get Involved

1. **Fork the Repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/von-webgpu.git
   cd von-webgpu
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Run Tests**:
   ```bash
   npm test
   ```
5. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/my-cool-feature
   ```

## Roadmap & Areas We Need Help With
- [ ] **Direct Hugging Face CDN Auto-Loader**: Enhancing `src/cache.ts` to automatically fetch community INT8 weights directly from HF Hub.
- [ ] **Chrome Extension Manifest v3 Boilerplate**: Ready-to-use Web Worker template with offscreen WebGPU support.
- [ ] **WebGPU FP16 Kernel Optimization**: Investigating 16-bit float shader speedups for Apple Silicon and Nvidia RTX.
- [ ] **Benchmarks & Perf Suite**: Comparative latency tables across M1/M2/M3, RTX 4090, Intel Iris, and mobile devices.

## Pull Request Guidelines
- Ensure all tests pass before submitting (`npm test`).
- Keep PRs focused and write clear commit messages.
- For new primitives or features, include accompanying unit tests.
