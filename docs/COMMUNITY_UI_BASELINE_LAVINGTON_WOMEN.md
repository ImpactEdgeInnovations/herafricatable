# Lavington Women — live Community UI baseline

Inspected 7 October 2026 with the Product Owner's permission, through their existing signed-in browser session. Desktop viewport: 1470 × 779 CSS pixels. Reference: https://www.herafricatable.com/communities/lavington-women

This was a read-only inspection. No content, invitations, joining rules, photo permissions, roles or publication settings were changed. Navigation and media-type selection only were exercised. The current session exposes Owner tools; this is not an ordinary-member permission rehearsal.

## Confirmed observations

| Area | Live observation | Required correction |
|---|---|---|
| Shared room navigation | Selected tab text is almost invisible: computed foreground `rgb(100, 23, 42)` on background `rgb(61, 40, 48)` | Accessible selected, hover, focus, busy and disabled states; retain restrained burgundy accents |
| Identity | Initials fallback appears; no Community image is displayed. Conversations view contains no rendered `img` elements. Name appears twice; count says “1 members” | Trace creation asset handoff, provide actual saved image, eliminate duplicate identity and fix singular/plural |
| Home | Primary Write a post action has unreadable text; navigation is repeated in cards beneath the tab bar | One clear, readable primary action and compact useful content rather than repeated navigation |
| Conversations | Body becomes substantially narrower than the shared header/tab bar. Posting form opens prominently before any conversation; numerous introductory labels and attachment guidance add weight | Shared room width and compact composer, with optional details revealed when needed |
| People | Two introductions repeat the same purpose. Large vertical gap precedes an oversized editorial heading and one card. Initials, not a photo, appear | One short heading and compact avatar-led cards. Verify whether this member actually supplied an avatar before classifying its absence as a loading defect |
| Gatherings | Three Host actions appear as small underlined links. Empty panel occupies only part of the room width; video access overlaps Media navigation | Consistent layout, clear create/link actions and predictable video/gathering context |
| Media | Videos and Photos switch in place and Photos transitions from “Opening albums…” to the loaded state. There are no videos or albums. Photos reports uploads paused and offers “Allow photos during the pilot” | Keep contextual album rules; clarify empty-state next step and Host controls. Permission was not enabled during this audit |
| About | Goes to a separate public layout with an oversized hero and repeated name, losing room navigation. “Open to members” conflicts with “A deliberately reviewed Community” | Brief accessible in-room About; derive joining copy from current policy; preserve public route for intentional sharing |
| Host workspace | Oversized “Lead with clarity and care” hero, fifteen area links, and many sections in the accessibility tree. Billing/upgrade material leads the free Community workflow | Compact “Manage Lavington Women” header; prioritise members, invitations, gatherings and branding; progressively disclose secondary/closed commerce tools |
| Host branding | Saved preview is text only; logo/cover descriptions are disabled and no saved image preview appears | Verify persisted application assets versus branding paths; do not solve missing media by making private buckets public |

## Verification limits

The room currently displays one member, zero gatherings, zero videos and zero albums. It is a useful visual baseline, but **not a populated production acceptance pass**. No post was sent, member joined, photo uploaded, email delivered or permission changed. Mobile, keyboard focus, two-account chat/replies, avatar delivery, videos, real files, blocking and suspension still require separate tests. Browser-visible absence does not establish the database root cause of the missing creation image.

## Implementation order

1. Complete the existing access/join-policy corrections (CINT-01/02).
2. Fix image handoff and shared contrast/room layout (CUI-01/02/03).
3. Make People compact and About inline; simplify Home and Host wording/actions (CUI-04/05).
4. Complete own-message removal, composer permissions and consent-based messaging (CINT-03/04/05).
5. Recheck this exact Community, then populate separate Host/member fixtures for desktop/mobile acceptance (CUI-06). Do not mark phases complete from screenshots or a successful build alone.
