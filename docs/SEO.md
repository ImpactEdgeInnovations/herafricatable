# Search visibility

Her Africa Table indexes its public homepage, gathering calendar, published public event pages, questions and policies. Member rooms, Community content, ticket passes, applications, account pages and Admin tools remain outside search discovery. Search exclusion does not replace authentication or database permissions.

## What is implemented

- Page-specific titles, descriptions, canonical URLs and social previews.
- A branded 1200 × 630 sharing image at `/opengraph-image`.
- Organization and WebSite structured data on the homepage, plus breadcrumbs on publicly readable events. No invented ratings, member counts or reviews.
- `/sitemap.xml` includes published/completed public events only, using their real database update dates. It refreshes every five minutes; a provider failure leaves the core public pages available.
- `X-Robots-Tag` excludes private routes and all Vercel preview deployments.
- `robots.txt` excludes account workflows and private areas.
- Optional `GOOGLE_SITE_VERIFICATION` for Google Search Console.

## Owner actions after deployment

1. In Vercel Production, set `NEXT_PUBLIC_SITE_URL` to your chosen HTTPS production origin, for example `https://www.herafricatable.com`. Configure the other domain variant to redirect to that domain in Vercel. Do not put a path or a Vercel preview URL in this setting.
2. Add a Domain property for `herafricatable.com` in [Google Search Console](https://search.google.com/search-console). Google will provide the exact DNS TXT record; add that record at your domain provider. Alternatively, use a URL-prefix property and put its HTML verification token in `GOOGLE_SITE_VERIFICATION`, then redeploy.
3. Submit `https://www.herafricatable.com/sitemap.xml` (replace the origin if you chose the non-www domain).
4. Inspect the homepage and one genuinely published public event with Search Console URL Inspection. Check indexing, selected canonical and mobile performance. Validate structured data with [Google's Rich Results Test](https://search.google.com/test/rich-results).
5. Publish useful public gathering descriptions and real recaps with consented photographs. Do not copy private Community conversations into public marketing pages.
6. Track impressions, relevant searches and membership requests monthly. Technical SEO enables discovery but does not guarantee rankings or rich-result eligibility.

Run `npm run test:seo` for repository checks. Review the production HTML, `/robots.txt`, `/sitemap.xml` and social sharing preview after changing domains.

## Guidance used

[Google indexing controls](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) explain that crawlers must be allowed to fetch a page to read its noindex rule; robots exclusions alone are not privacy controls. [Google Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization) and [Next.js sharing-image conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) guide the public metadata implementation.
