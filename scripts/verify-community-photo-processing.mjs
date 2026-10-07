import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { COMMUNITY_PHOTO_LIMITS as limits, prepareCommunityPhoto } from "../lib/community-photo-processing.mjs";

const jpeg = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#641d2e" } })
  .withExif({ IFD0: { Copyright: "Private test" }, IFD3: {
    GPSLatitudeRef: "N", GPSLatitude: "1/1 17/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "36/1 49/1 0/1",
  } }).jpeg().toBuffer();
assert((await sharp(jpeg).metadata()).exif, "Fixture must contain EXIF/GPS metadata");
const result = await prepareCommunityPhoto(jpeg);
for (const data of [result.original, result.thumbnail]) {
  const metadata = await sharp(data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.icc, undefined);
}
assert(result.original.length <= limits.originalBytes);
assert(result.thumbnail.length <= limits.thumbnailBytes);
assert.equal(result.storedBytes, result.original.length + result.thumbnail.length);
assert.equal(result.width, 120, "Do not enlarge small photos");
const rotated = await sharp({ create: { width: 120, height: 80, channels: 3, background: "white" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
const orientation = await prepareCommunityPhoto(rotated);
assert.equal(orientation.width, 80);
assert.equal(orientation.height, 120);
for (const format of ["png", "webp"]) {
  const input = await sharp({ create: { width: 48, height: 40, channels: 4, background: { r: 20, g: 30, b: 40, alpha: .5 } } }).toFormat(format).toBuffer();
  assert.equal((await sharp((await prepareCommunityPhoto(input)).original).metadata()).format, "webp");
}
await assert.rejects(() => prepareCommunityPhoto(Buffer.alloc(limits.sourceBytes + 1)), /smaller than 8 MB/);
await assert.rejects(() => prepareCommunityPhoto(Buffer.from("<html>not a photo</html>")), /could not be opened/);
await assert.rejects(() => prepareCommunityPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>')), /still JPG/);
await assert.rejects(() => prepareCommunityPhoto(jpeg.subarray(0, 100)), /could not/);
const large = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).jpeg().toBuffer();
await assert.rejects(() => prepareCommunityPhoto(large), /could not be opened|too large/);
const downsize = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "white" } }).jpeg().toBuffer();
const sized = await prepareCommunityPhoto(downsize);
assert.equal(sized.width, 1920);
assert.equal(sized.height, 960);
assert((await sharp(sized.thumbnail).metadata()).width <= 480);
const sql = readFileSync(new URL("../supabase/migrations/20261007150000_community_photo_album_foundation.sql", import.meta.url), "utf8");
assert(sql.includes("uploads_enabled boolean not null default false"));
assert(sql.includes("for update") && sql.includes("p_count::bigint*1114112"));
assert(sql.includes("from public,anon,authenticated"));
assert(sql.includes("date_trunc('day',now() at time zone 'Africa/Nairobi')"));
assert(!sql.includes("storage.buckets"), "Do not open unfinished binary uploads");
console.log("Photo processing passed: format validation, byte/pixel bounds, resizing, orientation, EXIF/GPS removal and thumbnail budgets. SQL source guards passed; upload UI is not shipped.");
