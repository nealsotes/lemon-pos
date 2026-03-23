# Admin Pages Refactor — Implementation Plan

**Design doc:** `docs/plans/2026-03-22-admin-pages-refactor-design.md`
**Approach:** Page-driven (B) — upgrade shared components as product management demands, then apply to inventory and reports.

---

## Phase 1: Shared Component Upgrades

These must be done before any page refactoring. Each step is independently buildable and testable.

### Step 1.1 — Create `CellDefDirective` for data table

**Files:**
- CREATE `frontend/src/app/shared/ui/data-table/cell-def.directive.ts`

**What:**
- Structural directive that tags an `ng-template` with a column name
- Exposes `$implicit` context (the row data) via `let-row`
- Used by DataTableComponent via `@ContentChildren(CellDefDirective)`

```typescript
@Directive({ selector: '[cellDef]' })
export class CellDefDirective {
  @Input('cellDef') columnName = '';
  constructor(public templateRef: TemplateRef<any>) {}
}
```

**Test:** Unit test that directive captures templateRef and columnName.

---

### Step 1.2 — Rebuild `DataTableComponent`

**Files:**
- EDIT `frontend/src/app/shared/ui/data-table/data-table.component.ts`

**What:**
- Add to `TableColumn` interface: `sortable?: boolean`, `cellTemplate?: string`
- Add `@ContentChildren(CellDefDirective)` to collect cell templates
- Add `@Input() clickable: boolean`, `@Input() emptyIcon/emptyTitle/emptyMessage/emptyAction`
- Add `@Output() rowClick`, `@Output() sortChange`, `@Output() emptyActionClick`
- Template: render `<thead>` from columns, `<tbody>` rows via `*ngFor`, resolve cell content by checking if column has a matching cellDef template, else render `row[column.key]` as text
- Bake in: `overflow-x: auto`, `@media (pointer: coarse)` row padding, clickable row hover/cursor, horizontal scroll with `min-width` on table
- Delegate empty state to existing `EmptyStateComponent`

**Test:** Render table with 2 plain columns + 1 custom template column. Verify row click emits. Verify empty state shows.

---

### Step 1.3 — Add `ControlValueAccessor` to `InputComponent`

**Files:**
- EDIT `frontend/src/app/shared/ui/input/input.component.ts`

**What:**
- Implement `ControlValueAccessor` interface: `writeValue`, `registerOnChange`, `registerOnTouched`, `setDisabledState`
- Add `NG_VALUE_ACCESSOR` provider
- Inject `NgControl` via `@Optional() @Self()` to read validation errors from parent FormControl
- Auto-display error messages mapped from validator keys:
  - `required` → "This field is required"
  - `minlength` → "Must be at least {requiredLength} characters"
  - `min` → "Must be at least {min}"
  - `email` → "Invalid email address"
- Add optional `@Input() errors: Record<string, string>` to override default messages
- Add `@Input() required: boolean` for visual asterisk on label
- Bake in `@media (pointer: coarse)` touch sizing (min-height 44px, larger font)
- Keep existing `@Input() label, placeholder, type, prefixIcon`
- Remove `@Input() error` and `@Output() valueChange` (replaced by CVA)

**Test:** Use inside a `FormGroup` with `formControlName`. Verify value binding, validation display, touched state.

---

### Step 1.4 — Add `ControlValueAccessor` to `SelectComponent`

**Files:**
- EDIT `frontend/src/app/shared/ui/select/select.component.ts`

**What:**
- Same CVA pattern as InputComponent
- `NG_VALUE_ACCESSOR` provider
- Inject `NgControl` for validation errors
- Auto error display
- Add `@Input() required: boolean`
- Bake in touch sizing
- Keep `@Input() label, options, placeholder`
- Remove `@Input() value` and `@Output() valueChange` (replaced by CVA)

**Test:** Use inside a `FormGroup` with `formControlName`. Verify selection binding, required validation.

---

### Step 1.5 — Create `LoadingSpinnerComponent`

**Files:**
- CREATE `frontend/src/app/shared/ui/loading-spinner/loading-spinner.component.ts`

**What:**
- `@Input() message: string` (optional)
- Inline template: centered flex container with animated SVG circle + message text
- Inline styles: spinner animation, muted text color, centered layout
- Reuses the exact SVG from current product-management loading state

**Test:** Render with and without message. Verify SVG animates.

---

### Step 1.6 — Create `StockIndicatorComponent`

**Files:**
- CREATE `frontend/src/app/shared/ui/stock-indicator/stock-indicator.component.ts`

**What:**
- `@Input() stock: number`
- `@Input() threshold: number` (default 10)
- `@Input() maxStock: number` (default 100)
- Computed: percentage = `min(stock / maxStock * 100, 100)`
- Computed: status = stock === 0 ? 'low' : stock <= threshold ? 'medium' : 'high'
- Template: stock number (colored by status) + progress bar (colored by status)
- Styles: inline, matches existing stock bar design (3px bar, success/warning/error colors)

**Test:** Render with stock=0 (low/red), stock=5/threshold=10 (medium/warning), stock=50 (high/green).

---

### Step 1.7 — Create `FilterBarComponent`

**Files:**
- CREATE `frontend/src/app/shared/ui/filter-bar/filter-bar.component.ts`

**What:**
- `@Input() searchPlaceholder: string`
- `@Input() searchValue: string`
- `@Input() sortOptions: { value: string, label: string }[]`
- `@Input() sortValue: string`
- `@Input() categories: string[]` (optional)
- `@Input() selectedCategory: string`
- `@Output() searchChange`, `sortChange`, `categoryChange`
- Template: wraps `SearchInputComponent` + native `<select>` for sort + `ChipGroupComponent` (if categories provided)
- Layout: flex row on desktop, stacks vertically at 768px
- Styles: section-header pattern with border-bottom, category chips row below

**Test:** Render with and without categories. Verify all 3 outputs emit.

---

## Phase 2: Refactor Product Management

### Step 2.1 — Replace loading spinner

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.css` (delete `.loading-container`, `.loading-spinner`, `.spinner`, `@keyframes spin`, `.loading-text`)
- EDIT `product-management.component.ts` (add `LoadingSpinnerComponent` to imports)

**What:** Replace inline SVG loading block (lines 20-32) with `<app-loading-spinner message="Loading products..." />`.

---

### Step 2.2 — Replace KPI strip

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.ts` (add `KpiStripComponent` to imports, build `kpiItems` array)
- EDIT `product-management.component.css` (delete `.kpi-strip`, `.kpi-card`, `.kpi-label`, `.kpi-value`, `.kpi-sub`, `.trend-down`)

**What:** Replace inline KPI HTML (lines 37-62) with `<app-kpi-strip [kpis]="kpiItems">`. Build `kpiItems` getter in TS that maps the existing calculation methods to `KpiItem[]`.

---

### Step 2.3 — Replace filter bar (search + sort + chips)

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.ts` (add `FilterBarComponent` to imports, wire events)
- EDIT `product-management.component.css` (delete `.section-header`, `.section-title-group`, `.section-title`, `.section-subtitle`, `.leaderboard-controls`, `.sort-select`, `.category-chips`)

**What:** Replace section-header + search + sort + category-chips blocks with `<app-filter-bar>`. Wire `(searchChange)`, `(sortChange)`, `(categoryChange)` to existing filter methods.

---

### Step 2.4 — Replace data table

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.ts` (add `DataTableComponent`, `CellDefDirective`, `BadgeComponent`, `ImageDisplayComponent`, `StockIndicatorComponent`, `ButtonComponent` to imports; define `columns` array)
- EDIT `product-management.component.css` (delete `.table-wrapper`, `.products-table`, all table th/td styles, `.clickable-row`, `.product-info-cell`, `.product-image-mini`, `.product-text`, `.product-name-text`, `.product-id-text`, `.category-tag`, `.price-text`, `.status-pill`, `.stock-status`, `.stock-num`, `.stock-bar-mini`, `.stock-bar-fill`, `.row-actions`, `.action-btn-mini`)

**What:** Replace entire `<div class="table-wrapper">...<table>...</table></div>` + `<app-empty-state>` with `<app-data-table>` using cell templates for: product (image-display + name), category (badge or tag), price (formatted text), stock (stock-indicator), status (badge), actions (button).

---

### Step 2.5 — Replace form controls

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.ts` (add `InputComponent`, `SelectComponent` to imports)
- EDIT `product-management.component.css` (delete `.form-group`, `.form-group label`, `.form-control`, `.form-control:focus`, `.form-text`, `.error-message`, `.form-checkbox`)

**What:** Replace inline `<div class="form-group"><label>...<input class="form-control">...<div class="error-message">` blocks with `<app-input formControlName="name" label="Product Name" ...>`. Replace category `<select>` with `<app-select>`. Keep image upload section and beverage price toggle as page-specific.

---

### Step 2.6 — Replace buttons + form card

**Files:**
- EDIT `product-management.component.html`
- EDIT `product-management.component.ts` (add `CardComponent` if not already)
- EDIT `product-management.component.css` (delete all `.btn*` styles, `.form-card`, `.form-header`, `.close-btn`, `.form-actions`)

**What:** Replace `<button class="btn btn-primary">` with `<app-button variant="primary">`. Replace `<div class="form-card">` with `<app-card>`. Keep form-grid layout as page-specific CSS (it's specific to this form's field arrangement). Remove inline `style="grid-column: 1 / -1"` — add `.form-full-width` CSS class instead.

---

### Step 2.7 — Clean up product management CSS

**Files:**
- EDIT `product-management.component.css`

**What:** After all replacements, the CSS should only contain:
- `:host` and `.product-management-container` layout
- `.page-body` scroll container
- `.panel` and `.panel-body` wrapper (or replaced by `<app-card>`)
- `.form-grid` and `.form-full-width` (page-specific form layout)
- `.temperature-price-row` and `.temperature-price-group` (beverage-specific)
- `.image-upload-section` and all image/emoji upload styles (page-specific)
- `.category-input-wrapper` and `.category-toggle-btn` (page-specific toggle)
- Responsive breakpoints (simplified — most touch/sizing now in shared components)

**Estimated final CSS:** ~150 lines (down from ~800).

---

## Phase 3: Refactor Inventory

### Step 3.1 — Audit inventory components

**Files to read:**
- `frontend/src/app/features/inventory/components/ingredients/ingredients.component.ts`
- `frontend/src/app/features/inventory/components/ingredients/ingredients.component.html`
- `frontend/src/app/features/inventory/components/ingredients/ingredients.component.css`

**What:** Identify which shared components apply. Expected: loading-spinner, kpi-strip, filter-bar, data-table, badge, button, input, select. Map current inline patterns to shared components.

---

### Step 3.2 — Apply shared components to inventory

Same pattern as Phase 2 steps 2.1-2.7 but for inventory page. Should be faster since all shared components are now built and tested.

---

### Step 3.3 — Clean up inventory CSS

Same pattern as Step 2.7. Remove duplicated button/table/KPI/form/loading styles.

---

## Phase 4: Refactor Reports

### Step 4.1 — Audit reports components

**Files to read:**
- `frontend/src/app/features/admin/components/reports/reports.component.ts`
- `frontend/src/app/features/admin/components/reports/reports.component.html`
- `frontend/src/app/features/admin/components/reports/reports.component.css`

**What:** Identify applicable shared components. Expected: loading-spinner, kpi-strip, data-table (for transaction list, top products), filter-bar (without categories), badge, button. Charts stay custom.

---

### Step 4.2 — Apply shared components to reports

Replace loading spinner, KPI strip, data tables, buttons. Keep chart components untouched.

---

### Step 4.3 — Clean up reports CSS

Remove duplicated styles. Keep chart-specific CSS.

---

## Phase 5: Final Cleanup

### Step 5.1 — Standardize CSS variables

**Files:** All 3 page CSS files + shared component styles

**What:** Replace inconsistent variable references:
- `var(--surface-color)` → `var(--bg-surface)`
- `var(--border-color)` → `var(--border)`
- `var(--error-color)` → `var(--error)`
- `var(--primary-color)` → `var(--accent)`

Use the `var(--new, var(--old))` fallback pattern only in shared components (for backwards compat), not in pages.

---

### Step 5.2 — Standardize responsive breakpoints

**Files:** All 3 page CSS files

**What:** Align all pages to the same breakpoints:
- Tablet: `768px`
- Mobile: `640px`
- Touch: `@media (pointer: coarse)` (now baked into shared components)

Remove page-level touch overrides that are now handled by shared components.

---

### Step 5.3 — Remove orphaned components

**What:** Verify and remove if truly unused:
- `SectionComponent` — if `FilterBar` replaces its use case
- `PageContainerComponent` — if no page uses it

---

### Step 5.4 — Build verification

**What:** Run `npm run build` for production build. Run `npm test` for all tests. Verify no regressions.

---

## Execution Order Summary

| # | Step | Depends On | Est. Scope |
|---|------|-----------|------------|
| 1.1 | CellDef directive | — | Small |
| 1.2 | DataTable rebuild | 1.1 | Large |
| 1.3 | Input CVA | — | Medium |
| 1.4 | Select CVA | — | Medium |
| 1.5 | LoadingSpinner | — | Small |
| 1.6 | StockIndicator | — | Small |
| 1.7 | FilterBar | — | Medium |
| 2.1 | PM: loading spinner | 1.5 | Small |
| 2.2 | PM: KPI strip | — | Small |
| 2.3 | PM: filter bar | 1.7 | Small |
| 2.4 | PM: data table | 1.1, 1.2, 1.6 | Large |
| 2.5 | PM: form controls | 1.3, 1.4 | Medium |
| 2.6 | PM: buttons + card | — | Small |
| 2.7 | PM: CSS cleanup | 2.1-2.6 | Small |
| 3.1-3.3 | Inventory refactor | Phase 1 | Medium |
| 4.1-4.3 | Reports refactor | Phase 1 | Medium |
| 5.1-5.4 | Final cleanup | Phases 2-4 | Small |

**Steps 1.1-1.7 can be parallelized** (1.3, 1.4, 1.5, 1.6, 1.7 are independent; only 1.2 depends on 1.1).
