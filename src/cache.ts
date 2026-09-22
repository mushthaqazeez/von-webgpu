// cache.ts - Edge & Browser CacheStorage Manager for Zero-Python ONNX Weights

export interface ModelLoadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export type ProgressCallback = (progress: ModelLoadProgress) => void;

const CACHE_NAME = "von-webgpu-models-v1";

/**
 * Checks if the runtime environment is browser/worker with CacheStorage support
 */
export function hasCacheStorage(): boolean {
  return typeof caches !== "undefined" && typeof caches.open === "function";
}

/**
 * Loads ONNX model weights from Hugging Face or custom CDN, caching to browser CacheStorage.
 * If running offline or cached previously, serves directly from CacheStorage without network.
 */
export async function loadModelWithCache(
  modelUrl: string,
  onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
  // If in browser/worker with CacheStorage:
  if (hasCacheStorage()) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(modelUrl);

      if (cachedResponse) {
        console.log(`[CacheStorage] HIT for ${modelUrl}`);
        return await cachedResponse.arrayBuffer();
      }

      console.log(`[CacheStorage] MISS for ${modelUrl}. Fetching over network...`);
      const response = await fetch(modelUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch model from ${modelUrl}: ${response.statusText}`);
      }

      // Track progress if Content-Length is available
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) {
        const buffer = await response.arrayBuffer();
        await cache.put(modelUrl, new Response(buffer.slice(0)));
        return buffer;
      }

      // Read stream with progress reporting
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          if (onProgress && total > 0) {
            onProgress({
              loaded,
              total,
              percent: Math.min(100, Math.round((loaded / total) * 100)),
            });
          }
        }
      }

      // Concat chunks into single ArrayBuffer
      const fullBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        fullBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Save to CacheStorage for instant offline subsequent loads
      const cacheCopy = new Response(fullBuffer.buffer);
      await cache.put(modelUrl, cacheCopy);
      console.log(`[CacheStorage] Cached ${modelUrl} (${(loaded / (1024 * 1024)).toFixed(1)} MB)`);

      return fullBuffer.buffer;
    } catch (err) {
      console.warn(`[CacheStorage] Cache handling error, falling back to direct fetch:`, err);
    }
  }

  // Direct fetch fallback (Node, Bun, or non-CacheStorage contexts)
  const directResponse = await fetch(modelUrl);
  if (!directResponse.ok) {
    throw new Error(`Failed to fetch model from ${modelUrl}: ${directResponse.statusText}`);
  }
  return await directResponse.arrayBuffer();
}

/**
 * Purge cached models from CacheStorage
 */
export async function clearModelCache(): Promise<boolean> {
  if (hasCacheStorage()) {
    return await caches.delete(CACHE_NAME);
  }
  return false;
}
