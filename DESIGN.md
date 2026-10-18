---
name: kompass
description: A charcoal and lavender editorial workspace for content teams.
colors:
  accent: "#bea5f5"
  accent-ink: "#211337"
  accent-hover: "#cfb9ff"
  accent-soft: "#282132"
  bg: "#0c0c10"
  surface: "#131318"
  surface-raised: "#191820"
  surface-hover: "#211e2a"
  border: "#2c2b35"
  text: "#f3f1f7"
  muted: "#aaa7b7"
  navigation: "#101015"
  focus: "#d7c2ff"
  positive: "#9bdbbf"
  positive-bg: "#142820"
  warning: "#e9c580"
  warning-bg: "#2b2418"
  negative: "#f1a5af"
  negative-bg: "#301d24"
  landing-raised: "#1b1a22"
  landing-secondary: "#19181f"
  landing-secondary-text: "#e1dce9"
  landing-control-hover: "#28232f"
  landing-status: "#392c4b"
  landing-status-text: "#d8baf9"
typography:
  headline:
    fontFamily: Hedvig Letters Serif, Georgia, serif
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.17
    letterSpacing: -0.03em
  journey-headline:
    fontFamily: Hedvig Letters Serif, Georgia, serif
    fontSize: 38px
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: -0.03em
  auth-promise:
    fontFamily: Hedvig Letters Serif, Georgia, serif
    fontSize: 60px
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: -0.035em
  headline-operational:
    fontFamily: Geist, sans-serif
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.03em
  title:
    fontFamily: Geist, sans-serif
    fontSize: 18px
    fontWeight: 550
    lineHeight: 1.45
    letterSpacing: -0.02em
  subtitle:
    fontFamily: Geist, sans-serif
    fontSize: 15px
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: -0.01em
  body:
    fontFamily: Geist, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Geist, sans-serif
    fontSize: 13px
    fontWeight: 500
  button:
    fontFamily: Geist, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  badge:
    fontFamily: Geist, sans-serif
    fontSize: 11px
    fontWeight: 450
  landing-display:
    fontFamily: Hedvig Letters Serif, Georgia, serif
    fontSize: clamp(44px, 5.35vw, 76px)
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: -0.035em
  landing-headline:
    fontFamily: Hedvig Letters Serif, Georgia, serif
    fontSize: 43px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: -0.03em
  landing-title:
    fontFamily: Geist, sans-serif
    fontSize: 30px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.035em
  landing-example-title:
    fontFamily: Geist, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.025em
  landing-body:
    fontFamily: Geist, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  landing-button:
    fontFamily: Geist, sans-serif
    fontSize: 14px
    fontWeight: 550
    lineHeight: 1.4
rounded:
  badge: 5px
  control: 8px
  card: 12px
  callout: 10px
  dialog: 16px
  icon: 7px
  landing-control: 7px
  landing-status: 4px
spacing:
  tight: 8px
  control: 12px
  standard: 16px
  form: 20px
  section: 24px
  panel: 28px
  spacious: 36px
  workspace: 40px
  wide: 48px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 15px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 15px
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 15px
  button-ghost-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
  button-danger:
    backgroundColor: "{colors.negative-bg}"
    textColor: "{colors.negative}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 15px
  field-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: 11px 13px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "#e0d1fb"
    rounded: "{rounded.control}"
    padding: 10px 12px
  status-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: 4px 7px
  landing-button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.landing-button}"
    rounded: "{rounded.landing-control}"
    padding: 12px 22px
  landing-button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  landing-button-secondary:
    backgroundColor: "{colors.landing-secondary}"
    textColor: "{colors.landing-secondary-text}"
    typography: "{typography.landing-button}"
    rounded: "{rounded.landing-control}"
    padding: 12px 22px
  landing-button-secondary-hover:
    backgroundColor: "{colors.landing-control-hover}"
  landing-status:
    backgroundColor: "{colors.landing-status}"
    textColor: "{colors.landing-status-text}"
    rounded: "{rounded.landing-status}"
    padding: 2px 7px
---

# Design System: kompass

## Overview

**Creative North Star: "The Editorial Thread"**

kompass connects an audience need with evidence, an editorial decision and the piece the team will review. Ink-black grounds, charcoal working surfaces, cool-violet dividers and pale lavender actions carry one identity across the public landing, account entry, onboarding, authenticated workspace and public community forms. The approved full-application redesign supersedes the former landing-only boundary.

Hedvig Letters Serif gives page titles and the account promise their editorial voice. Geist keeps navigation, controls, reading, operational headings and data precise. Working screens use the structure each task needs: divided records, source context, editing panes and a calendar. The landing keeps its spacious composition and native geometric illustration; that composition does not become a template for every working screen.

This records the finished implementation in `src/workspace.css`, `src/styles.css`, feature stylesheets, `src/landing.css` and shared components. Global workspace tokens are authoritative for shared controls; landing-specific tokens retain their observed local values. The shared colors and fonts express one brand. Sidecar tonal ramps visualize color relationships in the design panel; they are not additional interface tokens.

**Key Characteristics:**

- One charcoal and lavender identity across public and authenticated surfaces.
- Editorial serif page titles paired with Geist operational text and controls.
- Flat working surfaces, fine dividers and task-specific layouts.
- A native four-module mark and restrained connected workflow stages.
- Explicit keyboard focus, responsive working panes and reduced spatial motion.

## Colors

Pale lavender supplies action and orientation against cool charcoal; muted white carries supporting text without introducing a second brand palette. Frontmatter values are normative.

### Primary

- **Lavender Action** (`accent`) fills primary actions, active setup steps and the four-module mark. **Lavender Hover** lightens enabled actions; **Purple Ink** supplies their dark lettering.
- **Lavender Wash** (`accent-soft`) identifies active navigation and quiet contextual emphasis.
- **Lavender Focus** (`focus`) supplies the global keyboard outline. Journey and company setup surfaces use the action color for their local outlines.

### Neutral

- **Ink Ground** (`bg`) surrounds every surface. **Navigation Charcoal** (`navigation`) anchors the rail and account story.
- **Working Charcoal** (`surface`) carries forms, cards and editing regions. **Raised Charcoal** (`surface-raised`) carries secondary controls and contextual containers; **Hover Charcoal** supplies control feedback.
- **Cool Divider** (`border`) separates working regions, fields and navigation. **Reading White** (`text`) and **Muted Lavender Grey** (`muted`) form the primary and supporting text pair.
- The landing retains **Landing Raised**, **Landing Secondary**, **Landing Secondary Text** and **Landing Control Hover** where its source uses distinct values. **Landing Status** and its text color belong to illustrated editorial workflow states.

Semantic status pairs are functional: **Positive** identifies actual success or readiness, **Warning** identifies caution or incomplete work, and **Negative** identifies errors or destructive actions. Each has a matching dark background. These are status colors, not alternate brand actions. Actual company colors and previously stored creative assets remain customer content; they do not recolor the interface. The official Google sign-in control preserves its white provider treatment.

**The One Brand Rule.** Use charcoal and lavender throughout the product. The global `--green` name is a compatibility alias for `--accent`, not a separate green palette.

**The Status Meaning Rule.** Reserve semantic green, amber and red for the condition or consequence they describe.

## Typography

**Display Font:** Hedvig Letters Serif, with Georgia and serif fallbacks.
**Body Font:** Geist, with sans-serif fallback.

**Character:** a quiet editorial title gives each task a clear opening; compact sans-serif hierarchy supports sustained reading and decisive controls. Both families are locally served from `public/fonts/landing/`. The locally served Google Sans medium face is confined to the official Google sign-in control.

### Hierarchy

- **Headline:** the serif `headline` role leads standard pages. Journey and editor titles use their observed compact variant; public community titles also use the serif. Workspace titles reduce to (34px) at (760px) and (31px) at (420px); journey titles have their own (34px) and (30px) steps. Do not force a single title size across distinct working layouts.
- **Account Promise:** the serif `auth-promise` role occupies the story panel, reducing through (50px), (43px) and (36px) as that layout contracts.
- **Operational Headline:** the sans-serif `headline-operational` role leads company setup stages. Account form headings use Geist at (27px), reducing to (25px).
- **Title / Subtitle:** Geist supplies H2, H3, record titles, dialog titles and operational summaries. The frontmatter records the shared H2 and H3 roles; larger record and dialog headings use observed local (19–20px) sizes.
- **Body:** Geist supplies working text. Supporting descriptions commonly use line-height (1.7–1.8); prose is capped around (65–72ch) where the task calls for sustained reading. Field hints and metadata use (11–12px).
- **Label / Button / Badge:** medium Geist distinguishes controls and field labels without uppercase decoration. Small status text remains a functional label. Numeric counts and calendar figures use tabular numerals where the source declares them.
- **Landing Display / Headline:** the landing uses its larger serif promise and section hierarchy. The hero reduces through `clamp(40px, 6.5vw, 59px)` at (800px), `clamp(35px, 8.2vw, 49px)` at (600px), and (32px) at (360px). Major section headings reduce to (36px) on smaller screens.
- **Landing Title / Example Title / Body / Button:** Geist carries feature headings, the interactive example, prose and actions. The body role is the wrapper baseline; paragraphs use line-height (1.65), with smaller task-specific example and feature prose.

**The Editorial Hierarchy Rule.** Give page titles and the account promise the serif voice; keep operational H2/H3, navigation, forms and data in Geist. The landing retains its established serif section headings.

## Layout

The desktop workspace uses a fixed navigation rail (240px), a sticky contextual toolbar (64px) and a main working region capped at (1520px). Content has desktop padding (38px 40px 48px); toolbar and footer share its horizontal alignment. At (1200px) the working gutters reduce to (28px). At (760px) they become (20px), and at (420px) they become (16px). The toolbar wraps and search takes its own full-width row on smaller screens.

At (980px) and below, navigation becomes a drawer (280px) over a dark scrim. The drawer opens as a labeled modal region, locks body scrolling, focuses its first control, traps Tab, closes with Escape or the scrim, and returns focus to its trigger. The covered main region and skip link become inert while it is open. Resizing to desktop closes the drawer.

Working layouts preserve their own density. Journey pages use open divided stages and contextual evidence beside the next action. The editor stacks its panes at (1150px); draft lists reduce from three columns to two at (1400px) and then to one on small screens. The calendar has a local horizontal scrolling grid with an explicit scroll hint; its sidebar moves below the board at (1500px). Forms wrap or stack without compressing their inputs. Auth moves from a story/form split to one column at (760px), retaining a compact promise above the form. Onboarding is centered in a panel capped at (760px); public community forms are capped at (680px).

The landing centers content at a maximum (1120px), with desktop gutters (48px), reducing to (32px) at (1100px), (20px) at (600px) and (16px) at (360px). Its header is (64px), then (60px) at (800px) and (56px) at (600px); central links collapse while account entry stays available. Feature rows use open columns and thin dividers; illustrations and example panes stack at their local responsive breakpoints.

Use the spacing steps in frontmatter for shared rhythm. Existing compact records, larger editorial sections and specialized two-column forms retain their observed local measurements rather than being forced into a uniform card grid.

## Elevation & Depth

Working surfaces are flat at rest: the shared card, button and onboarding panel have no shadow. Fine borders and changes from ink ground to working or raised charcoal separate regions. The modal and toast use soft black shadows to distinguish an overlay from the working canvas. The landing's native SVG aperture supplies its own geometric depth without a raster background or fake material.

### Shadow Vocabulary

- **Dialog:** `0 24px 80px #0009` separates a modal from its black translucent scrim.
- **Toast:** `0 12px 36px #0005` lifts brief feedback over the workspace.

**The Flat Working Surface Rule.** Use tonal layers and fine dividers for ordinary work; reserve the shared soft shadows for modal and toast overlays.

## Shapes

Controls use softly squared corners, while panels and dialogs use progressively roomier rounding. Frontmatter records the observed radii for badges, controls, cards, callouts and dialogs; mobile dialogs reduce to (14px). Borders are generally a single cool-violet pixel. Compact icons and landing actions retain their smaller corner treatment.

The shared kompass mark is native SVG: four square modules with softly rounded corners, two filled and two outlined, connected diagonally. It appears beside the lowercase name in the landing, account entry, workspace and public forms. Use the shared geometry and current color. Line icons provide interface meaning; existing customer imagery remains content. Newly seeded example artwork carries the charcoal/lavender identity while previously stored assets retain their original appearance.

## Components

### Buttons

Compact, clear actions with one strong lavender emphasis.

- **Primary / Secondary / Ghost / Danger:** use the frontmatter assignments and shared control radius. Standard workspace actions have minimum height (42px), journey actions (40px); icon controls are (36px) square. Primary text is dark purple on lavender. Secondary controls use raised charcoal and a fine border; ghost controls reveal that surface on hover; destructive actions use the negative pair.
- **Hover / Press:** enabled hover styles are gated by `(hover: hover) and (pointer: fine)`. Color feedback takes (150ms). Workspace press feedback scales to (0.98) only when enabled and outside keyboard focus. Disabled buttons reduce opacity to (0.48), show a not-allowed cursor and suppress the transform; busy shared buttons are disabled and show a loading icon.
- **Focus:** the global visible outline is (2px) with offset (4px); fields use (2px) offset. Journey and setup outlines use local offsets (3px). Keyboard-focused actions remove transitional spatial feedback so the focus target stays still.
- **Landing actions:** larger actions have minimum height (48px), with a (40px) compact header variant. Fine-pointer hover shifts the arrow slightly; press feedback scales to (0.97). A disabled landing action uses opacity (0.65) and a wait cursor.
- **Provider exception:** the Google sign-in button uses its official white background, dark text, small corners (4px), Google Sans medium and provider artwork. Preserve this provider identity within the charcoal account form.

### Chips

Small state labels, without decorative pill styling.

- **Status:** compact rounded rectangles use the badge role and frontmatter spacing. Neutral labels use raised charcoal; green, amber and red variants use their semantic foreground/background pairs. Landing illustration states retain their local purple status pair.
- **Meaning:** label the actual workflow condition or provenance. A status badge is passive; filter and tab controls retain button semantics and visible selected state.

### Cards / Containers

Flat, softly squared working surfaces.

- **Style:** working charcoal, a cool single-pixel border and the card radius. Piece cards commonly use padding (24px); larger setup and onboarding panels use roomier padding. Divided lists remain open where the task uses rows.
- **Empty states:** an accent-colored icon sits in a quiet lavender square beside clear explanatory text and a next action. Empty regions preserve the shared card treatment; supporting copy remains muted.
- **Dialogs / Toasts:** the modal is capped at (640px), with a wide variant (1080px), and scrolls within the viewport. It has a labeled dialog role, takes focus, traps Tab among visible enabled controls, allows Escape and backdrop close, and restores prior focus. Nested visible dialogs give keyboard handling to the topmost modal. Toasts use raised charcoal and semantic icons or error color.

### Inputs / Fields

Readable dark controls with plain labels and clear keyboard edges.

- **Style:** working charcoal, cool border, shared control corners and padding from `field-input`. Standard fields are at least (42px) tall; account fields and public community selects use (46px). Placeholder text stays visible and the caret uses lavender.
- **Focus:** focus changes the border to lavender without a shadow. `:focus-visible` adds the outline described above. Checkboxes and radios use lavender as their native accent.
- **Disabled / Error:** disabled fields use raised charcoal and muted text. Errors use the negative pair in an explicit feedback region. Field hints remain supporting text beneath the label or control.
- **Mobile:** working input, textarea and select text becomes (16px) at (760px); auth fields follow the same size. Do not shrink form text to fit a narrow layout.

### Navigation

Quiet Geist destinations with a filled lavender current state.

- **Rail:** labels use (13px), minimum-height rows (42px), inset icons (17px) and softly squared corners. Current navigation uses lavender wash, pale lavender text and accent icons; hover uses raised charcoal. Secondary navigation opens through a disclosure rather than another permanent rail.
- **Context:** the toolbar holds a compact breadcrumb, search and a relevant action. The skip link appears on focus. The mobile drawer keeps the same destinations and their active states, with the focus and scroll behavior described in Layout.

### Editorial Thread and Landing Example

Connected stages preserve the relationship between need, source and piece without adding ornamental framing to each screen. In the landing example, four tabs share a thin active indicator and update one panel. Arrow keys, Home and End move among the tabs; pointer selection animates the indicator over (240ms), while keyboard selection stays immediate. FAQ questions expose their expanded state through buttons.

Spatial motion is bounded. Controls use the shared ease-out curve; the landing aperture arrives over (600ms), with native scroll-linked layer movement only when supported, above (600px), and without a reduced-motion preference. Reduced motion disables loading animations and scrolling effects, resets landing press scale and aperture movement, and removes tab-indicator transitions; shared button color feedback remains. Journey surfaces explicitly remove their transitions. These behaviors retain immediate access to copy, actions and working evidence.

## Do's and Don'ts

### Do:

- **Do** use charcoal surfaces and lavender actions across landing, account entry, setup, workspace and public forms.
- **Do** pair editorial serif page titles with Geist controls, operational headings and data.
- **Do** preserve the shared four-module mark and lowercase kompass name.
- **Do** keep semantic status colors tied to real success, warning, error or destructive meaning.
- **Do** preserve visible keyboard focus, modal and drawer focus behavior, and reduced spatial motion.
- **Do** adapt each task's records, working panes and evidence to the viewport while keeping controls readable.
- **Do** preserve customer colors and stored creative assets as content within the shared interface.

### Don't:

- **Don't** restore the superseded green application palette, Manrope headings or DM Sans controls.
- **Don't** use the legacy `--green` alias as a reason to introduce a second brand accent.
- **Don't** apply the landing's large illustration or spacious hero composition to every working task.
- **Don't** replace operational H2/H3, form labels or data with display serif typography.
- **Don't** remove the keyboard outline, move focused buttons, or make content depend on spatial animation.
- **Don't** recolor the official Google sign-in control to match the brand action button.

Not canonized: the previous two-world documentation and its detector drift are superseded by the authorized redesign; historical customer colors and stored artwork are content, not reusable interface tokens. The finish review returned `ship` with no material fixes; this documentation pass makes no UI repairs.
