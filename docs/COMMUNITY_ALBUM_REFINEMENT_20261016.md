# Community albums — implementation and acceptance

16 October 2026, Africa/Nairobi.

## What changed

- Albums have compact visual cards showing a cover, name, related meetup and visible-photo count. Missing or inaccessible cover images have a neutral fallback, not a broken image.
- The first approved, visible photo is the automatic cover. Hosts can choose **Use as album cover** beneath another approved photo, or return to **Use an automatic cover**. Pending, hidden, removed, safety-held, deleted-uploader and viewer-blocked photos cannot become a member's visible cover. A stored choice is re-evaluated on each read; deleting its photo clears the reference.
- An album initially loads 24 photo records. **Show more photos** requests the next cursor page, rather than fetching the entire album first. Refreshes retain the loaded window and cannot overwrite a newly expanded page with an earlier smaller result. The existing 100-photo album quota and 25-album Community limit remain unchanged.
- The viewer can request the next page at the end of its loaded photos. Existing swiping, arrow keys, captions, uploader names and protected image delivery remain. No automatic slideshow was added.
- **All albums** returns within the same page. Unsaved file selections require confirmation before they are cleared. Upload permissions, review, consent, quotas, retention, safety reporting and event/meetup linking are unchanged.

Supabase/Postgres skill guidance influenced the authenticated Host-only mutation, viewer-specific cover resolution, explicit private permissions and stable `(created_at,id)` pagination. The existing private image route still authorises both before and after retrieving a binary. No public bucket or permanent image URL was introduced.

## Evidence

| Level | Result |
| --- | --- |
| L1 — code and controlled execution | PASS: `verify-community-album-covers.mjs` executes actual pagination and cover handlers, duplicate locks, returned/thrown errors, saved-versus-refresh feedback, stale page refusal, larger-window refresh safety, cover-image fallback/recovery and carousel page-boundary behavior. Existing photo-read recovery tests now exercise the paged API. Full `npm test`, TypeScript and production build passed. |
| L2 — authoritative database | PASS: rollback-only test 066 used tagged Host/member accounts, 51 main-album photo records plus equal-time records in another album. Checked 24-row pages, uniqueness, equal-time cursors, saved/default/fallback covers, null automatic reset, pending/cross-album refusal, blocked/hidden/held/deleted/removed cover safety, ordinary-member/removed-member/suspended-Host denial and anonymous grants. All fixture changes rolled back. |
| L3 — actual browser/files/devices | OPEN: real binary upload/approval, cover selection and reload from separate browser accounts, physical mobile swipe, focus/Escape and populated visual review. SQL metadata fixtures and mocked UI handlers do not prove these. |

Migration `20261016113447_community_album_covers_and_paging.sql` is applied to the live project. No owner SQL action is needed. `supabase/tests/066_community_album_covers_and_paging.sql` is **a test, not a migration**. It uploads no files and sends no external messages. The first expanded-test connector attempt lost request state; cleanup was verified before a repeat returned PASS. Final readback showed zero fixture albums, the original archived fixture Community restored, and no anonymous paging or authenticated internal-resolver grant.

Security advisors flagged three deliberately authenticated security-definer APIs: paged album read, album list and cover save. Each retains active-membership/Host scope and an empty search path; anonymous execution is revoked. The internal cover resolver is not callable by authenticated members. Pre-existing unrelated advisory findings remain on the separate security track; this is not a claim of globally clean advisors.

## Tester checklist

Use an approved private test Community and clearly tagged disposable photos; do not use other members' personal photographs without permission.

1. Host opens Photos, chooses an album, then selects **Use as album cover** under an approved photo. Refresh both Host and ordinary-member views; the same authorised cover should remain.
2. Return to automatic. Hide/remove the chosen photo and check that another approved photo becomes the cover. A pending photo must have no usable cover-selection action.
3. Test a blocked uploader, removed member and paused Community. Member cards/files must respect the current access state, including after browser refresh.
4. Use more than 24 approved photos. Load additional pages, open the viewer near a boundary, and use Next/swipe. Check for duplicates, skipped photos, false totals or a stuck loading state.
5. Disconnect while loading another page or saving a cover. Controls should recover, a confirmed save must not be labelled a failed save, and changing albums must not allow a late response to replace the new selection.
6. At narrow mobile width and desktop, verify readable album cards, no horizontal page overflow, visible focus, Close/Escape, correct captions/uploader names and unchanged search/tab state.

No launch gate or production-readiness percentage is increased from these implementation checks alone. Admin phase 3 remains paused until the Product Owner resumes that track.

## Follow-up: Community banner upload

The Community cover image is separate from a photo album cover. The former required the original to be at least 1200 × 400 with a wide shape, rejecting ordinary portrait and smaller landscape images.

The form now prepares a real 1200 × 400 image locally before upload. Keep the whole image is the default: no cropping or stretching, with light space if needed. Fill the banner uses an explicitly selected centre crop. The processed image is previewed before Save look and feel; selecting or changing the fit does not upload anything. Existing private Storage, owner permissions and database validation remain unchanged. No migration is required.

Verification: actual preparation code exercised with controlled browser APIs for wide, portrait and small sources, explicit crop, invalid size/type, decoding/encoding failure, PNG fallback and temporary-URL cleanup. Actual selection handler tested for synchronous duplicate prevention, busy recovery and preserving a previous cover after replacement failure. These are L1 checks; the live database upload requirements were inspected, not replaced. Real-file Storage and browser acceptance are not claimed.

Tester check: choose your original image again after deployment; compare both fit choices, add a short description, save, refresh and confirm the cover remains. Repeat on mobile and check that important text/faces remain visible. Confirm changing the fit without Save does not change the saved Community.
