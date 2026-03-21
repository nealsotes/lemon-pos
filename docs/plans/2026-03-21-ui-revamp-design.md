# UI Revamp Design — Modern Desktop App Feel

**Date:** 2026-03-21
**Goal:** Revamp QuickServe POS UI to feel like a modern native desktop app (Notion/Linear/Spotify style) with reusable shared components, violet accent on neutral surfaces, and a thin icon rail navigation.

---

## Design Decisions

- **Style:** Modern desktop app hybrid — clean, dense, flat surfaces, 1px borders over shadows
- **Navigation:** 56px icon rail (left), expands to 200px on hover/toggle. Bottom tab bar on mobile.
- **Color:** Neutral grays + violet accent (`#7C3AED` light / `#8B5CF6` dark)
- **POS grid:** Dense cards (~120px tall), 8 cols wide → 2 cols mobile
- **Approach:** Component-first — build shared `ui/` library, then re-compose each page

---

## 1. Design Tokens

### Colors

| Token | Light | Dark |
|---|---|---|
| `--bg-app` | `#FAFAFA` | `#0F0F0F` |
| `--bg-surface` | `#FFFFFF` | `#1A1A1A` |
| `--bg-surface-raised` | `#FFFFFF` | `#222222` |
| `--bg-surface-overlay` | `#FFFFFF` | `#2A2A2A` |
| `--bg-subtle` | `#F5F5F5` | `#141414` |
| `--border` | `#E5E5E5` | `#2A2A2A` |
| `--border-strong` | `#D4D4D4` | `#3A3A3A` |
| `--text-primary` | `#171717` | `#FAFAFA` |
| `--text-secondary` | `#525252` | `#A3A3A3` |
| `--text-muted` | `#A3A3A3` | `#525252` |
| `--accent` | `#7C3AED` | `#8B5CF6` |
| `--accent-hover` | `#6D28D9` | `#7C3AED` |
| `--accent-subtle` | `#F5F3FF` | `#7C3AED1A` |
| `--success` | `#16A34A` | `#22C55E` |
| `--warning` | `#D97706` | `#FBBF24` |
| `--danger` | `#DC2626` | `#F87171` |

### Typography

- Display font: **Sora** (page titles)
- UI font: **Plus Jakarta Sans** (everything else)
- Page titles: 20px/600 Sora
- Section headers: 14px/600 Plus Jakarta
- Body: 13px/400 Plus Jakarta
- Labels: 11px/500 Plus Jakarta, uppercase, tracked

### Spacing

4px base grid: `4, 8, 12, 16, 20, 24, 32, 40, 48`

### Radius

- Inputs/buttons: `4px`
- Cards/panels: `8px`
- Modals/overlays: `12px`

### Shadows (minimal)

- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.05)`
- `--shadow-md`: `0 2px 8px rgba(0,0,0,0.08)`
- `--shadow-lg`: `0 8px 24px rgba(0,0,0,0.12)`

### Visual Rules

- 1px borders for separation, not shadows
- No gradients on surfaces — flat colors only
- Hover: background shift, not color change
- Active nav: violet left-border + tinted icon + accent-subtle bg
- Remove falling hearts animation

---

## 2. App Shell

### Nav Rail (Desktop ≥1025px)

- **Width:** 56px collapsed, 200px expanded
- **Top:** App logo/icon (no text when collapsed)
- **Items:** 40px icon buttons with tooltips (collapsed) or labels (expanded)
- **Nav items:** POS, Cart, Products, Inventory, Reports, Settings (role-gated)
- **Bottom pinned:** Theme toggle, Logout
- **Active:** 3px left border `--accent`, icon `--accent`, bg `--accent-subtle`
- **Hover:** `--bg-subtle` background

### Top Bar (48px)

- Left: Page title (20px Sora)
- Right: Context actions per page (search, filters, buttons)
- 1px bottom border `--border`
- Inherits `--bg-app`

### Mobile (≤768px)

- Rail disappears, replaced by 56px bottom tab bar
- 5 tabs: POS, Cart, Stock, Reports, Settings
- Active: violet icon + label. Inactive: muted icon only
- Cart badge count when items > 0
- Overflow items (logout, theme) in `⋮` menu in top bar

---

## 3. Shared UI Components (`shared/ui/`)

### Buttons — `ButtonComponent`

| Variant | Use |
|---|---|
| primary | Main actions |
| secondary | Cancel, back |
| ghost | Toolbar, inline actions |
| danger | Destructive actions |
| icon-only | 32px compact toolbar buttons |

Sizes: `sm` (28px), `md` (32px), `lg` (36px). Radius 4px. Loading spinner state.

### Cards

- `CardComponent` — Generic surface, 1px border, 8px radius. Header/body/footer slots.
- `KpiCardComponent` — Label (11px muted), value (20px bold), optional trend (↑↓ colored).
- `ProductCardComponent` — Dense POS card: 60px image left, name+price right, `+` button. ~120px tall.

### Data Display

- `DataTableComponent` — Sortable, sticky header, hover rows, 1px row borders. Column content projection.
- `BadgeComponent` — Status pills: success/warning/danger/neutral. 11px uppercase, 4px radius.
- `EmptyStateComponent` — Centered icon + message + optional action.

### Form Controls

- `InputComponent` — 32px height, 1px border, focus ring `--accent`. Prefix icon, error state.
- `SelectComponent` — Same styling, custom chevron.
- `SearchInputComponent` — Magnifying glass icon, clear button, debounced output.
- `ChipGroupComponent` — Horizontal scrollable category chips. Active chip: `--accent` bg.

### Feedback & Overlay

- `ModalComponent` — Backdrop blur, 12px radius, max-width 480px. Header/body/footer slots. Slide-up drawer on mobile.
- `ToastComponent` — Top-right slide-in, auto-dismiss. Success/error/info variants.
- `ConfirmDialogComponent` — Modal with Cancel/Confirm for destructive actions.

### Layout

- `PageContainerComponent` — Standardized 24px padding, max-width, scroll.
- `SectionComponent` — Optional title (14px/600), 16px bottom margin.
- `KpiStripComponent` — Responsive grid of KpiCards, 4→2 cols.

**Total: ~18 shared components**

---

## 4. Page Layouts

### POS

- Top bar: title + SearchInput + grid density toggle
- ChipGroup for categories below top bar
- Dense product grid: 8/6/4/2 columns by breakpoint
- ProductCardComponent: 60px image, name, price, `+` icon button
- Out of stock: `opacity: 0.5` + badge + disabled button
- Low stock: warning badge

### Cart

- Max-width 640px centered
- Card per item: name, add-ons, inline quantity stepper (−/+), price, trash icon
- Swipe-to-delete on mobile
- Summary at bottom: subtotal, VAT, total. 1px top border.
- Two buttons: Back to POS (secondary), Checkout (primary)

### Checkout

- Two-column on desktop (60/40): left = form + payment, right = sticky order summary
- Single column stacked on mobile
- Customer name input, payment method radio cards (Cash/QR)
- Quick amount buttons grid
- Single primary action button: "Complete ₱XXX"

### Products (Admin)

- KpiStrip: Total, Value, Low Stock, Out of Stock
- ChipGroup for categories
- DataTable: Name, Category, Price, Stock, Actions (edit/delete ghost icon buttons)
- `+ Add` opens Modal with product form

### Inventory

- KpiStrip: Total Items, Value, Low Stock, Expiring
- Tab toggle: Ingredients / Recipes (ChipGroup or tabs)
- DataTable per tab
- Recipes: expandable rows (product → ingredient list)
- `+ Add` opens Modal

### Reports

- Top bar: date range picker (From/To inputs + "Today" quick button)
- KpiStrip: Revenue, Transactions, Avg Order, Trend
- Chart section in Card container
- Two-column leaderboard: Top Products, Top Categories

### Settings

- Sections: Store Info, Receipt Settings, Tax Config
- Form using InputComponent/SelectComponent inside SectionComponents
- Save button at bottom

### Login

- Centered Card (400px max) on `--bg-app` background
- Logo + "Sign in to Lemon POS"
- InputComponents for username/password, full-width primary button
- No decorative elements

---

## 5. Responsive Breakpoints

| Token | Width | POS grid | Layout |
|---|---|---|---|
| `mobile` | ≤640px | 2 cols | Single column, bottom tabs, drawer modals |
| `tablet` | 641–1024px | 4 cols | Side-by-side checkout, bottom tabs |
| `desktop` | 1025–1440px | 6 cols | Rail nav, two-column layouts |
| `wide` | 1441px+ | 8 cols | Rail nav, spacious grids |

---

## 6. Interaction & Motion

- All targets: min 40px (44px mobile)
- Hover states via `@media (hover: hover)` only
- Rail expand: 200ms ease-out
- Modal open: 150ms fade + scale(0.95→1)
- Toast: 200ms slide-in
- Card hover: 100ms bg transition only (no transforms)
- Nothing over 200ms
- `@media (prefers-reduced-motion)` disables all transitions

### Accessibility

- Visible focus ring: 2px outline, 2px offset, `--accent`
- Escape closes modals
- Tab order: rail → top bar → content
- ARIA labels on icon-only buttons
