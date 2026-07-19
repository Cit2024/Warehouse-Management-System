---
name: منظومة إدارة المخازن
description: Local Electron warehouse-ledger tool for the Misrata Industrial Technical College — Arabic RTL, accounting-grade accuracy over visual flourish.
colors:
  burnt-terracotta: "#C44A00"
  burnt-terracotta-deep: "#A63D00"
  terracotta-tint: "#FFF0E0"
  slate-ink: "#0F172A"
  slate-secondary: "#334155"
  slate-muted: "#64748B"
  surface-card: "#FFFFFF"
  surface-sidebar: "#FAFBFC"
  surface-mist: "#F1F5F9"
  surface-active: "#E2E8F0"
  border-line: "#E2E8F0"
  border-hairline: "#F1F5F9"
  success-forest: "#047857"
  success-tint: "#D1FAE5"
  warning-amber: "#B45309"
  warning-tint: "#FEF3C7"
  danger-crimson: "#B91C1C"
  danger-tint: "#FEE2E2"
  info-blue: "#1D4ED8"
  info-tint: "#DBEAFE"
typography:
  h1:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  h2:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  h3:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.25
  base:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.2px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "20px"
  full: "50%"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.burnt-terracotta}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.burnt-terracotta-deep}"
  button-secondary:
    backgroundColor: "{colors.surface-mist}"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.md}"
  badge-success:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success-forest}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-crimson}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  input-field:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  panel-surface:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
---

# Design System: منظومة إدارة المخازن (Warehouse Management System)

## 1. Overview

**Creative North Star: "The Ledger Desk"**

Picture a warehouse clerk's desk at the Misrata Industrial Technical College: ruled tables, stamped receipts, a stock badge that tells you at a glance whether a disbursement is even possible. Nothing on the desk is there to impress a visitor — it's there so the clerk closes the books correctly, every time, without a second look at the screen. That's the register this system lives in: **product**, not brand. Design serves the transaction; it never competes with it.

The system is built almost entirely from cool, low-chroma neutrals (`slate-ink` text on `surface-mist`/`surface-card` backgrounds) with a single warm accent — `burnt-terracotta` — reserved for the handful of moments that need to grab attention: the active sidebar item, a focused input, a "select this" badge. Semantic color (success/warning/danger/info) carries its own fixed hue family and is never substituted for the brand accent, because in this app color is also information: a red badge means "out of stock," not "this is important."

This system explicitly rejects: SaaS-style hero metrics and identical icon-card grids (there are no big animated numbers anywhere — `--font-hero: 32px` exists in the token scale as a ceiling and is deliberately unused), dark mode (a daytime office tool, not a developer console), glassmorphic decoration, gradients as decoration (`--primary-gradient` is defined and, like `--font-hero`, intentionally dead — grep the codebase and it's used nowhere), and side-stripe accent borders. Status is never color-only: every badge pairs its color with text, and icons carry meaning independent of hue.

**Key Characteristics:**
- One accent color, used sparingly — accent for *action/selection*, semantic hues for *state*.
- Flat structural chrome (sidebar, header, page background); soft elevation only on floating content (cards, panels, modals, toasts).
- Single sans-serif family across the entire type scale — no display/body pairing, because the register doesn't call for one.
- Every animation respects `prefers-reduced-motion`, globally, by design.
- RTL-first: `direction: rtl` on `<body>`, with `.sidebar` itself set to `ltr` at the container level so its physical position (`right: 0`) stays fixed while its content reads RTL.

## 2. Colors

Restrained strategy: tinted neutrals carry the interface; **Burnt Terracotta** is the only saturated color, and it appears on a small minority of any given screen.

### Primary
- **Burnt Terracotta** (`#C44A00`): the one accent. Used for the active sidebar item, focus rings/borders on inputs, primary buttons, the stock-availability badge on the dispense page, and category-value bar fills. It marks "this is the one actionable/selected thing here" — never used decoratively.
- **Burnt Terracotta Deep** (`#A63D00`): hover/active state for primary buttons only. Never a standalone surface color.
- **Terracotta Tint** (`#FFF0E0`): the accent's background form — sidebar brand icon, active-nav background, department badges, stock badge, modal icon circle. Always paired with Burnt Terracotta or Burnt Terracotta Deep as the foreground.

### Neutral
- **Slate Ink** (`#0F172A`): primary text, body copy, table cell text. The default reading color for everything that matters.
- **Slate Secondary** (`#334155`): secondary text — subtitles, table headers, secondary buttons' label color.
- **Slate Muted** (`#64748B`): tertiary text, placeholder text, meta labels, disabled/quiet icons. This is also the WCAG-verified placeholder color (≥4.5:1 against white) — never substitute a lighter gray here.
- **Surface Card** (`#FFFFFF`): cards, panels, modals, the top header, table containers — every "floating" surface.
- **Surface Sidebar** (`#FAFBFC`): the sidebar's own background, a hair darker than pure white so it reads as a distinct plane without a shadow.
- **Surface Mist** (`#F1F5F9`): page body background and hover backgrounds (`bg-body` and `bg-hover` share this exact value deliberately — hovering a row should feel like "the page showing through," not a new color).
- **Surface Active** (`#E2E8F0`): pressed/active button backgrounds, dividers under the sidebar footer.
- **Border Line** (`#E2E8F0`): default 1px borders — cards, inputs, table rows, dividers.
- **Border Hairline** (`#F1F5F9`): the quietest divider — panel-header underline, subtle table borders where `border-line` would be too loud.

### Semantic
- **Success Forest** (`#047857`) / tint `#D1FAE5`: available stock, admin role badge, success toast/alert.
- **Warning Amber** (`#B45309`) / tint `#FEF3C7`: low-stock badge, storekeeper role badge, warning toast/alert.
- **Danger Crimson** (`#B91C1C`) / tint `#FEE2E2`: out-of-stock badge, dispense-transaction badge, delete actions, danger toast/alert.
- **Info Blue** (`#1D4ED8`) / tint `#DBEAFE`: supply-transaction badge, supplier badge, viewer role badge, info toast/alert.

### Named Rules
**The One Accent Rule.** Burnt Terracotta is reserved for action and selection (buttons, focus, active nav, "this is chosen"). It is never used to mean a state — that vocabulary belongs entirely to the four semantic hues. If a new element needs to say "success" or "low stock," reach for the semantic palette, not the brand accent.

**The Color-Plus-Text Rule.** No status is ever conveyed by hue alone (PRODUCT.md, Accessibility & Inclusion). Every badge, alert, and status dot ships with a text label or icon that stands on its own if color is stripped out.

## 3. Typography

**Body Font:** 'Segoe UI', 'Cairo', 'Tajawal', Tahoma, Geneva, Verdana, sans-serif
**Display Font:** none — the same stack serves every role.

**Character:** One typeface, one voice. Cairo and Tajawal are the Arabic-optimized links in the fallback chain; Segoe UI leads for Latin/numeral rendering on Windows. There is no second "display" family because nothing on this desk needs to announce itself — hierarchy here comes from size and weight, not from switching fonts.

### Hierarchy
- **H1** (700, 24px, 1.25): page titles only (`.header-title-section h1`) — one per page.
- **H2** (700, 20px, 1.25): modal-center titles, section headers that need more weight than H3.
- **H3** (700, 16px, 1.25): panel titles, modal titles — the most common heading size in the app.
- **Base** (400, 14px, 1.6): the document default (`body`); anything not otherwise styled inherits this.
- **Body** (400, 13px, 1.5): table cells, form inputs, button labels, card text — the actual working-data size.
- **Label** (600, 12px, letter-spacing 0.2px): table headers, nav-section titles, badges, stat labels — always uppercase-weight-heavy but never `text-transform: uppercase` (PRODUCT.md favors direct Arabic script over stylized casing, which doesn't apply to Arabic script anyway).

### Named Rules
**The Dead Hero Rule.** `--font-hero: 32px` is defined in the token scale and used nowhere. It exists so a future contributor has a documented ceiling if a genuine need arises — not an invitation to build a SaaS-style big-number hero. Adding a new use of `--font-hero` should be treated as a design decision requiring the same scrutiny as adding a new color.

## 4. Elevation

Flat by default, soft lift on floating surfaces. Structural chrome — the sidebar, the top header, the page background — carries no shadow at all; it sits at the same visual plane as the page. Only content that floats above that plane (stat cards, panels, table containers, modals, toasts) gets a shadow, and even then the shadows are deliberately soft (6–10% alpha) rather than the harsh drop-shadows that read as "2014 Bootstrap."

### Shadow Vocabulary
- **Shadow SM** (`0 1px 3px rgba(0,0,0,0.06)`): stat cards, table containers, panels — the resting state of every floating surface.
- **Shadow MD** (`0 4px 12px rgba(0,0,0,0.08)`): reserved for hover/interactive lift where a slightly stronger cue is warranted (currently unused in favor of border-color shifts on hover — kept in the scale for future interactive surfaces).
- **Shadow LG** (`0 8px 24px rgba(0,0,0,0.10)`): modals and toasts — the two surface types that genuinely sit "above" everything else and need the strongest separation.
- **Shadow Focus** (`0 0 0 3px rgba(196,74,0,0.6)`): the focus ring on form inputs. Not decorative elevation — a WCAG 2.4.11-compliant focus indicator, paired with `:focus-visible { outline: 2px solid var(--primary) }` everywhere else. The alpha was deliberately raised from an earlier 0.15 (≈1.1:1 contrast, effectively invisible) to 0.6 (≥3:1) — never lower it back.

### Named Rules
**The Flat-Chrome Rule.** Sidebar, header, and page background never receive a `box-shadow`. If a component needs visual separation from its neighbor, reach for a `border` (`border-line` or `border-hairline`) before reaching for elevation.

## 5. Components

Efficient and unambiguous: every control looks exactly like what it does, and nothing is styled to look more important than its actual role in the transaction.

### Buttons
- **Shape:** 8px radius (`--btn-radius`), matching input fields so a form's buttons and fields read as one system.
- **Primary** (`.btn-primary`): `burnt-terracotta` background, white text, semibold. Hover darkens to `burnt-terracotta-deep` plus `shadow-sm` — the only button variant that gains a shadow on hover, marking it as the page's one "commit" action.
- **Secondary** (`.btn-secondary`): `surface-mist` background, `slate-secondary` text, 1px `border-line`. The default choice for "cancel," "back," or any non-primary action.
- **Ghost** (`.btn-ghost`): transparent background, `slate-secondary` text, transparent border that becomes `surface-mist` on hover. Used for icon-only row actions and low-emphasis toolbar buttons.
- **Semantic buttons** (`.btn-success` / `.btn-danger` / `.btn-warning`): solid semantic-hue background, white text — reserved for actions whose consequence matches the hue (e.g. void/delete = danger).
- **Sizes:** `.btn-sm` (6px/12px padding, `--input-radius`), default, `.btn-lg` (14px/28px padding, `--card-radius`). `.btn-icon` is a fixed 36×36px square for icon-only buttons.

### Badges
- **Style:** pill shape (20px radius), 2px/10px padding, 11px/600-weight text, always tint-background + solid-hue text (never solid-background badges — the tint keeps them from competing with buttons for visual weight).
- **Roles:** stock availability (`badge-available`/`badge-low`/`badge-out`), transaction type (`badge-supply`/`badge-dispense`), entity type (`badge-supplier`/`badge-dept`), and role badges (`role-badge.admin`/`.storekeeper`/`.viewer`) all share this exact shape — only the color pair changes.
- **Stock Badge:** the one badge that breaks the small-pill pattern deliberately — `stock-badge` uses body-size bold text and more generous padding (6px/14px) because on the dispense page it answers the single most consequential question on screen ("can this transaction happen at all").

### Cards / Panels
- **Corner Style:** 12px radius (`--card-radius`) for stat cards, panels, table containers, modals.
- **Background:** `surface-card` (white), always.
- **Shadow Strategy:** `shadow-sm` at rest; see Elevation.
- **Border:** 1px `border-line` on stat cards and table containers; panels use both border and shadow together (slightly more "floating" than a stat card).
- **Internal Padding:** panel-header/body use `space-5`/`space-6` (20px/24px); stat cards use `space-5` (20px) uniformly.
- **Never nested.** A card inside a card is not a pattern this system uses — the `category-value-list` inside the dashboard's "Top Categories" panel is a plain list, not nested cards, precisely to avoid this.

### Inputs / Fields
- **Style:** 1px `border-line`, 8px radius (`--input-radius`), white background, 13px body text, 10px/12px padding.
- **Focus:** border shifts to `burnt-terracotta`, plus the `shadow-focus` ring (3px, 60% alpha) — never color alone.
- **Error:** border shifts to `danger-crimson`; the paired `.error-message` (12px, danger-crimson) is shown below the field, never a color-only signal.

### Navigation (Sidebar)
- **Style:** fixed-position, right-anchored (`right: 0`), 240px wide, `surface-sidebar` background, no shadow (flat-chrome rule) — separated from content by a single left border only.
- **Menu items:** 10px/16px padding, 8px radius, `slate-secondary` text at rest, `bg-hover` (`surface-mist`) on hover, `terracotta-tint` background + `burnt-terracotta` text + semibold when active. The active state is the only place in the nav where the brand accent appears.
- **Mobile:** below 768px the sidebar becomes an off-canvas overlay (`transform: translateX(100%)` when closed, `translateX(0)` when `.open`), triggered by a toggle button that should sit adjacent to the sidebar's own edge (right side, RTL) rather than clustered with unrelated header actions (logout/refresh) at the opposite side — the toggle's proximity to what it opens is itself a wayfinding cue.

### Modals
- **Corner Style:** 12px radius, max-width 520px (440px for `.modal-sm`).
- **Backdrop:** `slate-ink` at 50% opacity plus 4px blur — the one deliberate, purposeful use of `backdrop-filter` in the system (not decorative glassmorphism; it exists to visually demote everything behind the modal).
- **Center variant** (`.modal-center`, used for confirm dialogs): centered text, a 64px circular icon in `terracotta-tint`/`burnt-terracotta`, used for the app's custom `confirmModal()` — replacing native `confirm()`/`alert()` everywhere so destructive actions (restore, delete, void, logout) get a consistent, dismissable, keyboard-accessible dialog instead of a blocking OS-native prompt.

### Toast
- **Style:** fixed top-center, white background, 1px border, `shadow-lg`, 12px radius, slides in from `translateY(-10px)` while staying horizontally centered throughout the animation.
- **Variants:** `toast-success`/`-error`/`-warning`/`-info` each tint both the border and background to their semantic hue's tint color, with a matching icon color — text stays `slate-ink` for readability regardless of variant.

## 6. Do's and Don'ts

### Do:
- **Do** keep Burnt Terracotta to a small minority of any screen's surface area — it marks action/selection, not decoration (The One Accent Rule).
- **Do** pair every status badge, alert, and toast with a text label or icon, never color alone (PRODUCT.md: "status never conveyed by color alone").
- **Do** use `border-line`/`border-hairline` for separation between flat chrome elements before reaching for a shadow (The Flat-Chrome Rule).
- **Do** respect `prefers-reduced-motion` on every new animation — the global override in `main.css` already covers this, but don't build motion that assumes it will always run.
- **Do** keep the single sans-serif stack for every new UI surface; don't introduce a second family "for hierarchy" when weight/size already does the job.

### Don't:
- **Don't** add dark mode. PRODUCT.md is explicit: this is a daytime office tool, not a developer console.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards, list items, or alerts.
- **Don't** use `background-clip: text` gradient text, or reintroduce `--primary-gradient` as a decorative fill — it's defined and dead on purpose.
- **Don't** build a SaaS-style hero metric (big animated number + small label + gradient accent). `--font-hero` exists as a ceiling, not an invitation.
- **Don't** nest cards inside cards. If a panel needs internal structure, use a plain list or table, not a smaller card.
- **Don't** use glassmorphism decoratively. The one `backdrop-filter: blur(4px)` in the system exists on the modal backdrop for a functional reason (demoting background content), not for a frosted-glass look.
- **Don't** let muted gray text drop below 4.5:1 contrast for body/placeholder text. `slate-muted` (#64748B) is already the floor — don't introduce a lighter gray "for elegance."
