# Community Host actions — 7 October 2026

This pass separates source wiring, real database acceptance and device/inbox acceptance. A visible button is not a passed production test.

| Host action | Actual connection | Evidence / remaining check |
|---|---|---|
| Save/open a scheduled gathering | `save_community_event_proposal`, `publish_community_gathering` | Rollback test 043 passed one-hour online publication, text-only/no meeting URL, duplicate retry and negative timing/access cases |
| Add video to a gathering | `save_community_gathering_video_experience` | 043 passed an actual video record linked to the created room; real playback remains separate |
| Add photos to a gathering | `create_community_photo_album`, existing reservation/upload/finalisation pipeline | 043 passed album context; new same-page album form preselects and locks the gathering. Real binary upload and moderation remain open |
| Link an available event | `list_community_programming_options`, `set_community_event_link` | 043 passed persisted link/read-back; dropdown and linked status replace the long multi-card list. Unlink remains a real existing RPC, not a local-only toggle |
| Invite a new visitor by email | Existing `DestinationInvitationPanel` and delivery route | Existing in-app/Resend workflow retained; no live invitation sent in this pass. Inbox receipt remains unaccepted |
| Invite an existing member/moderator | `invite_community_member` | Existing server path retained, tucked under Join requests to avoid two competing primary invitation forms |
| Approve, decline, promote, demote, remove | `review_community_membership` | Source wired and existing contracts retained; destructive removal still asks for confirmation. Separate-role production rehearsal remains open |
| Joining choice | Existing joining-settings RPC | Owner check and authoritative settings unchanged; in-room About now reads these settings instead of guessing |
| Logo/cover, public page | Existing branding/public-profile save RPCs | Forms remain mounted inside expandable tools so drafts are preserved. Lavington application's submitted image handoff remains open |
| Writing help / reminders | Existing Nia Host and introduction-reminder RPCs | Kept inside secondary tools; not represented as messages sent automatically |
| Plans/payments/statements | Existing gated commerce and statement components | Closed commerce stays unavailable, clearly labelled, not presented as a working payment promise |

Added catch/finally recovery around the legacy invitation, member review, link and reminder actions so an unexpected network rejection cannot leave their controls permanently busy. Gatherings also retain the confirmed draft if publication fails. A saved gathering is not reported as failed merely because its optional video could not be attached.

Deployed owner walkthrough confirmed the two-step wizard, online default, optional call link, video/photo choices and existing-event dropdown. It exposed a React button-reuse issue: advancing could inherit submit behavior. Continue now cancels the click default and uses a distinct button key. Joining controls are folded under “Who can join?” so they do not dominate the initial Host view. No real gathering or invitation was published during the visual check.

## Open release checks

- Populated mobile/desktop, keyboard and ordinary-member/Host/Admin walkthroughs.
- Actual YouTube playback, photo files, safe removal, permission changes and email delivery.
- Application-image → branding: explicit owner reuse is implemented in Look & feel. It downloads only her own current, non-rejected private image, prepares a bounded square preview locally and saves through the existing branding permission checks only after Save. Real saved-image delivery/directory acceptance remains open.
- Broader SECURITY DEFINER anonymous-grant allowlist audit: this pass restricts gathering save/publish only, not every function discovered by advisors.
- Existing CINT-01/02 access/joining corrections and own-message removal remain on the main Community taskboard; this UI pass does not mark them done.
