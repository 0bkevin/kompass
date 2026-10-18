---
name: kompass
description: An editorial dark-purple public landing and a calm green working application.
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
  landing-bg: "#0c0c10"
  landing-surface: "#131318"
  landing-line: "#2c2b35"
  landing-text: "#f3f1f7"
  landing-muted: "#aaa7b7"
  landing-purple: "#bea5f5"
  landing-purple-ink: "#211337"
  landing-purple-hover: "#cfb9ff"
  landing-secondary: "#19181f"
  landing-control-hover: "#28232f"
  landing-focus: "#d7c2ff"
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
  landing-display:
    fontFamily: "Hedvig Letters Serif, Georgia, serif"
    fontSize: "clamp(44px, 5.35vw, 76px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  landing-headline:
    fontFamily: "Hedvig Letters Serif, Georgia, serif"
    fontSize: "43px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  landing-title:
    fontFamily: "Geist, sans-serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  landing-example-title:
    fontFamily: "Geist, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  landing-body:
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  landing-button:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.4
  landing-label:
    fontFamily: "Geist, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  badge: "5px"
  control: "8px"
  card: "12px"
  feature: "14px"
  onboarding: "16px"
  landing-control: "7px"
  landing-panel: "12px"
  landing-status: "4px"
spacing:
  tight: "8px"
  control: "12px"
  standard: "16px"
  section: "24px"
  spacious: "28px"
  wide: "36px"
  landing-tight: "8px"
  landing-control: "12px"
  landing-standard: "20px"
  landing-section: "24px"
  landing-row: "28px"
  landing-wide: "36px"
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
  landing-button-primary:
    backgroundColor: "{colors.landing-purple}"
    textColor: "{colors.landing-purple-ink}"
    typography: "{typography.landing-button}"
    rounded: "{rounded.landing-control}"
    padding: "12px 22px"
  landing-button-primary-hover:
    backgroundColor: "{colors.landing-purple-hover}"
  landing-button-secondary:
    backgroundColor: "{colors.landing-secondary}"
    textColor: "#e1dce9"
    typography: "{typography.landing-button}"
    rounded: "{rounded.landing-control}"
    padding: "12px 22px"
  landing-button-secondary-hover:
    backgroundColor: "{colors.landing-control-hover}"
  landing-button-small:
    backgroundColor: "#1c1b23"
    textColor: "#f0ebf7"
    rounded: "{rounded.landing-control}"
    padding: "10px 15px"
  landing-example:
    backgroundColor: "{colors.landing-surface}"
    rounded: "{rounded.landing-panel}"
  landing-status:
    backgroundColor: "#392c4b"
    textColor: "#d8baf9"
    rounded: "{rounded.landing-status}"
    padding: "2px 7px"
---

# Design System: kompass

## Overview

**Creative North Star: "The Editorial Thread and the Guided Green Workspace"**

kompass has two deliberately scoped visual worlds. The public landing at `/` uses an ink-black ground, charcoal layers and pale lavender actions. Hedvig Letters Serif gives promises an editorial voice; Geist gives examples and controls precision. Fine connections, square modules and open dividers make the relationship between an audience need and an editorial decision visible.

The authenticated application and authentication retain their established green identity: dark green navigation, light neutral working surfaces, Manrope headings and DM Sans reading text and controls. Familiar forms, divided lists and disclosures support sustained editorial work. The landing identity does not authorize restyling these surfaces.

Frontmatter primitives without a `landing-` prefix belong to the working application and authentication. Every `landing-` token belongs only to the public landing. The landing source scopes its custom properties to its page wrapper; its font faces are locally served. This document records the implemented rules in `src/landing.css`, `src/styles.css` and `src/workspace.css`, rather than a product-wide migration.

**Key Characteristics:**

- Public landing: ink-black, charcoal, lavender, editorial serif promises and precise sans-serif controls.
- Workspace and authentication: dark green orientation, light working surfaces, Manrope headings and DM Sans text.
- Both scopes use fine dividers, readable states, visible keyboard focus and responsive stacking.
- Landing signature geometry is native SVG and CSS; no raster composition or borrowed reference asset ships.

## Colors

The landing's cool charcoal and lavender palette introduces the product; the working application's forest greens and pale neutral surfaces support daily work. Frontmatter values are normative, with scope determined by the token prefix.

### Primary

- **Landing Lavender** (`landing-purple`): filled landing actions, selected-stage indicator, outline icons and modular brand mark. Its hover variant lightens the action.
- **Landing Purple Ink** (`landing-purple-ink`): dark lettering on pale lavender actions.
- **Landing Focus** (`landing-focus`): a visible offset outline on links, buttons and focusable example content.
- **Action Green** (`primary`): filled workspace and authentication actions; the deeper hover color marks interaction.
- **Interface Green** (`green`): native controls and existing operational accents.
- **Focus Green** (`focus`): the working application's keyboard outline. Journey surfaces retain their existing local green outline variant.

### Neutral

- **Landing Ink** (`landing-bg`): the public page ground.
- **Landing Charcoal** (`landing-surface`): editorial example and calendar surfaces.
- **Landing Divider** (`landing-line`): thin boundaries between sections, tabs and working regions within illustrations.
- **Landing Reading White** (`landing-text`) and **Landing Muted** (`landing-muted`): primary and supporting text on dark surfaces.
- **Landing Secondary** (`landing-secondary`) and **Landing Control Hover** (`landing-control-hover`): restrained supporting action fills.
- **Navigation Green** (`navigation`): the working application's persistent sidebar; **Navigation Active** and its pale text identify the current destination.
- **Navigation Text**: quiet labels on the dark sidebar.
- **Warm Canvas** (`canvas`): background around working regions. **Paper** (`paper`) carries forms, cards and the top bar.
- **Green Ink** (`ink`) and **Muted**: primary and secondary working text.
- **Soft Border** (`border`): working dividers, fields and containers.
- **Next Action Wash** (`next-action`): the pale green home action region.

The aperture's saturated violet modules and fine connecting strokes are native SVG illustration colors, not alternative action colors. Preserve their local geometry treatment rather than adding them to the operational palette.

**The Two Scopes Rule.** Apply `landing-` tokens only to the public landing; retain the green tokens for workspace and authentication.

**The Action Emphasis Rule.** Use pale lavender for primary landing actions and filled green for primary working actions; keep supporting controls visually quieter within their own scope.

## Typography

**Landing Display Font:** Hedvig Letters Serif, with Georgia and serif fallbacks.
**Landing Body Font:** Geist, with sans-serif fallback.
**Workspace Heading Font:** Manrope, with sans-serif fallback.
**Workspace Body Font:** DM Sans, with sans-serif fallback.

**Character:** the landing pairs an open editorial serif with precise interface text. The application keeps compact, strong headings and softer reading text for operational work. All four main families are self-hosted; the landing WOFF2 files and their OFL license live under `public/fonts/landing/`.

### Hierarchy

- **Landing Display:** the `landing-display` role supplies the main promise. At widths of 800px or less it uses `clamp(40px, 6.5vw, 59px)`; at 600px or less, `clamp(35px, 8.2vw, 49px)` with a more open line-height (1.15); at 360px or less, 32px.
- **Landing Headline:** the `landing-headline` role supplies major section headings, reducing to 36px on smaller screens. Audience and closing sections retain their observed local display sizes.
- **Landing Title:** the `landing-title` role supplies sans-serif feature headings. The example's compact heading uses `landing-example-title` and reduces to 16px on mobile; it remains subordinate to section headings.
- **Landing Body:** the `landing-body` role is the wrapper baseline; paragraphs use line-height (1.65). Hero support uses 17px at desktop, then 16px and 15px. Feature prose uses 14px and section prose 15px, with reading regions capped at 65ch where the source does so.
- **Landing Button and Label:** the button role supplies desktop actions, reducing to 13px on mobile. Small labels identify provenance, content and workflow state; the shipped secondary and status text uses at least 11px rather than a new decorative heading tier.
- **Workspace Headline:** the unprefixed headline role supplies standard page titles. Journey titles adapt to smaller screens (27px, then 25px).
- **Workspace Title:** the title role supplies section headings; smaller subsection headings use Manrope (16px, line-height 1.5).
- **Workspace Body:** the body role is the baseline. Paragraphs use line-height (1.65); journey introductions use 15px and cap prose at 72ch.
- **Workspace Label:** the label role supplies field labels; buttons use DM Sans (13px, weight 700). Supporting text commonly uses 12–13px and journey badges use 11px.

**The Scoped Voices Rule.** Use Hedvig Letters Serif with Geist on the landing, and Manrope with DM Sans in workspace and authentication.

## Layout

The landing centers content in a maximum-width container (1120px) with desktop side space (48px). At 1100px or less the gutters become 32px, at 600px or less 20px, and at 360px or less 16px. The compact header is a horizontal flex row with content height 64px on desktop, 60px at 800px and 56px at 600px. Its central links disappear at 800px, while login remains available. The small header account action disappears at 600px.

Landing content uses spacious sections, open two-column grids and thin divided rows. Large desktop inter-column gaps (100px, or 120px in the audience region) reduce to 60px at 1100px and smaller local values at 800px. Section and feature grids become one column at 600px. The editorial example keeps a four-column tab strip; its two-column body becomes stacked on mobile, with the proposed need above the selected result. The example body reserves height across stages (312px desktop, 340px at 800px, 490px mobile) to limit layout movement. At 360px the main action pair stacks. Peripheral SVG aperture geometry disappears at 600px.

The workspace shell retains its fixed sidebar (235px, narrowing to 216px at 1250px), white top bar (72px) and sidebar-offset main region. Content is centered within a maximum width (1700px) with desktop padding (32px 36px). Its spacing vocabulary is pragmatic rather than a strict single-base scale.

Working content combines divided rows, two-column regions and bordered forms. Journey pages use a vertical gap (28px), three-column step lists and two-column supporting regions. At 1150px step lists become two columns and opportunity actions move below their text. At 800px journey working regions and evidence stack. At 520px filters and step lists become one column. Long tables scroll inside their own container.

The workspace sidebar becomes an off-canvas drawer at 760px. Global search moves to a full-width second row at 900px on sections that support it. At 600px the shell uses 16px page gutters, a top bar with minimum height 64px and reduced navigation context; company setup becomes one column. Both scopes keep long text within its region using wrapping and shrinkable grid tracks.

## Elevation & Depth

The landing uses flat charcoal layers, thin borders and a few deeper purple fields. It has no box-shadow vocabulary. The manuscript illustration's slight rotation is local visual geometry, not a hover or card-elevation rule. The SVG aperture frames the proof without covering content or controls.

Working surfaces also remain predominantly flat. Borders, white panels and pale green fills separate content; primary buttons and the onboarding panel have no shadow. Existing reference cards retain subtle ambient shadows, while modal overlays use stronger elevation.

### Shadow Vocabulary

- **Workspace Modal:** (`box-shadow: 0 20px 80px #0a2d2430`) separates a dialog from the dimmed working application.

**The Quiet Surface Rule.** Use tone and dividers for routine hierarchy in both scopes; reserve strong elevation for working-application overlays.

## Shapes

Landing controls use compact rounded corners, while editorial panels use broader corners, as recorded in the landing radius tokens. Status labels are small rounded rectangles. The brand mark and aperture use connected square modules with finely rounded corners; audience motifs reuse the small square grammar and a circular variant. Fine strokes and open dividers separate content without enclosing every paragraph.

Working controls retain their gentle corners, broader card corners and slightly softer feature regions. Badges remain compact rounded rectangles. Native checkboxes, circular step markers and avatars keep their functional shapes. Lists often use open rows bounded by thin horizontal rules rather than individually enclosed cards.

## Components

### Buttons

Landing actions are restrained and clear. The primary uses Landing Lavender with Purple Ink; the supporting demo action uses a dark fill, fine border and pale text. Their frontmatter padding accompanies a minimum height (48px), an inline icon gap (12px) and the landing button typography. At 600px, horizontal padding becomes 15px and the icon gap becomes 8px. The small header variant has a minimum height (40px), smaller type (12px) and compact padding. Fine-pointer hover lightens primary lavender or deepens supporting fills and their border. Disabled demo controls use opacity (0.65), a wait cursor and an inline loading indicator.

Landing buttons use CSS transform feedback only: pointer press scales to 0.97 over 160ms, release returns over 100ms, and focus-visible activation stays immediate. All landing focusable controls retain an offset outline (2px, offset 5px). Reduced motion removes transforms, transitions and spinner rotation.

Workspace and authentication actions retain Action Green primary fills, white thin-bordered secondary controls and transparent ghost controls. They share a control radius, icon gap (8px), minimum height (42px; 43px in journey surfaces) and strong labels. Hover deepens green or adds a pale neutral fill without lifting. Busy controls show an inline spinner; disabled controls use opacity (0.48). Focus uses an offset outline.

The Google sign-in button remains an authentication-specific provider control: its current full-color gradient G, white surface, `#747775` border, `#1f1f1f` label, 4px corners and locally served Google Sans Medium (14px/20px) follow the existing provider treatment. The logo is fixed at 20px with a touch target of at least 44px. The label is “Continuar con Google”; it appears only when the server reports the provider configured. Its asset provenance and OFL license remain under `public/fonts/google-sans/`.

### Chips

Landing chips identify illustrative provenance and workflow state. They use small corners, dark purple fills and pale lavender text; these labels are not primary actions or decorative section headings. Working badges retain their neutral, green, amber and red tone pairs. Journey badges retain their larger labels and more open line-height; use the tone pair already established by the surface.

### Cards / Containers

Landing editorial examples and diagram containers use flat dark surfaces, fine borders and the landing panel radius. Their internal sections use dividers and local spacing rather than floating subcards. The manuscript and calendar are illustrative interface diagrams, not a preview that changes the authenticated application's palette.

Working cards remain white, thin bordered and softly rounded. Forms commonly use padding (24px or 27px 30px), reduced on small screens. Evidence regions use pale tonal backgrounds. Preserve divided rows where the working surface already uses them.

### Inputs / Fields

Input fields belong to workspace and authentication; the public landing does not introduce a parallel input design. Visible labels precede white fields with subtle strokes, a control radius and comfortable internal padding. Field text uses the working body size, with a 16px minimum at viewport widths of 900px or less. Textareas resize vertically. Placeholder text is secondary and does not replace a label. Focus uses the global offset outline without a field shadow; errors use textual feedback in a soft red region.

### Navigation

Landing navigation uses quiet small Geist links in a compact horizontal header, with login and account access on the right. Links brighten on fine-pointer hover and retain visible keyboard focus. Mobile removes the central anchor links and preserves returning access; the landing does not gain the workspace drawer.

The working application's dark sidebar pairs outline icons with readable labels. Its active item uses a lighter green block and pale text without an edge stripe. Supporting destinations remain in a disclosure. The top bar carries company context and the current screen; a menu control opens the drawer on narrow screens.

### Editorial Example and Native Geometry

The landing example keeps one proposed audience need visible while a selected tab shows audience, evidence, approach or draft content. It uses actual tab semantics, arrow/Home/End navigation and immediate keyboard selection. Pointer selection may transition only the indicator over 160ms. Panel text changes directly; there is no WAAPI content animation. Example and provenance labels remain explicit. The FAQ uses a native button-controlled disclosure pattern with visible expanded state.

The square-module SVG aperture settles once using CSS starting styles: opacity and vertical translation (600ms) with row delays (50ms, 100ms and 150ms). Content and actions remain visible throughout. Reduced motion renders the geometry settled and removes the indicator transition. Brand and diagram geometry are source-native; no shipping raster needs provenance tracking.

### Next Action and Evidence

The green home workflow retains its pale feature region, strong heading, explanatory copy and one filled action. Its desktop aside disappears when the region stacks. Evidence uses divided records and expandable tonal regions. Company setup retains numbered step markers with reached and current states.

## Do's and Don'ts

### Do:

- **Do** keep the dark-purple public landing and green workspace/authentication as explicitly separate visual scopes.
- **Do** use the landing serif for promises and major section headings, and keep example controls and compact headings in Geist.
- **Do** reuse existing green buttons, fields and badges when extending workspace or authentication.
- **Do** give keyboard focus a visible offset outline and preserve immediate keyboard and reduced-motion behavior.
- **Do** keep example provenance, workflow state and supporting text readable on mobile.
- **Do** use fine dividers and tonal layers for hierarchy, with wrapping and contained table overflow where needed.

### Don't:

- **Don't** apply landing fonts, lavender actions or dark surfaces to workspace or authentication under this landing-only identity change.
- **Don't** apply section-display sizing to compact editorial example headings.
- **Don't** add modal-strength shadows to routine forms, lists or landing panels.
- **Don't** rely on placeholder text or color alone to explain a field or state.
- **Don't** hide landing copy or actions behind entrance motion, or animate keyboard tab selection.
- **Don't** promote incidental legacy variants or decorative labels into new system roles.
