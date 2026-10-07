export const COMMUNITY_PHOTO_LIMITS: Readonly<{ sourceBytes: number; sourcePixels: number; originalBytes: number; thumbnailBytes: number; maxDimension: number; thumbnailDimension: number }>;
export function prepareCommunityPhoto(source: Buffer): Promise<{ original: Buffer; thumbnail: Buffer; contentType: string; width: number; height: number; storedBytes: number }>;
