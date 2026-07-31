import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function filesUnder(path) {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry);
    return statSync(child).isDirectory()
      ? filesUnder(relative(root, child))
      : [relative(root, child)];
  });
}

const layout = read("app/layout.tsx");
for (const contract of [
  'className="skip-link"',
  'href="#hat-page-content"',
  'id="hat-page-content"',
  "tabIndex={-1}",
]) {
  assert(
    layout.includes(contract),
    `The global keyboard bypass must include ${contract}`,
  );
}

const css = read("app/globals.css");
for (const contract of [
  ".skip-link:focus",
  ":focus-visible",
  "outline: 3px solid",
  "@media (prefers-reduced-motion: reduce)",
  "@media (forced-colors: active)",
  ".community-conversation-filters button",
  ".community-post-actions button",
  "min-height: 44px",
  ".member-mobile-dock a",
  ".admin-mobile-dock a",
]) {
  assert(
    css.includes(contract),
    `The shared accessibility layer must include ${contract}`,
  );
}

const interactiveFiles = [
  ...filesUnder("app"),
  ...filesUnder("components"),
].filter((path) => path.endsWith(".tsx"));

for (const path of interactiveFiles) {
  const content = read(path);
  assert(
    !/\btabIndex\s*=\s*(?:\{\s*)?[1-9]/i.test(content),
    `${path} must not reorder the natural keyboard sequence`,
  );

  for (const image of content.matchAll(/<img\b[\s\S]*?>/g)) {
    assert(
      /\balt\s*=/.test(image[0]),
      `${path} has an image without an alt decision`,
    );
  }

  for (const frame of content.matchAll(/<iframe\b[\s\S]*?>/g)) {
    assert(
      /\btitle\s*=/.test(frame[0]),
      `${path} has an iframe without an accessible title`,
    );
  }
}

const memberHeader = read("components/member/member-header.tsx");
for (const contract of [
  'aria-label="Member navigation"',
  'aria-label="Member shortcuts"',
  "aria-current=",
]) {
  assert(
    memberHeader.includes(contract),
    `The member shell must include ${contract}`,
  );
}

const adminHeader = read("components/admin/admin-header.tsx");
for (const contract of [
  'aria-label="Admin navigation"',
  'aria-label="Admin shortcuts"',
  "aria-current=",
]) {
  assert(
    adminHeader.includes(contract),
    `The Admin shell must include ${contract}`,
  );
}

const communityPage = read("app/communities/[slug]/page.tsx");
for (const contract of [
  'aria-label="Community areas"',
  'aria-current="page"',
  'href="#conversations"',
  'href="#members"',
]) {
  assert(
    communityPage.includes(contract),
    `The Community room must include ${contract}`,
  );
}

const communityFeed = read("components/member/community-feed.tsx");
for (const contract of [
  'aria-labelledby="community-conversations-title"',
  'id="conversations"',
  'aria-label="Find and filter conversations"',
  'aria-label="Conversation views"',
  'aria-label="Community conversations"',
  'aria-live="polite"',
  "aria-pressed=",
  "dateTime={post.created_at}",
  "tabIndex={-1}",
  'role="status"',
]) {
  assert(
    communityFeed.includes(contract),
    `Community conversations must include ${contract}`,
  );
}

const communityRoster = read(
  "components/member/community-member-roster.tsx",
);
for (const contract of [
  'aria-labelledby="community-members-title"',
  'id="members"',
]) {
  assert(
    communityRoster.includes(contract),
    `The Community member roster must include ${contract}`,
  );
}

console.log(
  `Accessibility contracts passed across ${interactiveFiles.length} interface files.`,
);
