import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const output = new URL("../public/icons/", import.meta.url);
const favicon = new URL("../app/icon.svg", import.meta.url);

await mkdir(output, { recursive: true });

await Promise.all([
  sharp(fileURLToPath(favicon)).resize(192, 192).png().toFile(fileURLToPath(new URL("her-africa-table-192.png", output))),
  sharp(fileURLToPath(favicon)).resize(512, 512).png().toFile(fileURLToPath(new URL("her-africa-table-512.png", output))),
]);

function adaptiveIcon(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
      <rect width="512" height="512" fill="#5f1722"/>
      <circle cx="256" cy="256" r="172" fill="#5f1722" stroke="#d8ad67" stroke-width="12"/>
      <path d="M158 154h74v20h-14v62h76v-62h-14v-20h74v20h-14v164h14v20h-74v-20h14v-60h-76v60h14v20h-74v-20h14V174h-14z" fill="#fffaf0"/>
      <circle cx="359" cy="145" r="15" fill="#d8ad67"/>
    </svg>
  `);
}

await Promise.all([
  sharp(adaptiveIcon(512)).png().toFile(fileURLToPath(new URL("her-africa-table-maskable-512.png", output))),
  sharp(adaptiveIcon(180)).resize(180, 180).png().toFile(fileURLToPath(new URL("apple-touch-icon.png", output))),
]);

console.log("Generated Her Africa Table PWA icons.");
