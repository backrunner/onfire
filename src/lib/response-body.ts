const DEFAULT_JSON_LIMIT = 1024 * 1024;
const DEFAULT_TEXT_LIMIT = 16 * 1024;

async function readResponseBytes(
  response: Response,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error("Upstream response is too large");
    }
  }

  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Upstream response is too large");
        throw new Error("Upstream response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Read a small upstream error body without allowing unbounded allocation. */
export async function readResponseText(
  response: Response,
  maxBytes = DEFAULT_TEXT_LIMIT
): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, maxBytes));
}

/** Parse a bounded JSON response from an external provider. */
export async function readResponseJson<T>(
  response: Response,
  maxBytes = DEFAULT_JSON_LIMIT
): Promise<T> {
  const text = await readResponseText(response, maxBytes);
  return JSON.parse(text) as T;
}
