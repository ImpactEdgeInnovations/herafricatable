// Node-only image processing. Do not import this module from a client component.
import sharp from "sharp";

export const COMMUNITY_PHOTO_LIMITS = Object.freeze({
  sourceBytes: 8 * 1024 * 1024,
  sourcePixels: 24_000_000,
  originalBytes: 1024 * 1024,
  thumbnailBytes: 64 * 1024,
  maxDimension: 1920,
  thumbnailDimension: 480,
});

/** Decode and re-encode: extensions, browser MIME and EXIF are never trusted. */
export async function prepareCommunityPhoto(source) {
  if (!Buffer.isBuffer(source) || source.length === 0 || source.length > COMMUNITY_PHOTO_LIMITS.sourceBytes) {
    throw new Error("Choose a photo smaller than 8 MB.");
  }
  let metadata;
  try {
    metadata = await sharp(source, { limitInputPixels: COMMUNITY_PHOTO_LIMITS.sourcePixels, failOn: "warning" }).metadata();
  } catch {
    throw new Error("This photo could not be opened. Try a different JPG, PNG or WebP.");
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height) {
    throw new Error("Choose a still JPG, PNG or WebP photo.");
  }
  if (metadata.width * metadata.height > COMMUNITY_PHOTO_LIMITS.sourcePixels) {
    throw new Error("This photo is too large. Choose a smaller copy.");
  }
  async function encode(dimension, budget) {
    for (const quality of [82, 68, 52, 36]) {
      const result = await sharp(source, { limitInputPixels: COMMUNITY_PHOTO_LIMITS.sourcePixels, failOn: "warning" })
        .rotate() // Honour camera orientation before stripping all metadata.
        .resize(dimension, dimension, { fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
      if (result.data.length <= budget) return result;
    }
    throw new Error("This photo is still too heavy. Choose a smaller copy.");
  }
  try {
    const original = await encode(COMMUNITY_PHOTO_LIMITS.maxDimension, COMMUNITY_PHOTO_LIMITS.originalBytes);
    const thumbnail = await encode(COMMUNITY_PHOTO_LIMITS.thumbnailDimension, COMMUNITY_PHOTO_LIMITS.thumbnailBytes);
    return { original: original.data, thumbnail: thumbnail.data, contentType: "image/webp",
      width: original.info.width, height: original.info.height,
      storedBytes: original.data.length + thumbnail.data.length };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("This photo is still")) throw error;
    throw new Error("This photo could not be saved. Try a different photo.");
  }
}
