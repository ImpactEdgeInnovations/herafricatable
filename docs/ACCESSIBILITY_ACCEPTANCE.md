# Accessibility and non-technical-user acceptance

This is the human release gate for Her Africa Table. Automated checks prevent
known structural regressions, but they do not certify that a real person can use
the platform comfortably.

## Before each acceptance session

1. Test the exact Vercel Preview commit intended for release.
2. Use a non-Admin member account with realistic but non-sensitive sample data.
3. Run `npm run test:accessibility` and record the commit SHA below.
4. Do not coach the participant unless she is unable to recover. Record the
   words or controls that caused uncertainty.

## Core member journey

- Sign in with email OTP.
- Understand the recommended next step on Member Home.
- Open Community, identify who can see a post, and publish an Ask or Offer.
- Find a relevant member, request a connection, and understand why private
  contact details are not immediately visible.
- Open an event, understand its date, location and registration state.
- Locate Activity, support and privacy controls without assistance.

## Core Admin journey

- Identify what needs attention on Today.
- Review a member application and explain the consequence before confirming it.
- Find an event and change a safe draft field.
- Open Safety and explain what evidence is visible.
- Find the Community release gate and identify a failed readiness check.
- Return to the member view.

## Assistive and responsive pass

| Check | Required result |
| --- | --- |
| Keyboard only | Skip link appears; focus is always visible; order matches the page; dialogs return focus |
| VoiceOver + Safari | Landmarks and headings describe the page; controls have useful names; status changes are announced |
| 200% browser zoom | No horizontal page scroll at 1280 px; content and actions remain available |
| iPhone Safari | No clipped text; primary targets are at least 44 px; bottom navigation does not cover content |
| Android Chrome | Same as iPhone, including keyboard-open form behavior |
| Reduced motion | No required meaning depends on animation |
| Increased contrast | Focus, selection, errors and disabled states remain distinguishable |

## Evidence record

- Commit:
- Preview URL:
- Date:
- Facilitator:
- Participant/device:
- Member journey: Pass / Blocked
- Admin journey: Pass / Blocked
- Keyboard: Pass / Blocked
- Screen reader: Pass / Blocked
- 200% zoom: Pass / Blocked
- Mobile: Pass / Blocked
- Notes and exact point of confusion:
- Follow-up owner and due date:

A result is a release blocker when the participant cannot recover, cannot
understand the consequence of an action, cannot reach a control, or could expose
private information unintentionally.
