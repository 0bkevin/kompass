---
name: 30X Radar
description: A calm green workspace for evidence-led editorial work.
colors:
  primary: "#136c51"
  primary-hover: "#0e563f"
  green: "#137258"
  navigation: "#102b29"
  navigation-active: "#2a5140"
  navigation-text: "#c2d1c8"
  navigation-active-text: "#f2f9ec"
  canvas: "#f6f7f3"
  paper: "#ffffff"
  ink: "#19352b"
  muted: "#58665f"
  border: "#dde5de"
  next-action: "#e6f0e6"
  focus: "#438b6a"
typography:
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.8px"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.35px"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  badge: "5px"
  control: "8px"
  card: "12px"
  feature: "14px"
  onboarding: "16px"
spacing:
  tight: "8px"
  control: "12px"
  standard: "16px"
  section: "24px"
  spacious: "28px"
  wide: "36px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-ghost:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  field-input:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "12px 13px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
  navigation-active:
    backgroundColor: "{colors.navigation-active}"
    textColor: "{colors.navigation-active-text}"
    padding: "11px 12px"
  next-action:
    backgroundColor: "{colors.next-action}"
    rounded: "{rounded.feature}"
    padding: "32px 36px"
---

# Design System: 30X Radar

## Overview

**Creative North Star: "The Guided Green Workspace"**

The established 30X Radar identity pairs dark green navigation with a light neutral working surface. It feels practical, composed and readable: familiar forms, lists and disclosures support sustained editorial work. This records the incumbent application's visual language and its completed extensions.

Hierarchy comes from typography, space and restrained green emphasis. The workspace shows a clear action before supporting detail, while evidence remains readable in expanded sections. The interface uses Lucide outline controls and functional UI rather than illustration or simulated materials.

**Key Characteristics:**

- Dark green orientation beside light working surfaces.
- Manrope headings with DM Sans controls and reading text.
- Flat lists, soft bordered forms and restrained tonal emphasis.
- Visible focus and responsive stacking.

## Colors

Forest greens anchor an otherwise quiet palette of white and lightly green neutral surfaces. Frontmatter values are normative; source CSS custom properties remain the implementation authority.

### Primary

- **Action Green** (`primary`): filled primary actions; the deeper hover color marks interaction.
- **Interface Green** (`green`): the shared accent custom property used by native controls and existing accents.
- **Focus Green** (`focus`): the global keyboard outline. Journey surfaces use their existing local green outline variant.

### Neutral

- **Navigation Green** (`navigation`): the persistent sidebar; **Navigation Active** and its pale text identify the current destination.
- **Navigation Text**: readable quiet labels on the dark sidebar.
- **Warm Canvas** (`canvas`): the page background around working regions.
- **Paper** (`paper`): forms, cards and the top bar.
- **Green Ink** (`ink`): main reading text; **Muted** supports secondary information.
- **Soft Border** (`border`): dividers, fields and containers.
- **Next Action Wash** (`next-action`): a pale green tonal container for the home action.

**The Action Emphasis Rule.** Use filled green to identify primary actions; keep supporting actions white or transparent.

## Typography

**Display Font:** Manrope, with sans-serif fallback.
**Body Font:** DM Sans, with sans-serif fallback.

**Character:** compact, strong headings give an operational interface clear landmarks; softer body text supports explanations and native controls. There is no separate monospace or ornamental display system.

### Hierarchy

- **Headline:** the frontmatter headline role supplies the standard page title. Journey titles adapt to smaller screens (27px, then 25px).
- **Title:** section headings use the title role; smaller subsection headings use Manrope (16px, line-height 1.5).
- **Body:** the body role is the baseline. Paragraphs inherit a more open line-height (1.65); journey introductions use larger text (15px). Journey prose is capped at 72ch.
- **Label:** field labels use the label role. Buttons use slightly stronger DM Sans (13px, weight 700). Supporting text commonly uses 12–13px; journey badges use 11px.

**The Two Voices Rule.** Keep Manrope for headings and DM Sans for body text and controls.

## Layout

The desktop shell has a fixed sidebar (235px, narrowing to 216px at 1250px), a white top bar (72px) and a main region offset by the sidebar. Main content is centered within a maximum width (1700px), with generous desktop padding (32px 36px). The spacing vocabulary is pragmatic rather than a strict single-base scale; reuse the frontmatter steps without forcing every local gap onto them.

Content combines divided rows, two-column working regions and bordered forms. Journey pages use a vertical gap (28px), three-column step lists and two-column supporting regions. At 1150px the step list becomes two columns and opportunity actions move below their text. At 800px journey working regions and evidence stack. At 520px filters and step lists become one column. Long tables scroll inside their own container.

The sidebar becomes an off-canvas drawer at 760px, with an overlay and the main region taking the full viewport. Global search moves to a full-width second row at 900px on sections that support it. At 600px the shell uses compact page gutters (16px), a top bar with a minimum height of 64px and reduced navigation context. Forms collapse as defined by their surface; company setup becomes one column at 600px. Keep long text and controls within their region using wrapping and shrinkable grid tracks.

## Elevation & Depth

Working surfaces are predominantly flat. Borders, white panels and pale green fills separate content; the current primary button and onboarding panel have no shadow. Existing reference cards retain subtle ambient shadows, while modal overlays use stronger elevation. Do not make all working regions float.

### Shadow Vocabulary

- **Modal:** (`box-shadow: 0 20px 80px #0a2d2430`) separates the dialog from the dimmed workspace.

**The Quiet Surface Rule.** Use tone and dividers for routine hierarchy; reserve strong elevation for overlays.

## Shapes

Controls have gently curved corners, cards broader corners and larger feature regions slightly softer corners, as recorded in the radius tokens. Badges remain compact rounded rectangles. Native checkboxes, circular step markers and user avatars retain their functional shapes. Lists are often open rows bounded by thin horizontal rules rather than individually enclosed cards.

## Components

### Buttons

Confident and familiar. Primary actions use Action Green with white text; secondary actions use white with a thin border; ghost actions have transparent background and border. All share the control radius, an inline icon/text gap (8px), a minimum height (42px; 43px in journey surfaces) and strong labels. Hover deepens primary green or adds a pale neutral fill to secondary controls without lifting them. Keyboard focus uses an offset outline. Busy buttons show an inline spinner and disable interaction; disabled controls reduce opacity (0.48).

The Google sign-in button follows [Google's official branding requirements](https://developers.google.com/identity/branding-guidelines): the current full-color gradient G, a white surface, `#747775` border, `#1f1f1f` label, 4px corners and locally served Google Sans Medium at 14px/20px. This provider control is an intentional exception to the app font and green control palette. Keep its logo fixed at 20px and its touch target at least 44px high. Its label is “Continuar con Google”; it appears only when the server reports the provider configured. The Google G asset comes from the linked official guidance, and Google Sans includes its OFL license under `public/fonts/google-sans/`.

### Chips

Small semantic labels, not primary actions. Shared badges use a compact radius and neutral, green, amber or red tone pairs. Journey badges increase legibility with a larger label and roomier line-height; use the existing tone pair from that surface rather than treating every pale green as interchangeable.

### Cards / Containers

White, thin bordered and softly rounded. Forms commonly use internal padding (24px or 27px 30px); small screens reduce this. Evidence and explanatory regions use pale tonal backgrounds. Preserve divided rows for lists where the built surface already uses them.

### Inputs / Fields

Visible labels precede white fields with subtle strokes, a control radius and comfortable internal padding. Field text uses the body size, with a 16px minimum at viewport widths of 900px or less. Textareas resize vertically and use open line spacing. Placeholder text is secondary; it does not replace the label. Keyboard focus uses the global offset outline, with no field shadow. Errors appear as textual feedback in a soft red region.

### Navigation

The dark sidebar pairs outline icons with readable labels. The active item uses a lighter green block and pale text, without the former edge stripe. Supporting destinations live in a disclosure below the main links. The top bar carries company context and the current screen; on narrow screens a menu control opens the sidebar drawer. Keep the current destination legible in the compact shell.

### Next Action and Evidence

A pale green feature region leads the home workflow with a strong heading, explanatory copy and one filled action. Its desktop aside disappears when the region stacks. Evidence uses divided records and expandable tonal regions; disclosures expose detail without increasing the default page density. Company setup uses numbered step markers with distinct reached and current states.

## Do's and Don'ts

### Do:

- **Do** retain the dark green shell and light working surface when extending the app.
- **Do** reuse the shared button, field and badge components before introducing a local variant.
- **Do** give keyboard focus a visible offset outline and preserve reduced-motion behavior.
- **Do** use divided rows and disclosures for dense evidence and supporting detail.
- **Do** keep responsive overflow inside tables and wrap long content within its region.

### Don't:

- **Don't** replace the established font pair or green identity for an individual feature.
- **Don't** apply modal-strength shadows to routine forms and lists.
- **Don't** rely on placeholder text or color alone to explain a field or state.
- **Don't** promote incidental legacy type sizes, color variants or decorative labels into new system roles.
