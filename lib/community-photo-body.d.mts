export const communityPhotoRequestLimit: number;
export function readCommunityPhotoBody(body: ReadableStream<Uint8Array> | null, maximum?: number): Promise<Buffer>;
