import { pipeline } from "@xenova/transformers";

async function main() {
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const concepts = [
    "spam, promotional marketing, newsletter, and job advertisements",
    "critical security alert, financial balance, verification code, and personal notice"
  ];

  const emails = [
    "LinkedIn Job Alerts: Automation Engineer at Aptiv",
    "Google: Security Alert - New sign-in to your account",
    "NaukriGulf: Top 15 jobs for you today",
    "Google Verification Code 492019",
    "LessWrong: What the ozone hole teaches us about AI",
    "BSE ALERTS: Funds / Securities Balance"
  ];

  const conceptEmbeds = await extractor(concepts, { pooling: "mean", normalize: true });
  const emailEmbeds = await extractor(emails, { pooling: "mean", normalize: true });

  const dim = 384;
  function dot(a, b, offA, offB) {
    let s = 0;
    for (let i = 0; i < dim; i++) s += a[offA + i] * b[offB + i];
    return s;
  }

  console.log("\n=======================================================");
  console.log("Dual-Concept Neural Vector Grounding (Zero Keywords!):");
  console.log("=======================================================");

  emails.forEach((email, i) => {
    const simSpam = dot(conceptEmbeds.data, emailEmbeds.data, 0, i * dim);
    const simCrit = dot(conceptEmbeds.data, emailEmbeds.data, dim, i * dim);
    const label = simSpam > simCrit ? "SPAM/PROMO" : "IMPORTANT";
    console.log(`[${label.padEnd(10)}] (Spam: ${simSpam.toFixed(3)} | Important: ${simCrit.toFixed(3)}) -> "${email}"`);
  });
}

main().catch(console.error);
