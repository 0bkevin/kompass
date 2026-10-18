# Navigation and mobile access

Scope: the existing application shell. The six main editorial destinations, supporting tools, company isolation and unsaved-change guards remain available.

Native browser inspection used an isolated, credential-free server on port 5513 and a clearly illustrative demo workspace. The signed-in Google account and real company workspace were untouched. This is an agent walkthrough, not a study with recruited users.

## Confirmed friction and changes

| User action                                                         | Before                                                                                     | After the change                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open the mobile menu and choose the current page                    | The drawer stayed over the content because its close effect depended on a pathname change. | Choosing any destination dismisses the drawer, including the current destination.                                                                      |
| Open the mobile menu and add a company                              | Two dialogs declared themselves modal at once.                                             | The menu closes before the company dialog opens.                                                                                                       |
| Open the menu and rotate or widen the viewport beyond 760px         | The mobile dialog state survived in the desktop layout.                                    | Switching to the desktop breakpoint clears the mobile state.                                                                                           |
| Read or navigate while the menu is open                             | The background remained scrollable and did not declare itself inert.                       | Body scrolling pauses; the working region and skip link are inert until the menu closes. Existing keyboard focus trapping and Escape dismissal remain. |
| Touch the menu controls                                             | The opening control measured 32 × 32 CSS pixels.                                           | Menu controls and mobile navigation targets have a minimum 44px touch area.                                                                            |
| Add or switch a company                                             | The shell mixed “marca” and “empresa.”                                                     | The shell consistently names the user’s company.                                                                                                       |
| Identify the current settings destination with assistive technology | Settings lacked the current-page attribute used elsewhere.                                 | “Fuentes y equipo” exposes `aria-current="page"` when selected.                                                                                        |

## Validation

- TypeScript compilation and scoped whitespace checks passed.
- Impeccable’s local detector completed: 47 existing findings in the shared stylesheet, including 45 advisories and two Google Sans warnings. Google Sans is the documented sign-in branding exception. No finding points to App.tsx or the added mobile styles. Unrelated established styles were preserved.
- Final native verification passed on the integrated production build at 390 × 844, 820 × 900 and 1280 × 900 CSS pixels. Document width matched viewport width in each inspected layout.
- Mobile opening moved focus to “Cerrar menú,” made the workspace and skip link inert, and set body overflow to hidden. Reverse Tab wrapped to the menu's last control. Current-page selection, a different page selection and Escape all dismissed the drawer, restored the background and returned focus to “Abrir menú.”
- Adding a company exposed exactly one modal dialog, with focus inside that company dialog. Widening an open drawer to 820px removed its dialog role and overlay, restored normal scrolling and hid the mobile close control.
- Desktop settings navigation exposed exactly one current destination, “Fuentes y equipo,” matching the breadcrumb. The final snapshot contained no browser console entries.
- [Structured observations](navigation.json) and [mobile navigation screenshot](evidence/mobile-navigation.png) record the final pass. The temporary server and browser tab were closed afterward.

Commit: `e692d5c`.
