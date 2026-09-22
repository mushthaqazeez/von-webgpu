# Mentat — High-Speed Cognitive Browser Pilot 👁️⚡

> *"It is by will alone I set my mind in motion."*

Mentat is a universal Manifest V3 browser extension that brings sub-15ms voice and natural language motor control to any website, powered by System 1 ModernBERT decision inference.

---

## ⚡ How It Works

1. Press **`Alt + M`** (or click the microphone) on **any webpage** (GitHub, Stripe, Amazon, Twitter, etc.).
2. Speak or type your intent:
   - *"Click on repositories"*
   - *"Search for mechanical keyboards"*
   - *"Open billing and subscription settings"*
3. **The Mentat Cerebellum:**
   - Scans the visible DOM nodes at 60 FPS.
   - Evaluates and ranks candidates in **~14ms** via calibrated decision primitives (`resolveChoice`).
   - Draws a cybernetic target lock around the winner.
   - Dispatches realistic native mouse/keyboard motor events (scroll, focus, type, click).

---

## 🚀 How to Install & Test in Chrome / Edge / Brave

1. Open your browser and navigate to:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
2. In the top right corner, toggle on **"Developer mode"**.
3. Click **"Load unpacked"**.
4. Select the **`extension/`** folder from this repository (`d:\Yeshno\extension`).
5. Open any website (e.g. [github.com](https://github.com) or your favorite web app).
6. Press **`Alt + M`** to summon the Mentat HUD, speak into your mic or type a command, and watch it execute!

---

## ⌨️ Shortcuts & Controls

| Action | Shortcut |
| :--- | :--- |
| **Summon / Dismiss Mentat HUD** | `Alt + M` (or `Option + M` on Mac) |
| **Dismiss / Exit** | `Escape` |
| **Submit Command** | `Enter` |
| **Toggle Voice Recognition** | Click the Microphone icon in HUD |

---

## 🛡️ Architecture & Privacy
* **100% Client-Side:** Uses the local browser engine and built-in Web Speech API.
* **$0 Cloud Cost:** Zero external LLM calls or server dependencies.
* **100% Private:** Your screen, passwords, and clicks never leave your browser process.
