#!/usr/bin/env node
/*
 * SWI-6 reports performance harness - synthetic seed generator.
 *
 * Emits a .sql file of 100% FABRICATED cafe POS data. No production data is
 * read, copied or derived here. Customer names are generic placeholders and no
 * Senior Citizen / PWD identifiers are generated.
 *
 * Volume model (one busy single-location cafe, 12 months of trading):
 *   - ~170 transactions/day average, weekday/weekend shaped
 *   - 1-4 line items per transaction
 *   - ~6 distinct ingredients consumed per transaction -> Sale stock movements
 * A 30-day window therefore lands near 5,000 transactions, which is the volume
 * the SWI-6 brief names as the acceptance target.
 */

const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, 'seed.sql');
const DAYS = Number(process.env.SEED_DAYS || 365);
const TXN_PER_DAY = Number(process.env.SEED_TXN_PER_DAY || 170);

// Anchor the window so it ENDS today; the reports page defaults to "today".
const END = new Date();
END.setHours(0, 0, 0, 0);

// Deterministic PRNG (mulberry32) so reruns produce identical data.
let _s = 0x9e3779b9 >>> 0;
function rnd() {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const q4 = (n) => (Math.round(n * 10000) / 10000).toFixed(4);
const dt = (d) => {
  const p = (x, w = 2) => String(x).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000000`;
};
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");

// ---- catalog -------------------------------------------------------------
const products = fs.readFileSync(path.join(__dirname, 'products.tsv'), 'utf8')
  .split(/\r?\n/).filter(Boolean)
  .map((l) => { const [Id, Name, Category, Price] = l.split('\t'); return { Id, Name, Category, Price: Number(Price) }; });

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs'];
const SUPPLIERS = ['Northgate Trading', 'Sunrise Provisions', 'Bayside Wholesale', 'Harbor Foods'];
const INGREDIENT_NAMES = [
  'Arabica Beans', 'Robusta Beans', 'Whole Milk', 'Oat Milk', 'Almond Milk', 'Soy Milk',
  'White Sugar', 'Brown Sugar', 'Vanilla Syrup', 'Caramel Syrup', 'Hazelnut Syrup',
  'Chocolate Powder', 'Matcha Powder', 'Green Tea Leaves', 'Black Tea Leaves', 'Earl Grey Leaves',
  'Lemon', 'Orange', 'Apple', 'Mango Puree', 'Strawberry Puree', 'Banana',
  'Whipping Cream', 'Butter', 'Eggs', 'All Purpose Flour', 'Bread Flour', 'Baking Powder',
  'Yeast', 'Salt', 'Cream Cheese', 'Cheddar Cheese', 'Mozzarella', 'Parmesan',
  'Chicken Breast', 'Bacon', 'Ham', 'Tuna Flakes', 'Lettuce', 'Tomato',
  'Cucumber', 'Red Onion', 'Bell Pepper', 'Mayonnaise', 'Mustard', 'Ketchup',
  'Olive Oil', 'Sesame Seeds', 'Cinnamon', 'Nutmeg', 'Ice Cubes', 'Sparkling Water',
  'Still Water', 'Condensed Milk', 'Evaporated Milk', 'Honey', 'Peanut Butter',
  'Dark Chocolate Chips', 'Oats', 'Granola'
];

const ingredients = INGREDIENT_NAMES.map((name, i) => ({
  Id: `ing-${String(i + 1).padStart(3, '0')}`,
  Name: name,
  Unit: pick(UNITS),
  UnitCost: Math.round((2 + rnd() * 120) * 100) / 100,
  Quantity: Math.round((20 + rnd() * 400) * 100) / 100,
  LowStockThreshold: Math.round((5 + rnd() * 25) * 100) / 100,
  Supplier: pick(SUPPLIERS)
}));

// Each product consumes 3-5 ingredients.
const recipes = [];
for (const p of products) {
  const n = ri(3, 5);
  const used = new Set();
  for (let k = 0; k < n; k++) {
    let ing;
    do { ing = pick(ingredients); } while (used.has(ing.Id));
    used.add(ing.Id);
    recipes.push({ ProductId: p.Id, IngredientId: ing.Id, QuantityPerUnit: Math.round((0.01 + rnd() * 0.5) * 10000) / 10000, SortOrder: k });
  }
}
const recipeByProduct = new Map();
for (const r of recipes) {
  if (!recipeByProduct.has(r.ProductId)) recipeByProduct.set(r.ProductId, []);
  recipeByProduct.get(r.ProductId).push(r);
}
const ingById = new Map(ingredients.map((i) => [i.Id, i]));

// ---- output buffering ----------------------------------------------------
const out = fs.createWriteStream(OUT, { encoding: 'utf8' });
out.write('SET autocommit=0;\nSET unique_checks=0;\nSET foreign_key_checks=0;\n');

let pending = [];
function flush() {
  if (pending.length) { out.write(pending.join('\n') + '\n'); pending = []; }
}
function emit(sql) { pending.push(sql); if (pending.length >= 500) flush(); }

function batchInsert(table, cols, rows, perStmt = 500) {
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    emit(`INSERT INTO \`${table}\` (${cols.map((c) => '`' + c + '`').join(',')}) VALUES\n` + chunk.join(',\n') + ';');
  }
}

const startDate = new Date(END);
startDate.setDate(startDate.getDate() - (DAYS - 1));

// ---- ingredients ---------------------------------------------------------
batchInsert('Ingredients',
  ['Id', 'Name', 'Quantity', 'Unit', 'Supplier', 'ExpirationDate', 'LowStockThreshold', 'UnitCost', 'LastPurchaseDate', 'LastPurchaseCost', 'CreatedAt', 'UpdatedAt', 'IsActive'],
  ingredients.map((i) => `('${i.Id}','${esc(i.Name)}',${money(i.Quantity)},'${i.Unit}','${esc(i.Supplier)}',NULL,${money(i.LowStockThreshold)},${money(i.UnitCost)},'${dt(END)}',${money(i.UnitCost)},'${dt(startDate)}','${dt(END)}',1)`));

batchInsert('ProductIngredients', ['ProductId', 'IngredientId', 'QuantityPerUnit', 'SortOrder'],
  recipes.map((r) => `('${r.ProductId}','${r.IngredientId}',${q4(r.QuantityPerUnit)},${r.SortOrder})`));

// ---- ingredient lots: weekly purchases per ingredient --------------------
const lotRows = [];
let lotSeq = 0;
for (const ing of ingredients) {
  for (let w = 0; w < Math.ceil(DAYS / 7); w++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + w * 7 + ri(0, 2));
    d.setHours(ri(7, 10), ri(0, 59), 0, 0);
    if (d > END) continue;
    lotSeq++;
    const qty = Math.round((30 + rnd() * 200) * 10000) / 10000;
    const cost = Math.round(ing.UnitCost * (0.85 + rnd() * 0.3) * 100) / 100;
    // 2-3 suppliers rotate per ingredient so the supplier comparison report has data
    const sup = SUPPLIERS[(w + ing.Id.charCodeAt(5)) % 3];
    lotRows.push(`('lot-${lotSeq}','${ing.Id}','${esc(sup)}',${money(cost)},${q4(qty)},${q4(qty * rnd())},NULL,'${dt(d)}','LOT-${lotSeq}',NULL,1)`);
  }
}
batchInsert('IngredientLots', ['Id', 'IngredientId', 'Supplier', 'UnitCost', 'InitialQuantity', 'RemainingQuantity', 'ExpirationDate', 'ReceivedAt', 'LotNumber', 'Notes', 'IsActive'], lotRows);

// Purchase stock movements mirroring those lots
let movSeq = 0;
const purchaseMovs = [];
for (let i = 0; i < lotRows.length; i++) {
  const m = lotRows[i].match(/^\('lot-(\d+)','([^']+)','([^']*)',([\d.]+),([\d.]+),[\d.]+,NULL,'([^']+)'/);
  if (!m) continue;
  movSeq++;
  purchaseMovs.push(`('mov-p-${movSeq}','${m[2]}',0,${money(Number(m[5]))},${money(Number(m[4]))},'Purchase received',NULL,'seed','lot-${m[1]}','${m[6]}')`);
}
batchInsert('StockMovements', ['Id', 'IngredientId', 'MovementType', 'Quantity', 'UnitCost', 'Reason', 'Notes', 'CreatedBy', 'LotId', 'CreatedAt'], purchaseMovs);

// ---- expense categories + expenses --------------------------------------
const EXP_CATS = ['Rent', 'Utilities', 'Salaries', 'Marketing', 'Supplies', 'Maintenance', 'Transport', 'Misc'];
batchInsert('ExpenseCategories', ['Id', 'Name', 'IsSystem', 'IsActive', 'SortOrder', 'CreatedAt'],
  EXP_CATS.map((c, i) => `('cat-${i + 1}','${esc(c)}',1,1,${i},'${dt(startDate)}')`));

const expRows = [];
let expSeq = 0;
// Recurring monthly templates (rent, utilities, salaries)
for (let i = 0; i < 3; i++) {
  expSeq++;
  expRows.push(`('exp-${expSeq}','cat-${i + 1}','${esc(EXP_CATS[i])} - monthly',${money(15000 + rnd() * 60000)},'${dt(startDate)}',1,'Monthly',NULL,NULL,NULL,'seed','${dt(startDate)}','${dt(startDate)}')`);
}
// One-off expenses, a few per week
for (let d = 0; d < DAYS; d += 2) {
  const day = new Date(startDate);
  day.setDate(day.getDate() + d);
  day.setHours(ri(9, 17), ri(0, 59), 0, 0);
  const n = ri(1, 3);
  for (let k = 0; k < n; k++) {
    expSeq++;
    const ci = ri(3, EXP_CATS.length - 1);
    expRows.push(`('exp-${expSeq}','cat-${ci + 1}','${esc(EXP_CATS[ci])} purchase',${money(200 + rnd() * 6000)},'${dt(day)}',0,NULL,NULL,NULL,NULL,'seed','${dt(day)}','${dt(day)}')`);
  }
}
batchInsert('Expenses', ['Id', 'CategoryId', 'Description', 'Amount', 'Date', 'IsRecurring', 'RecurrenceType', 'RecurrenceEndDate', 'ParentExpenseId', 'Notes', 'CreatedBy', 'CreatedAt', 'UpdatedAt'], expRows);

// ---- transactions --------------------------------------------------------
const PAYMENTS = ['cash', 'card', 'mobile'];
// Generic placeholder customers only - never real customer data.
const CUSTOMERS = ['Walk-in', 'Counter Guest', 'Dine-in Guest', 'Takeaway Guest'];

let txnId = 0;
let itemAutoId = 0;
let addonId = 0;
let saleMovSeq = 0;

let txnRows = [], itemRows = [], addonRows = [], saleMovRows = [];
let totals = { txns: 0, items: 0, addons: 0, movements: 0 };

function flushTxnBuffers(force) {
  if (force || txnRows.length >= 500) { batchInsert('Transactions', ['Id', 'Timestamp', 'Total', 'PaymentMethod', 'ServiceType', 'ServiceFee', 'CustomerInfo_Name', 'CustomerInfo_Email', 'CustomerInfo_Phone', 'CustomerInfo_DiscountType', 'CustomerInfo_DiscountId', 'Status', 'Notes', 'AmountReceived', 'Change'], txnRows); txnRows = []; }
  if (force || itemRows.length >= 500) { batchInsert('TransactionItem', ['TransactionId', 'Id', 'ProductId', 'Name', 'Category', 'Price', 'BasePrice', 'Temperature', 'Quantity', 'Discount_Type', 'Discount_Percentage', 'Discount_Amount'], itemRows); itemRows = []; }
  if (force || addonRows.length >= 500) { batchInsert('AddOn', ['Id', 'TransactionItemTransactionId', 'TransactionItemId', 'Name', 'Price', 'Quantity'], addonRows); addonRows = []; }
  if (force || saleMovRows.length >= 500) { batchInsert('StockMovements', ['Id', 'IngredientId', 'MovementType', 'Quantity', 'UnitCost', 'Reason', 'Notes', 'CreatedBy', 'LotId', 'CreatedAt'], saleMovRows); saleMovRows = []; }
}

for (let d = 0; d < DAYS; d++) {
  const day = new Date(startDate);
  day.setDate(day.getDate() + d);
  const dow = day.getDay();
  // Weekends busier, Mondays quieter.
  const shape = dow === 0 || dow === 6 ? 1.25 : dow === 1 ? 0.8 : 1.0;
  const count = Math.max(1, Math.round(TXN_PER_DAY * shape * (0.85 + rnd() * 0.3)));

  for (let t = 0; t < count; t++) {
    txnId++;
    // Two peaks: morning 7-10, lunch 11-14, plus a tail to 20.
    const r = rnd();
    const hour = r < 0.35 ? ri(7, 10) : r < 0.70 ? ri(11, 14) : ri(15, 20);
    const ts = new Date(day);
    ts.setHours(hour, ri(0, 59), ri(0, 59), 0);

    const lineCount = ri(1, 4);
    const ingredientNeed = new Map();
    let total = 0;

    for (let li = 0; li < lineCount; li++) {
      itemAutoId++;
      const p = pick(products);
      const qty = ri(1, 3);
      const base = p.Price;
      // Temperature: 0/1 as the enum does; add-on surcharge folded into Price.
      const temperature = rnd() < 0.5 ? 0 : 1;
      let price = base;

      // Add-ons on ~30% of lines.
      let addonExtra = 0;
      if (rnd() < 0.3) {
        const n = ri(1, 2);
        for (let a = 0; a < n; a++) {
          addonId++;
          const ap = Math.round((15 + rnd() * 40) * 100) / 100;
          addonExtra += ap;
          addonRows.push(`(${addonId},${txnId},${itemAutoId},'${esc(pick(['Extra Shot', 'Oat Milk', 'Whipped Cream', 'Extra Syrup', 'Large Size']))}',${money(ap)},1)`);
          totals.addons++;
        }
      }
      price = base + addonExtra;

      // Senior/PWD style 20% line discount on ~8% of lines. Discount_Amount is
      // the WHOLE-LINE total (matches ReportingService's documented assumption).
      let dType = 'NULL', dPct = 'NULL', dAmt = 'NULL';
      let lineTotal = price * qty;
      if (rnd() < 0.08) {
        const pct = 20;
        const amt = Math.round(lineTotal * (pct / 100) * 100) / 100;
        dType = `'Senior'`; dPct = money(pct); dAmt = money(amt);
        lineTotal -= amt;
      }
      total += lineTotal;

      itemRows.push(`(${txnId},${itemAutoId},'${p.Id}','${esc(p.Name)}','${esc(p.Category)}',${money(price)},${money(base)},${temperature},${qty},${dType},${dPct},${dAmt})`);
      totals.items++;

      for (const r2 of (recipeByProduct.get(p.Id) || [])) {
        ingredientNeed.set(r2.IngredientId, (ingredientNeed.get(r2.IngredientId) || 0) + r2.QuantityPerUnit * qty);
      }
    }

    const serviceType = rnd() < 0.6 ? 0 : 1;
    const serviceFee = serviceType === 1 ? Math.round(total * 0.05 * 100) / 100 : 0;
    total += serviceFee;

    const pay = pick(PAYMENTS);
    const received = pay === 'cash' ? Math.ceil(total / 50) * 50 : total;

    txnRows.push(`(${txnId},'${dt(ts)}',${money(total)},'${pay}',${serviceType},${money(serviceFee)},'${esc(pick(CUSTOMERS))}',NULL,NULL,NULL,NULL,'completed',NULL,${money(received)},${money(received - total)})`);
    totals.txns++;

    // One Sale movement per distinct ingredient consumed (mirrors DeductFifoAsync).
    for (const [ingId, need] of ingredientNeed) {
      saleMovSeq++;
      const ing = ingById.get(ingId);
      saleMovRows.push(`('mov-s-${saleMovSeq}','${ingId}',1,${money(-need)},${money(ing.UnitCost)},'POS Sale',NULL,'seed',NULL,'${dt(ts)}')`);
      totals.movements++;
    }

    flushTxnBuffers(false);
  }
}
flushTxnBuffers(true);

// A little waste/adjustment traffic so the inventory report is not degenerate.
const wasteRows = [];
for (let d = 0; d < DAYS; d += 3) {
  const day = new Date(startDate);
  day.setDate(day.getDate() + d);
  day.setHours(ri(18, 21), ri(0, 59), 0, 0);
  const n = ri(1, 4);
  for (let k = 0; k < n; k++) {
    movSeq++;
    const ing = pick(ingredients);
    const qty = Math.round((0.5 + rnd() * 8) * 100) / 100;
    wasteRows.push(`('mov-w-${movSeq}','${ing.Id}',${rnd() < 0.7 ? 3 : 2},${money(-qty)},${money(ing.UnitCost)},'${rnd() < 0.7 ? 'Spoilage' : 'Stock count adjustment'}',NULL,'seed',NULL,'${dt(day)}')`);
  }
}
batchInsert('StockMovements', ['Id', 'IngredientId', 'MovementType', 'Quantity', 'UnitCost', 'Reason', 'Notes', 'CreatedBy', 'LotId', 'CreatedAt'], wasteRows);

emit('COMMIT;');
emit('SET foreign_key_checks=1;');
emit('SET unique_checks=1;');
flush();
out.end();

out.on('finish', () => {
  console.log(JSON.stringify({
    outFile: OUT,
    days: DAYS,
    windowStart: dt(startDate),
    windowEnd: dt(END),
    ingredients: ingredients.length,
    recipes: recipes.length,
    lots: lotRows.length,
    expenses: expRows.length,
    ...totals,
    wasteMovements: wasteRows.length,
    totalMovements: totals.movements + purchaseMovs.length + wasteRows.length
  }, null, 2));
});
