// Bound streamed requests even when Content-Length is missing or inaccurate.
export const communityPhotoRequestLimit = 4 * 1024 * 1024;
export async function readCommunityPhotoBody(body, maximum = communityPhotoRequestLimit) {
  if (!body) throw new Error("Choose a photo.");
  const reader = body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new Error("Choose a photo smaller than 4 MB.");
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
