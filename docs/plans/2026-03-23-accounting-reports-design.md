# Accounting Reports Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add 3 new panels to the existing Reports page for P&L tracking, inventory accounting, and bookkeeping summaries. The owner has no formal accounting yet — this is their first structured view of profitability. COGS is calculated purely from ingredient recipes. No manual expense entry needed.

## Approach

Add sections to the existing Reports page (Approach A). Reuses existing date filters, no new routes or nav items.

## Panel 1: Profit & Loss

**Location:** Below the Sales Trend chart.

**KPI strip (4 cards):** Gross Revenue, COGS, Gross Profit, Margin %

**Breakdown table:** Rows grouped by period matching the sales trend selector:
- 7D/30D → daily rows
- 90D → weekly rows

| Period | Revenue | COGS | Gross Profit | Margin % |

Margin % gets color treatment: green > 50%, red < 30%.

**COGS calculation:** For each transaction item sold → look up recipe → sum(ingredient qty per unit x ingredient unit cost x qty sold). Products without recipes = ₱0 COGS.

## Panel 2: Inventory Valuation

**Location:** Below P&L panel.

**KPI strip (4 cards):** Total Inventory Value (current), Period Change, Waste & Shrinkage, Low Stock Items count.

**Two side-by-side sub-panels:**

**Left — Top Ingredients by Value (top 10 table):**
| Ingredient | On Hand | Unit Cost | Total Value | % of Inventory |

Sorted by total value desc. Progress bar on % column.

**Right — Stock Movement Summary (for selected period):**
| Movement Type | Count | Total Cost |

Groups from StockMovement records by MovementType (Purchase, Sale, Waste, Adjustment). Cost = sum(qty x unitCost).

- Total Inventory Value is always current (not date-filtered)
- Period Change and Stock Movement Summary respect the page date filter

## Panel 3: Accountant Summary

**Location:** Bottom of Reports page.

**Purpose:** Print/export-ready snapshot for the accountant.

**Structured card with sections:**

1. **Sales Summary** — Gross Revenue, Less Discounts, Net Revenue, COGS, Gross Profit, Gross Margin %
2. **Transaction Breakdown** — Total count, avg ticket, payment method split (Cash vs GCash)
3. **Sales by Category** — Category name, amount, percentage (from existing category endpoint)
4. **Inventory Snapshot** — Current inventory value, ingredients consumed, waste/shrinkage

**Export:** CSV and Excel buttons generating a clean spreadsheet with the same structure.

All sections respect the page's existing date range filter.

## Backend Changes Required

### New endpoint: `GET /api/reports/profit-loss`
- Params: startDate, endDate
- Returns: { grossRevenue, totalDiscounts, netRevenue, cogs, grossProfit, marginPercent, breakdown: [{ period, revenue, cogs, grossProfit, marginPercent }] }
- COGS calc: join transactions → transaction items → product ingredients → ingredients (for unit cost)

### New endpoint: `GET /api/reports/inventory-valuation`
- Returns: { totalValue, periodChange, wasteAndShrinkage, lowStockCount, topIngredients: [{ name, onHand, unit, unitCost, totalValue, percentOfTotal }], movementSummary: [{ type, count, totalCost }] }
- Params: startDate, endDate (for period change and movement summary only)

### New endpoint: `GET /api/reports/accountant-summary`
- Params: startDate, endDate
- Returns: combined data from profit-loss + category breakdown + inventory snapshot + transaction stats + payment method split

### Existing endpoints reused:
- `GET /api/reports/category` — sales by category
- `GET /api/reports/sales` — revenue and transaction counts

## Data Dependencies

All COGS data depends on:
- **ProductIngredient** (recipe) records existing for products
- **Ingredient.UnitCost** being populated
- Products without recipes will show ₱0 COGS (flagged as "no recipe")

## Design Decisions

- No manual expense entry — COGS from ingredients only
- No labor, rent, or overhead tracking
- Period selector: daily/weekly/monthly, matching existing sales trend UX
- Exports target the accountant summary panel specifically
- Color coding on margins for quick visual health check
