# TownHawll Design System

This document defines the initial visual, interaction, and implementation
standards for TownHawll. It applies to every contributor and coding agent
working on `apps/web`, `apps/admin`, or `packages/ui`.

The current visual direction is intentionally focused and adaptable. The product
may receive a broader visual redesign later, so colors, typography, radii,
elevation, and motion must remain centralized in design tokens and shared
primitives. A visual refresh should not require editing every feature component.

## 1. Design principles

TownHawll is a content-first entertainment platform for games, movies, and
shows. Its interface should feel:

- modern and polished;
- dark, compact, and responsive;
- restrained around the application shell;
- visually rich through content artwork;
- fast in both actual and perceived performance;
- clear before decorative.

Posters, backdrops, screenshots, avatars, and collection artwork should provide
most of the visual color. Navigation, forms, and surrounding surfaces should
remain neutral so the content stays prominent.

When several designs satisfy a requirement, prefer the simplest one. Add a
visual effect only when it communicates hierarchy, interaction, state, or
continuity.

Inspiration from other entertainment and community products is acceptable. Do
not copy another product's layouts, components, assets, branding, or distinctive
interaction patterns.

## 2. Product surfaces

### Public application

`apps/web` owns the public and authenticated user experience. It should have a
recognizable TownHawll identity rather than looking like an unmodified
component-library template.

Public interfaces should favor:

- custom, content-led page compositions;
- compact information density;
- subtle application chrome;
- restrained borders and surfaces;
- artwork-led discovery;
- app-local title, review, collection, profile, and discovery components.

Avoid placing every section inside an identical card. On title and profile
pages, use typography, spacing, and separators to establish structure.

### Administration application

`apps/admin` prioritizes operational clarity, accessibility, consistency, and
implementation speed. Conventional application patterns are appropriate for
tables, filters, forms, dialogs, menus, tabs, pagination, and dense data views.

Radix and shadcn-derived components may be used heavily, while still applying
TownHawll's colors, typography, spacing, radii, and semantic states.
Admin-specific compositions stay in `apps/admin`; do not create a separate
`packages/ui/admin` layer.

## 3. Component ownership

`packages/ui` contains generic, reusable primitives without product or business
logic. Appropriate examples include:

- buttons, inputs, textareas, labels, and selection controls;
- dialogs, tooltips, popovers, dropdowns, and tabs;
- badges, separators, skeletons, spinners, and form helpers.

Product-specific components belong to the application that uses them. Examples
include `TitleCard`, `ReviewCard`, and `ProfileHeader` in `apps/web`, or
`ReportTable`, `ImportPreview`, and `AdminSidebar` in `apps/admin`.

Use this composition model:

```text
shared primitive
→ application feature component
→ page composition
```

For example:

```text
packages/ui Button
→ apps/web AddToCollectionButton
→ title page
```

Do not put application behavior, database access, or domain rules into shared UI
primitives. Do not use `packages/ui` as a general component dumping ground.

## 4. Theme and color

TownHawll is dark-only for the current MVP. Do not build or maintain an unused
light theme. Keep the architecture compatible with a future theme without adding
present-day theme complexity.

The application uses neutral near-black surfaces with purple as a controlled
accent. Use the accent for primary actions, selected states, active navigation,
keyboard focus, and important interactive emphasis. Neutral controls and
surfaces should remain neutral.

The canonical tokens live in `packages/ui/src/styles/tokens.css`:

```css
:root {
  color-scheme: dark;

  --background: #09090b;

  --surface-1: #0d0d10;
  --surface-2: #121216;
  --surface-3: #18181d;
  --surface-hover: #1d1d23;

  --foreground: #f4f4f5;
  --foreground-secondary: #b4b4bc;
  --foreground-muted: #777781;
  --foreground-disabled: #52525b;

  --border-subtle: #202026;
  --border-default: #292930;
  --border-strong: #3a3a43;

  --accent: #7c3aed;
  --accent-hover: #8b5cf6;
  --accent-muted: rgb(139 92 246 / 14%);

  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
}
```

Use semantic Tailwind utilities such as `bg-background`, `bg-surface-2`,
`text-foreground-muted`, `border-border-default`, and `bg-accent`. Do not
scatter palette-specific classes or raw color values through feature code when a
semantic token exists.

These colors establish the development palette rather than permanent brand
values. Change shared tokens when tuning the system; do not patch individual
components to approximate a new palette.

## 5. Typography

Inter Variable is the product typeface. Use the shared `font-sans` mapping and
introduce another family only for a concrete design requirement.

Typography should establish hierarchy before boxes, gradients, shadows, or other
decoration.

| Role                   | Suggested size | Typical weight |
| ---------------------- | -------------: | -------------: |
| Display or hero        |        32–48px |            600 |
| Page title             |        28–36px |            600 |
| Section heading        |        20–24px |            600 |
| Card or item heading   |        14–18px |        500–600 |
| Body                   |        14–16px |            400 |
| Compact interface text |        13–14px |        400–500 |
| Metadata and labels    |        11–13px |            500 |

Use `400` for normal text, `500` for emphasis, and `600` for headings and
buttons. Reserve `700` for rare cases. Avoid oversized marketing typography
inside normal product surfaces.

## 6. Spacing, density, and shape

Use the shared spacing scale whenever practical:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64px
```

TownHawll uses compact-to-medium density. Desktop layouts may be dense; mobile
layouts must remain readable and touch-friendly. Avoid oversized controls,
excessive vertical whitespace, unnecessarily tall navigation, and large cards
that contain little information.

Use soft corners without making the interface look bubbly:

```css
--shape-radius-sm: 0.375rem; /* 6px */
--shape-radius-md: 0.625rem; /* 10px, default */
--shape-radius-lg: 0.875rem; /* 14px */
--shape-radius-xl: 1.125rem; /* 18px */
--shape-radius-full: 9999px;
```

The medium radius is the default for controls. Larger surfaces may use larger
radii. Reserve full-radius pills for tags, chips, compact filters, and status
indicators where the shape conveys meaning.

## 7. Surfaces, borders, and elevation

Create hierarchy with spacing and surface contrast first. Use borders to define
controls, separate adjacent surfaces, and communicate focus or selection.

Prefer subtle borders. Avoid thick outlines, bright borders around every
section, border gradients, and persistent glows.

Use shadows sparingly for overlays such as dialogs, menus, and popovers.
Ordinary cards should generally rely on their surface and border. The shared
overlay elevation is:

```css
--elevation-overlay: 0 20px 50px rgb(0 0 0 / 45%);
```

A card should represent a meaningful visual group. If spacing, a heading, or a
separator communicates the relationship clearly, do not add another bordered
container.

Gradients are reserved for image-readability overlays, backdrop fades, rare hero
compositions, or deliberate brand treatments. Do not use gradient buttons,
decorative gradient borders, neon backgrounds, or gradients added only to imply
quality.

Glassmorphism is not part of the default language. Backdrop blur is appropriate
only when an overlay or navigation layer needs visual separation from content
beneath it.

## 8. Components and forms

Buttons must communicate hierarchy:

- **Primary:** accent treatment for the main action in a context.
- **Secondary:** neutral surface and subtle border for supporting actions.
- **Ghost:** minimal chrome for navigation and tertiary actions.
- **Destructive:** danger treatment only for destructive operations.

Do not present every action as primary. Keep button sizes proportional to their
context. Icon-only controls require an accessible name and, when useful, a
tooltip.

Inputs should use a dark surface, clear boundary, visible label, readable text,
and concise error feedback. Keep the focus treatment visible and restrained; use
the browser-compatible shared focus outline rather than glows or oversized
rings. Never remove keyboard focus without an accessible replacement.

Forms must:

- associate labels, descriptions, and errors with their fields;
- validate and report errors near the relevant control when practical;
- preserve entered values where safe;
- prevent duplicate submissions;
- show pending and completion states;
- avoid layout shifts when messages appear;
- avoid relying exclusively on toast notifications for validation.

## 9. Interaction and hover

Hover feedback belongs on interactive elements such as buttons, links, controls,
menu items, interactive rows, and clickable content cards. Static content should
not react merely because a pointer passes over it.

Appropriate feedback includes a small change to border, surface, image opacity,
or text color. Avoid routine use of scale, translation, dramatic shadow, or glow
effects. Interactive elements should use the pointer cursor where appropriate.

Hover styles must not be the only indication that an element is interactive or
selected. Touch and keyboard users must receive equivalent state and focus
feedback.

## 10. Motion

Motion communicates state change, continuity, hierarchy, or feedback. It must
not delay navigation or make the interface feel slower.

Use Motion through the shared exports in `packages/ui/src/lib/motion.ts` when an
interaction benefits from animation. Do not add GSAP or another animation
framework without a demonstrated requirement.

Canonical timings are:

```css
--motion-duration-fast: 120ms;
--motion-duration-normal: 180ms;
--motion-duration-overlay: 240ms;
--motion-ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Transitions up to roughly `350ms` may be used for justified structural changes.
Avoid interface animation lasting `500ms` or more.

Good uses include dialog and menu transitions, accordion expansion, tab changes,
selection indicators, submission feedback, and subtle insertion or removal.
Stateful icon transitions such as menu-to-close, bookmark-to-bookmarked, or
plus-to-check are appropriate when they clarify a real state change.

Avoid animating every card or heading, decorative page-load sequences, perpetual
floating objects, repeated scaling, or exaggerated spring physics. Prefer
`transform` and `opacity` when animating.

Respect `prefers-reduced-motion`. Every interaction and state must remain
understandable when animation is removed.

## 11. Icons, imagery, and brand assets

Use Lucide for common interface concepts. Do not mix icon libraries casually.
Custom SVGs are appropriate for TownHawll branding, provider logos, platforms,
achievements, ranks, and domain concepts that Lucide cannot express clearly.

Keep custom icons visually consistent in stroke, fill, optical size, and
alignment. Do not animate icons when no state changes.

Treat the current TownHawll logo and wordmark as temporary. Layouts must
tolerate future changes in brand dimensions and should not be tightly built
around placeholder artwork.

Use content imagery deliberately:

- preserve the intended aspect ratio;
- reserve layout space before an image loads;
- provide useful alternative text when the image conveys information;
- use empty alternative text for decorative imagery;
- avoid decorative backgrounds that compete with already colorful artwork;
- avoid unnecessary image requests and oversized assets.

## 12. Loading, empty, and error states

Preserve layout while content loads. Use skeletons for content surfaces and
compact spinners or label changes for actions. Stream or defer sections when
useful. Do not replace an entire page with a spinner when only one section is
waiting.

Empty states should be short and actionable. For example:

```text
No reviews yet.
Write the first review.
```

Avoid oversized illustrations, decorative empty-state cards, excessive
explanation, or artificial motivational copy.

Error states should explain what the user can do next without exposing internal
details. Keep destructive and recovery actions visually distinct.

## 13. Responsive design

Build mobile-first and let components adapt rather than simply shrink. Give
special attention to horizontal content rows, poster grids, title headers,
metadata, sidebars, forms, tables, and navigation.

Desktop experiences may show greater density. Mobile experiences must retain
readable hierarchy and accessible touch targets. Do not hide essential actions
solely to make a layout fit.

A typical public title page may follow this hierarchy:

```text
backdrop or contextual media
→ title identity and primary actions
→ core metadata and overview
→ TownHawll intelligence
→ cast and crew
→ ratings and reviews
→ related content
```

An admin page may use a conventional sidebar, top bar, heading, filters/actions,
and primary data surface.

## 14. Accessibility

Accessibility is a release requirement, not a later visual enhancement. At
minimum:

- use semantic HTML and native behavior where possible;
- support keyboard navigation and visible focus states;
- provide correctly associated form labels and errors;
- use accessible dialog, menu, tooltip, and popover primitives;
- give icon-only controls accessible names;
- provide appropriate image alternative text;
- maintain sufficient text and state contrast;
- never communicate status through color alone;
- respect reduced-motion preferences;
- keep controls usable at touch sizes on mobile.

Prefer established Radix or shadcn-derived interaction primitives over
rebuilding complex accessible behavior.

## 15. Performance

Perceived speed is part of the design. Avoid decoration that increases bundle
size, delays interaction, or causes unstable layouts.

Prefer server components where appropriate, focused client boundaries, optimized
images, stable loading placeholders, and small interaction dependencies. Avoid
autoplay background effects, expensive layout animations, large animation
libraries for minor effects, and unnecessary client-side rendering.

## 16. Technology direction

The current design stack is:

- Tailwind CSS;
- CSS variables and semantic design tokens;
- shared React primitives in `packages/ui`;
- shadcn and Radix patterns where appropriate;
- Lucide icons;
- Motion for purposeful interaction animation;
- Inter Variable.

Do not add light-theme infrastructure, multiple icon systems, GSAP, a custom
design-system framework, or another major visual dependency without a concrete
requirement.

shadcn is a source of accessible implementation patterns, not the TownHawll
brand. Public-facing components should be styled to match this document rather
than retaining generic defaults.

## 17. Patterns to avoid

Do not introduce generic, decoration-heavy interface patterns by default,
including:

- gradient-filled heroes and purple glowing blobs;
- frosted glass panels and excessive blur;
- hover scaling or floating cards throughout the page;
- huge rounded containers and pill-shaped standard controls;
- card grids for every section;
- decorative badges and icons beside routine text;
- animated backgrounds and meaningless motion;
- oversized headings, controls, whitespace, or marketing copy;
- fake dashboard statistics;
- repeated generic software-dashboard layouts.

## 18. Implementation and review checklist

Before completing UI work, verify that:

- existing shared primitives were reused where appropriate;
- product-specific components remain in their owning application;
- semantic tokens are used instead of repeated raw visual values;
- the result follows the dark, compact, content-first direction;
- cards, effects, and motion each serve a clear purpose;
- hover, focus, disabled, pending, success, and error states are covered where
  relevant;
- keyboard, touch, screen-reader, contrast, and reduced-motion behavior is
  sound;
- mobile and desktop layouts are intentional;
- loading states preserve layout and perceived speed;
- no unnecessary visual dependency or client bundle was introduced;
- a future token-level reskin remains practical.

The source of truth for implemented token values is
`packages/ui/src/styles/tokens.css`. When this document and the code differ,
determine whether the code or the standard is outdated, update them together,
and explain the decision in the change.
