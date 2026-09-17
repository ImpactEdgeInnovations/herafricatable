import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = ts.transpileModule(read("lib/seo.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const seo = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const previousUrl = process.env.NEXT_PUBLIC_SITE_URL;
try {
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.herafricatable.com/path?tracking=yes";
  assert.equal(seo.getSiteUrl(), "https://www.herafricatable.com");
  const metadata = seo.publicPageMetadata("Gatherings", "Published public events", "/events");
  assert.equal(metadata.alternates.canonical, "https://www.herafricatable.com/events");
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.openGraph.images[0].width, 1200);
  process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";
  assert.equal(seo.getSiteUrl(), "https://www.herafricatable.com");
  const hostile = { name: "</script><script>alert(1)</script>" };
  assert(!seo.serializeJsonLd(hostile).includes("<"));
  assert.deepEqual(JSON.parse(seo.serializeJsonLd(hostile)), hostile);
} finally {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousUrl;
}

const publicEvents = read("lib/public-event-seo.ts");
assert(publicEvents.includes('audience: "eq.public"'));
assert(publicEvents.includes('status: "in.(published,completed)"'));
assert(!publicEvents.includes("SUPABASE_SECRET_KEY"));
assert(!publicEvents.includes("cookies("));
const sitemap = read("app/sitemap.ts");
assert(sitemap.includes("getPublicEventSeo()"));
assert(!sitemap.includes("const lastModified = new Date()"));
assert(!sitemap.includes("/members/") && !sitemap.includes("/communities/"));
const config = read("next.config.ts");
for (const route of ["admin", "auth", "home", "join", "members", "orders", "sign-in", "communities"]) {
  assert(config.includes(`"${route}"`), `${route} needs an indexing exclusion`);
}
assert(config.includes('key: "X-Robots-Tag"'));
assert(config.includes('process.env.VERCEL_ENV === "preview"'));
for (const page of ["app/page.tsx", "app/events/page.tsx", "app/events/past/page.tsx", "app/faq/page.tsx", "app/privacy/page.tsx", "app/terms/page.tsx", "app/community-guidelines/page.tsx"]) {
  assert(read(page).includes("publicPageMetadata("), `${page} needs page-specific metadata`);
}
assert(read("app/events/[slug]/page.tsx").includes("getPublicEventSeo(slug)"));
assert(read("app/page.tsx").includes('"@type": "Organization"'));
assert(read("app/opengraph-image.tsx").includes("ImageResponse"));
console.log("SEO contracts passed: canonical URLs, public-only event discovery, safe structured data, sharing images and private/preview indexing exclusions.");
