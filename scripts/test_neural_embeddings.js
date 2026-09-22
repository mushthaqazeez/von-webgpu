import { pipeline } from "@xenova/transformers";

async function testEmbeddings() {
  console.log("[*] Initializing local neural feature extraction pipeline (all-MiniLM-L6-v2)...");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const query = "dim the junk";
  const candidates = [
    "Vercel: 1 new project deployment on Vercel",
    "LinkedIn Job Alerts: Automation Engineer at Aptiv",
    "NaukriGulf: Top 15 jobs for you today",
    "Google: Security Alert - New sign-in to your account",
    "LessWrong: What the ozone hole teaches us about AI",
    "BSE ALERTS: Funds / Securities Balance",
    "Google: Google Verification Code 492019"
  ];

  console.log(`[*] Generating neural embedding for query: "${query}"...`);
  const queryEmbed = await extractor(query, { pooling: "mean", normalize: true });
  const qVec = Array.from(queryEmbed.data);

  console.log(`[*] Generating embeddings for ${candidates.length} candidates in batch...`);
  const candEmbeds = await extractor(candidates, { pooling: "mean", normalize: true });

  const dim = qVec.length;
  console.log(`[✓] Embeddings generated. Dimension: ${dim}`);

  // Calculate cosine similarity (already normalized, so dot product = cosine similarity)
  function dotProduct(a, b, offsetB = 0) {
    let sum = 0;
    for (let i = 0; i < dim; i++) {
      sum += a[i] * b[offsetB + i];
    }
    return sum;
  }

  const scores = candidates.map((cand, idx) => {
    const sim = dotProduct(qVec, candEmbeds.data, idx * dim);
    return { candidate: cand, similarity: Number(sim.toFixed(4)) };
  });

  scores.sort((a, b) => b.similarity - a.similarity);

  console.log("\n=======================================================");
  console.log(`Query: "${query}"`);
  console.log("Vector Semantic Distance Ranking (Zero Keywords!):");
  console.log("=======================================================");
  scores.forEach((s, i) => {
    console.log(`  [#${i + 1}] Similarity: ${s.similarity.toFixed(4)} | "${s.candidate}"`);
  });
}

testEmbeddings().catch(console.error);
