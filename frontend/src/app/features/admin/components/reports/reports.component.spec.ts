import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { Transaction } from '../../../checkout/models/transaction.model';
import { OfflineService } from '../../../../core/services/offline.service';
import { TransactionService } from '../../../checkout/services/transaction.service';
import { ProductService } from '../../../pos/services/product.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { StockMovementService } from '../../../inventory/services/stock-movement.service';
import { ThermalPrinterService } from '../../../checkout/services/thermal-printer.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ReportsComponent } from './reports.component';

/**
 * Regression cover for the Dashboard's Revenue and Transactions KPIs (spec R12 / C1).
 *
 * `loadRecentTransactions()` deliberately reads at most 50 rows — it feeds the
 * "Recent Transactions" card. The KPIs must NOT be derived from that capped array;
 * they have to report the backend's figure for the selected period.
 *
 * The old implementation only reached the backend figure when `isCustomDateRange`
 * was true. On the default "Today" preset it summed `recentTransactions` instead,
 * so what the Owner saw depended on a race: whether TransactionService had finished
 * filling its BehaviorSubject before the reports page read it. Both outcomes of that
 * race are forced below, because a test that only covers the empty-subject case
 * passes on the broken code.
 */
describe('ReportsComponent "Today" KPIs', () => {
  let component: ReportsComponent;
  let httpMock: HttpTestingController;

  /** Mirrors the seeded dataset in spec §10: 170 completed transactions on the current day. */
  const SEEDED_TRANSACTION_COUNT = 170;
  const SEEDED_TOTAL_SALES = 23330.82;

  /** What `GET /api/reports/sales` returns for the seeded day. This is the source of truth. */
  const salesReport = {
    totalSales: SEEDED_TOTAL_SALES,
    totalTransactions: SEEDED_TRANSACTION_COUNT
  };

  /**
   * Builds the seeded day's transactions, newest first, with line totals that add up to
   * `SEEDED_TOTAL_SALES`. No discount records: the KPI path must not depend on discount,
   * service-fee or VAT arithmetic, which is ring-fenced for this engagement.
   */
  const buildTodaysTransactions = (): Transaction[] => {
    const midday = new Date();
    midday.setHours(12, 0, 0, 0);

    return Array.from({ length: SEEDED_TRANSACTION_COUNT }, (_, index) => {
      // 169 x 137.00 + 1 x 177.82 = 23,330.82
      const total = index === 0 ? 177.82 : 137.0;
      return {
        id: index + 1,
        timestamp: new Date(midday.getTime() - index * 60_000).toISOString(),
        items: [{ productId: 'p1', name: 'Latte', price: total, quantity: 1 }],
        total,
        paymentMethod: 'cash',
        customerInfo: { name: '', discountType: 'none' as const },
        status: 'completed' as const
      };
    });
  };

  /**
   * Answers the full-table download TransactionService kicks off in its constructor.
   * `seed` is what lands in the subject — i.e. which side of the C1 race wins.
   */
  const settleTransactionSubject = (seed: Transaction[]): void => {
    httpMock.match('/api/transactions').forEach(request => request.flush(seed));
  };

  /** Runs the two loaders behind the KPIs and answers the one request they issue. */
  const loadDashboardKpis = async (): Promise<void> => {
    const daily = (component as any).loadDailyReport();
    const salesRequest = httpMock.expectOne(request => request.url === '/api/reports/sales');
    expect(salesRequest.request.method).toBe('GET');
    salesRequest.flush(salesReport);
    await daily;

    await (component as any).loadRecentTransactions();
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        ReportsComponent,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OfflineService, useValue: { isOnline$: new BehaviorSubject<boolean>(true) } },
        { provide: ProductService, useValue: jasmine.createSpyObj('ProductService', ['getProducts']) },
        { provide: IngredientService, useValue: jasmine.createSpyObj('IngredientService', ['getIngredients']) },
        { provide: StockMovementService, useValue: jasmine.createSpyObj('StockMovementService', ['getMovements']) },
        { provide: ThermalPrinterService, useValue: jasmine.createSpyObj('ThermalPrinterService', ['printReceipt']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        TransactionService
      ]
    });

    TestBed.inject(TransactionService); // constructed eagerly so its GET is in flight
    httpMock = TestBed.inject(HttpTestingController);
    component = TestBed.inject(ReportsComponent);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('defaults to the "Today" preset, which is the view under test', () => {
    settleTransactionSubject([]);

    expect(component.isCustomDateRange).toBeFalse();
    expect(component.activeDatePreset).toBe('today');
  });

  describe('when the transaction subject is still empty (the race resolves the safe way)', () => {
    beforeEach(async () => {
      settleTransactionSubject([]);
      await loadDashboardKpis();
    });

    it('reports the backend revenue and transaction count', () => {
      expect(component.recentTransactions.length).toBe(0);
      expect(component.getTotalSales()).toBe(SEEDED_TOTAL_SALES);
      expect(component.getTransactionCount()).toBe(SEEDED_TRANSACTION_COUNT);
    });
  });

  describe('when the transaction subject is already populated (the race resolves the unsafe way)', () => {
    beforeEach(async () => {
      settleTransactionSubject(buildTodaysTransactions());
      await loadDashboardKpis();
    });

    it('still reports the backend revenue rather than the 50-row sum', () => {
      // Guard: the capped array really is in play, so this test exercises the risky branch.
      expect(component.recentTransactions.length).toBe(50);

      expect(component.getTotalSales()).toBe(SEEDED_TOTAL_SALES);
    });

    it('still reports the backend transaction count rather than the 50-row length', () => {
      expect(component.recentTransactions.length).toBe(50);

      expect(component.getTransactionCount()).toBe(SEEDED_TRANSACTION_COUNT);
    });

    it('derives the average order value from the backend figures', () => {
      expect(component.getAverageTransactionValue()).toBeCloseTo(SEEDED_TOTAL_SALES / SEEDED_TRANSACTION_COUNT, 6);
    });

    it('surfaces the backend figures through the rendered KPI strip', () => {
      const kpis = component.kpiItems;

      expect(kpis.find(k => k.label === 'Revenue')?.value).toBe(component.formatCurrency(SEEDED_TOTAL_SALES));
      expect(kpis.find(k => k.label === 'Transactions')?.value).toBe(SEEDED_TRANSACTION_COUNT);
    });

    it('leaves the Recent Transactions list capped at 50 rows', () => {
      // The cap is correct for a recent-activity list; only the KPIs were wrong.
      expect(component.recentTransactions.length).toBe(50);
    });
  });

  describe('on a custom date range', () => {
    beforeEach(async () => {
      // Set the range fields directly: setDatePreset() would kick off the whole
      // loadAllData() cascade, and only the two loaders below matter here.
      component.activeDatePreset = '7d';
      component.isCustomDateRange = true;
      component.startDate = new Date(new Date().setDate(new Date().getDate() - 6));
      component.startDate.setHours(0, 0, 0, 0);

      settleTransactionSubject(buildTodaysTransactions());
      await loadDashboardKpis();
    });

    it('reports the backend figures, as it already did before the fix', () => {
      expect(component.getTotalSales()).toBe(SEEDED_TOTAL_SALES);
      expect(component.getTransactionCount()).toBe(SEEDED_TRANSACTION_COUNT);
    });
  });

  describe('when the backend sales report request fails', () => {
    it('reports zero rather than a partial sum of the capped array', async () => {
      settleTransactionSubject(buildTodaysTransactions());

      const daily = (component as any).loadDailyReport();
      httpMock
        .expectOne(request => request.url === '/api/reports/sales')
        .error(new ProgressEvent('error'), { status: 500 });
      await daily;
      await (component as any).loadRecentTransactions();

      // getSalesReport() swallows the failure and substitutes an offline report whose
      // keys are PascalCase, so loadDailyReport() reads nothing from it. Showing 0 for
      // "no backend figure" is the intended degenerate case; showing a 50-row partial
      // sum is the defect under test.
      expect(component.recentTransactions.length).toBe(50);
      expect(component.getTotalSales()).toBe(0);
      expect(component.getTransactionCount()).toBe(0);
    });
  });
});
