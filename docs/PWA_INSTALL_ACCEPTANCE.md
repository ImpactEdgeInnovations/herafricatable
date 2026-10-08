# App installation — acceptance checklist

Updated: 8 October 2026. This is an install-promotion enhancement to the existing PWA, not a native App Store app. No database migration or new environment setting is required.

## Expected experience

- On the landing page, Home, Events, Communities or Members, wait 15 seconds without typing in a form. A small install invitation can appear.
- Chrome/Edge/Android browsers that provide a native install event show **Install app**. The browser decides eligibility; the site cannot force the native dialog to appear without a click.
- iPhone/iPad shows **Show me how** with Safari → Share → Add to Home Screen → Add instructions. Android fallback uses the browser menu. Desktop fallback explains the install menu/address bar and Safari's Add to Dock.
- **Not now** hides the invitation for seven days in that browser. The manual install action remains in account settings and on the landing page. If preference storage is blocked, the current invitation still closes.
- Do not show the invitation during sign-in, onboarding, chat, Host editing or inside an individual Community/event room. Do not interrupt a focused form field or open dialog.
- Opening the installed standalone app hides install promotion. A regular browser tab cannot reliably detect every app installed by every browser, especially on iOS.
- The existing service worker caches only the public offline shell/static assets, not private pages, API responses, conversations or event passes. Offline mode is an explanatory page, not offline access to member content.

## Evidence and tests

Automated tests verify platform detection including desktop-identifying iPads, pause duration/route exclusions, one-use native events, simultaneous clicks, decline/error outcomes, manifest/icons and private-cache boundaries. These are not real OS installation tests.

Live Chrome review on `54ebb4e` confirmed the 15-second invitation and a captured native install event (Install app label). Its phone-width rendering fit at 390px without page overflow. Not now dismissed the invitation; it stayed absent after navigation back, refresh and a subsequent wait longer than 15 seconds. Engineering did not click Install app or change OS installation settings. Phone-width Chrome is not iOS/Android emulation, so those device rows remain awaiting acceptance. The browser used for this review now has the ordinary seven-day reminder pause; its manual install actions remain available.

| Device/browser | Required test | Status |
| --- | --- | --- |
| Desktop Chrome/Edge | Native prompt → decline → no repeated event; install → launcher shortcut → authenticated app; sign out | Awaiting device acceptance |
| iPhone Safari | Instructions → Add to Home Screen → correct icon/name → standalone launch → OTP/sign out | Awaiting device acceptance |
| Android Chrome | Native or menu install → correct icon → standalone launch → OTP/sign out | Awaiting device acceptance |
| iPad / desktop Safari / unsupported browser | Accurate manual instructions; no false success message | Awaiting device acceptance |
| All | Not now survives refresh; no prompt in forms/rooms; keyboard focus and 320/390px fit | Automated logic passed; browser evidence recorded in the taskboard |

The native prompt may appear later or not at all due to browser eligibility or previous dismissal. Use the manual action to see guidance; do not bypass browser restrictions. Installing and changing browser settings on the owner's machine require their confirmation unless already specifically authorised.

Sources: [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
