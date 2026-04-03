# Reports Page Production Polish — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Frontend-only restructure and UX improvements to the reports page

## Problem Statement

The reports page has comprehensive data across 5 tabs and 12 API endpoints, but lacks production readiness:

1. **No context** — KPIs show raw numbers with no explanation. "COGS" is jargon. "vs prev period" doesn't name the period.
2. **No actionable insight** — Margin % has no health indicator. No alerts for drops in performance. No trend direction on KPIs.
3. **Visual hierarchy** — Overview tab crams 7 sections. Profitability tab is sparse. Inventory has 4 sub-tabs adding navigation depth.
4. **UX gaps** — Basic HTML date inputs with no presets. No tooltips on any metric. Summary export is minimal.

## Approach

Restructure tabs, add contextual intelligence, and improve data presentation — all using existing backend data. No new API endpoints required.

## Design

### 1. Tab Restructure

Reorganize from 5 tabs + 4 inventory sub-tabs into 4 purpose-driven tabs with no sub-navigation.

| New Tab | Purpose | Content Sources |
|---------|---------|-----------------|
| **Dashboard** | "How's my business?" | Overview KPIs + profitability KPIs + new insights strip + sales trend chart |
| **Sales** | "What's selling?" | Category/payment breakdowns + top products + recent transactions + leaderboard |
| **Costs** | "Where's money going?" | P&L breakdown + inventory valuation + stock activity + suppliers + consumption |
| **Export** | "Give this to my accountant" | Accountant summary + per-section download cards |

**Migration mapping:**

- **Dashboard** absorbs: Overview KPI strip, period comparison badges, sales trend chart. Promotes gross margin from Profitability tab to a top-level KPI card. Adds new insights strip and profit snapshot.
- **Sales** absorbs: Overview's category breakdown, payment methods, top products, recent transactions. Absorbs entire Leaderboard tab (podium + full rankings).
- **Costs** absorbs: Profitability's P&L KPIs + period breakdown table. Absorbs all 4 Inventory sub-tabs (Overview, Activity, Suppliers, Consumption) as collapsible sections.
- **Export** absorbs: Summary tab's accountant summary. Adds per-section export cards.

### 2. Dashboard Tab

#### KPI Cards (4 cards)

Each KPI card displays:
- **Label** with ⓘ tooltip icon (hover for plain English explanation)
- **Value** (formatted currency or number)
- **Trend arrow + % change** (▲/▼ with green/red color) sourced from period comparison data
- **Comparison date range** (e.g., "vs Mar 17–23" instead of "vs prev period")
- **7-day sparkline** — mini bar chart showing daily values for the last 7 days of the selected range, sourced from `salesTrendData` (already loaded by `loadSalesTrendData()`)

The 4 KPIs:
1. **Revenue** — total sales for the period
2. **Transactions** — completed order count
3. **Avg Order Value** — revenue / transactions
4. **Gross Margin** — margin % from P&L data, with a health bar (color gradient: red 0% → yellow 30% → green 60%+). Shows absolute profit amount as secondary text.

#### Insights Strip

Auto-generated alert cards that appear below KPIs when there's something worth noticing. Computed entirely on the frontend from existing API data (period comparison + P&L + inventory valuation).

**Severity levels:**

| Level | Color | Conditions |
|-------|-------|------------|
| Positive (green) | `rgba(76,175,80,*)` | Revenue up >5%, transaction count up >5%, margin above 60% |
| Warning (amber) | `rgba(255,152,0,*)` | Revenue down 5–15%, margin 30–50%, margin dropped >3 points vs previous period, waste cost up >10% vs previous period |
| Alert (red) | `rgba(255,107,107,*)` | Revenue down >15%, margin below 30%, low stock items >3 |
| Info (neutral) | `rgba(255,255,255,*)` | Best-selling product changed, new category appeared, all metrics stable |

Each insight card shows:
- Severity icon
- One-line headline (e.g., "Gross margin dropped 3 points to 62%")
- One-line detail with context (e.g., "Check ingredient costs — cost of goods increased faster than revenue")

When all metrics are stable, show a single green "All clear" badge instead.

The strip is collapsible so returning users can dismiss it.

**Data sources for insight generation:**
- `periodComparison` — sales/transaction/avg order % changes
- `profitLossData` — margin %, COGS
- `inventoryData` — waste amount, low stock count
- `consumptionData` — total consumed cost (for waste comparison)

#### Profit Snapshot (new)

A compact 2-column section below the sales trend chart:
- **Left card:** Revenue → Cost of Goods → Gross Profit (simple waterfall-style breakdown)
- **Right card:** Quick stats — top product name, top category, payment method split (one line each)

#### Sales Trend Chart

Existing bar chart with 7D/30D/90D selector. No changes to functionality or appearance.

### 3. Sales Tab

Layout order (all date-filtered except leaderboard):

1. **Revenue by Category + Payment Methods** — side by side (existing cards, moved from Overview)
2. **Top Products + Recent Transactions** — side by side (existing cards, moved from Overview)
3. **Divider**
4. **All-Time Leaderboard** — podium + full rankings with search/sort/category filter (existing, moved from Leaderboard tab). Gets a prominent **"Lifetime data — not affected by date filter"** badge so users understand the date picker doesn't apply.

No changes to the internal content or functionality of any section.

### 4. Costs Tab

Single scrollable view with 5 collapsible sections. Each section header shows:
- Expand/collapse chevron (▼/▶)
- Section title
- Brief description
- **Summary stat on the right** (visible even when collapsed, for quick scanning)

| Section | Default State | Summary Stat | Content |
|---------|--------------|--------------|---------|
| **Profit & Loss** | Expanded | "₱7,719 profit · 62% margin" | P&L KPI strip (Revenue, Cost of Goods, Gross Profit, Margin) + period breakdown table |
| **Inventory Valuation** | Expanded | "₱24,500 value · 2 low stock" | Inventory KPI strip + top ingredients table + movement summary |
| **Stock Activity** | Collapsed | "+₱X in · -₱Y out" | Movement ledger with type/search filters, table, footer summary |
| **Suppliers** | Collapsed | "N suppliers" | Spend by supplier table + cost comparison for multi-supplier ingredients |
| **Consumption** | Collapsed | "₱X consumed" | Consumption KPI strip + consumption ranking table |

**Key change:** "COGS" label is renamed to "Cost of Goods" everywhere in this tab, with a tooltip: "The cost of ingredients used to make the products you sold."

No changes to the internal content of any section — tables, filters, and data stay the same.

### 5. Export Tab

Two sections:

#### Accountant Summary (existing, enhanced layout)

The existing accountant summary card, now displayed in a 2x2 grid layout:
- Sales Summary (top-left)
- Transaction Breakdown (top-right)
- Sales by Category (bottom-left)
- Inventory Snapshot (bottom-right)

Adds a **Print** button alongside the existing layout.

#### Download Reports (new)

A 2x2 grid of export cards:

| Card | Description | Formats |
|------|-------------|---------|
| **Full Report** | Complete summary — all sections in one file | CSV, Excel |
| **Sales Detail** | Transaction-level data with items, payments, timestamps | CSV, Excel |
| **Profit & Loss** | Period breakdown with revenue, costs, margins | CSV, Excel |
| **Inventory & Stock** | Movements, consumption, supplier costs | CSV, Excel |

Each card shows an icon, title, one-line description, and format buttons.

Export logic generates data from the already-loaded report data (accountant summary, P&L, inventory, activity movements). No additional API calls needed.

### 6. Date Picker Enhancement

Add a row of quick preset buttons before the existing date inputs:

- **Today** (default active)
- **7 Days**
- **30 Days**
- **This Month**
- **Last Month**

Clicking a preset sets the start/end dates and marks `isCustomDateRange = false`. Using the manual date inputs marks the active preset as none and `isCustomDateRange = true`. The existing "Today" reset button can be removed since it's now a preset.

### 7. Tooltip System

Every metric label across all tabs gets an ⓘ icon with a native HTML `title` attribute tooltip.

Implementation: a `METRIC_TOOLTIPS` constant record in the reports component mapping metric keys to plain English strings.

**Tooltip definitions:**

| Metric | Tooltip |
|--------|---------|
| Revenue | "Total sales amount before subtracting costs" |
| Transactions | "Number of completed orders" |
| Avg Order Value | "Average amount spent per order" |
| Gross Margin | "Percentage of revenue kept after ingredient costs. Higher is better." |
| Cost of Goods | "Cost of ingredients used to make the products you sold" |
| Gross Profit | "Revenue minus cost of goods — what you actually earned" |
| Net Revenue | "Revenue after discounts are subtracted" |
| Period Change | "How much inventory value changed during this period" |
| Waste / Shrinkage | "Value of ingredients lost to waste, spoilage, or unaccounted use" |
| Low Stock | "Number of ingredients below their minimum stock level" |
| Average Ticket | "Average revenue per transaction" |
| Avg Daily | "Average quantity used per day in this period" |
| % of Total | "This item's share of the total cost" |

No tooltip library — native `title` attributes keep the bundle small.

### 8. Jargon Cleanup

| Before | After | Context |
|--------|-------|---------|
| COGS | Cost of Goods | Label text everywhere (P&L KPIs, breakdown table, accountant summary) |
| Avg Value | Avg Order Value | Dashboard KPI label |
| Top Product | Best Seller | Dashboard KPI (if kept as quick stat) |
| vs prev period | vs [actual dates] | Period comparison badges — use formatted date range of previous period |

## What Does NOT Change

- All existing API endpoints and backend logic
- Table structures, column definitions, and data formatting inside sections
- Chart implementation (bar chart stays as-is)
- Transaction details modal
- Filter/sort/search functionality in leaderboard and activity sections
- Authentication and role-based access

## Files Affected

**Frontend only:**

| File | Changes |
|------|---------|
| `reports.component.ts` | Tab enum change (overview/leaderboard/profitability/inventory/summary → dashboard/sales/costs/export). Add insights generation logic, date presets, collapsible section state, export methods. Add `METRIC_TOOLTIPS` constant. |
| `reports.component.html` | Restructure tab content into 4 tabs. Add KPI sparklines + trend arrows + tooltips. Add insights strip. Replace inventory sub-tabs with collapsible sections. Add export cards. Add date preset buttons. |
| `reports.component.css` | New styles for: sparklines, health bar, insights strip, collapsible section headers, export cards, date presets, tooltip icons. Remove inventory sub-tab styles. |

No new components, services, or backend changes needed.
