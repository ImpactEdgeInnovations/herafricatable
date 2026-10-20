# Green design: everyday-use refinements

## Delivered

- Separate Community Invitations section, beside People and Meetups. Forms remain mounted when switching sections, so unfinished text is retained. Existing role checks and confirmation dialogs are unchanged.
- Shared horizontal tab controls: labelled previous/more buttons appear only when there are hidden sections. The selected section aligns inside the strip without scrolling the page. Used for Community navigation and Host sections.
- Clear result messages for invitations, event updates/posters, Community member decisions, profile changes and account choices. Success/error/notice is selected from the actual operation result, not inferred from a message's wording. Messages do not disappear on a timer.
- Long-page profile, account and Community Host feedback stays visible above the mobile navigation and can be dismissed. In-page invitations include a link to recent delivery status.
- Saved invitations, provider-accepted emails and pending review remain distinct. A queued or uncertain email is not called delivered.
- Profile, privacy settings, Messages and event forms inherit the restrained green layout, readable labels and compact headings. Existing Host-selected accents and all consent/access rules remain unchanged.
- Empty conversations invite a simple hello. Empty meetups distinguish a Host who can plan one from a member waiting for a schedule. Read-only and failed-load states remain separate.

No database migration, new permission, email template or environment variable is required.

## Verification

1. Code/render: `npm run test:ux-followthrough` exercises actual feedback state/rendering and tab scrolling/edge controls. Existing Host/invitation tests include six retained areas, cancellation, partial failures and permission boundaries.
2. Integration: no service signatures changed; the original RPCs, scoped delivery endpoint and route checks remain connected. Local build and type checking are required before push.
3. Live acceptance: inspect real signed-in Community/Host tabs, Profile, Account and Messages on desktop and 390px mobile after deployment. Do not send real invitations or alter real memberships just to demonstrate a cosmetic change.

Physical iOS/Android usability testing with non-technical members remains a separate acceptance activity. This update does not imply every platform workflow has been re-tested end to end.

## Acceptance recorded

- Full `npm test`, TypeScript and production build passed. Targeted Community room, wording and green-design checks passed. Earlier source assertions were updated to follow the shared tab component and new plain-language labels; role, consent and delivery tests remain in place.
- `3c836eb` was pushed to `main` and Vercel reported a successful deployment.
- Live signed-in Host workspace: six sections rendered; People, Invitations and Settings switched successfully. An unsent `example.invalid` invitation draft remained visible after switching sections and was then cleared. No invitation was sent.
- Live delivery status refresh reached the existing service and displayed the new honest, in-page notice. Provider acceptance was not relabelled as inbox delivery.
- At 390px, Host/Community arrow controls scrolled their strips successfully; Host Settings remained selectable and there was no horizontal page overflow.
- Live Profile, Account/privacy and Messages loaded correctly at 390px without horizontal overflow. No profile, privacy setting, membership or conversation was changed during these checks.
- Final visual correction: empty Messages no longer reserves a full-height blank container, and profile completion uses the shared green styling.
