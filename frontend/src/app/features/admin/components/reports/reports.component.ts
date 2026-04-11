import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment.prod';
import { Transaction } from '../../../checkout/models/transaction.model';
import { Product } from '../../../pos/models/product.model';
import { TransactionService } from '../../../checkout/services/transaction.service';
import { ProductService } from '../../../pos/services/product.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { StockMovementService } from '../../../inventory/services/stock-movement.service';
import { ThermalPrinterService } from '../../../checkout/services/thermal-printer.service';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { KpiStripComponent, KpiItem } from '../../../../shared/ui/kpi-strip/kpi-strip.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { FilterBarComponent } from '../../../../shared/ui/filter-bar/filter-bar.component';
import { DataTableComponent, TableColumn } from '../../../../shared/ui/data-table/data-table.component';
import { CellDefDirective } from '../../../../shared/ui/data-table/cell-def.directive';
import { NgxChartsModule, ScaleType, Color } from '@swimlane/ngx-charts';
import { curveMonotoneX } from 'd3-shape';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TopBarComponent, KpiStripComponent, LoadingSpinnerComponent, ButtonComponent, BadgeComponent, FilterBarComponent, ExpenseModalComponent, NgxChartsModule, DataTableComponent, CellDefDirective],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  Math = Math;
  private destroy$ = new Subject<void>();
  selectedTransaction: Transaction | null = null;
  isTransactionModalOpen: boolean = false;
  dailyReport: any = null;
  today: Date = new Date();
  topProducts: any[] = [];
  recentTransactions: Transaction[] = [];
  products: Product[] = [];
  errorMessage: string = '';
  isLoading: boolean = false;
  exportingKey: string | null = null;

  // Properties for date range and sales data
  startDate: Date = new Date();
  endDate: Date = new Date();
  isCustomDateRange: boolean = false;
  selectedDateRange: string = 'today';
  salesReportData: any = null; // Store current sales report data

  // Sales trend properties for Performance Metrics
  salesTrendData: any[] = [];
  chartData: any[] = [];
  trendPeriod: string = '7d'; // 7d, 30d, 90d

  // ngx-charts configuration
  ngxChartData: { name: string; series: { name: string; value: number; extra?: any }[] }[] = [];
  readonly chartCurve = curveMonotoneX;
  readonly chartColorScheme: Color = {
    name: 'quickserve',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#3b82f6', '#10b981']
  };
  readonly chartGradient = true;

  // Profit Snapshot table
  readonly profitColumns: TableColumn[] = [
    { key: 'metric', label: 'Metric', cellTemplate: 'metric' },
    { key: 'amount', label: 'Amount', cellTemplate: 'amount', align: 'right', width: '140px' }
  ];

  // Quick Stats table
  readonly quickStatsColumns: TableColumn[] = [
    { key: 'metric', label: 'Metric', cellTemplate: 'metric' },
    { key: 'value', label: 'Value', cellTemplate: 'value', align: 'right', width: '140px' }
  ];

  get profitRows(): Array<{ id: string; metric: string; amount: number; type: 'revenue' | 'cogs' | 'profit' | 'expenses' | 'net'; tooltip?: string }> {
    if (!this.profitLossData) return [];
    const totalExpenses = this.profitLossData.totalExpenses || 0;
    const netIncome = this.profitLossData.netProfit ?? (this.profitLossData.grossProfit - totalExpenses);
    return [
      { id: 'revenue', metric: 'Revenue', amount: this.profitLossData.grossRevenue, type: 'revenue' },
      { id: 'cogs', metric: 'Cost of Goods', amount: this.profitLossData.cogs, type: 'cogs', tooltip: this.METRIC_TOOLTIPS['costOfGoods'] },
      { id: 'profit', metric: 'Gross Profit', amount: this.profitLossData.grossProfit, type: 'profit' },
      { id: 'expenses', metric: 'Expenses', amount: totalExpenses, type: 'expenses' },
      { id: 'net', metric: 'Net Income', amount: netIncome, type: 'net' }
    ];
  }

  get quickStatsRows(): Array<{ id: string; metric: string; value: string; accent?: boolean }> {
    const rows: Array<{ id: string; metric: string; value: string; accent?: boolean }> = [];
    rows.push({ id: 'best-seller', metric: 'Best Seller', value: this.getTopProductName() });
    if (this.categoryBreakdown.length > 0) {
      rows.push({ id: 'top-category', metric: 'Top Category', value: this.categoryBreakdown[0].category });
    }
    for (const p of this.paymentBreakdown) {
      const label = p.method === 'cash' ? 'Cash' : p.method === 'gcash' ? 'GCash' : p.method;
      const pct = Math.round(this.getPaymentPercent(p.total));
      rows.push({ id: `pay-${p.method}`, metric: label, value: `${pct}%` });
    }
    return rows;
  }

  // All-time product sales (no date filtering)
  allTimeProductSales: any[] = [];
  allTimeSearchQuery: string = '';
  allTimeSortBy: 'sales' | 'quantity' | 'name' = 'sales';
  allTimeCategories: string[] = [];
  allTimeSelectedCategory: string = '';

  // Sort options for leaderboard filter bar
  leaderboardSortOptions = [
    { value: 'sales', label: 'Revenue' },
    { value: 'quantity', label: 'Qty Sold' },
    { value: 'name', label: 'Name' }
  ];

  // Accounting report data
  profitLossData: any = null;
  inventoryData: any = null;
  accountantSummary: any = null;
  supplierData: any = null;
  consumptionData: any = null;
  periodComparison: any = null;
  categoryBreakdown: any[] = [];
  paymentBreakdown: any[] = [];

  // Activity sub-tab data
  activityMovements: any[] = [];
  filteredActivityMovements: any[] = [];
  activityTypeFilter = '';
  activitySearchTerm = '';
  activityTotalIn = 0;
  activityTotalOut = 0;
  activityNet = 0;
  ingredientsMap: Map<string, { name: string; unit: string }> = new Map();

  // Tab navigation
  activeTab: 'dashboard' | 'sales' | 'pnl' | 'inventory' = 'dashboard';

  // Inventory tab collapsible sections
  inventoryExpanded: Record<string, boolean> = {
    valuation: true,
    activity: false,
    suppliers: false,
    consumption: false
  };

  // P&L quick-add expense modal
  showExpenseModal = false;

  // Date presets
  activeDatePreset: string = 'today';

  // Insights
  insights: { level: 'positive' | 'warning' | 'alert' | 'info'; icon: string; headline: string; detail: string }[] = [];

  // Metric tooltips
  readonly METRIC_TOOLTIPS: Record<string, string> = {
    revenue: 'Total sales amount before subtracting costs',
    transactions: 'Number of completed orders',
    avgOrderValue: 'Average amount spent per order',
    grossMargin: 'Percentage of revenue kept after ingredient costs. Higher is better.',
    costOfGoods: 'Cost of ingredients used to make the products you sold',
    grossProfit: 'Revenue minus cost of goods \u2014 what you actually earned',
    netRevenue: 'Revenue after discounts are subtracted',
    periodChange: 'How much inventory value changed during this period',
    waste: 'Value of ingredients lost to waste, spoilage, or unaccounted use',
    lowStock: 'Number of ingredients below their minimum stock level',
    averageTicket: 'Average revenue per transaction',
    avgDaily: 'Average quantity used per day in this period',
    percentOfTotal: "This item's share of the total cost"
  };

  constructor(
    private transactionService: TransactionService,
    private productService: ProductService,
    private ingredientService: IngredientService,
    private stockMovementService: StockMovementService,
    private thermalPrinter: ThermalPrinterService,
    private toast: ToastService,
    private http: HttpClient
  ) {
    this.initializeDateRange();
  }

  ngOnInit(): void {
    this.loadAllData();
    this.loadAllTimeProductSales(); // Load separately - always shows regardless of date
  }

  private initializeDateRange(): void {
    const today = new Date();
    // Use browser's local date for "Today"
    this.startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    this.endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    this.isCustomDateRange = false;
    this.selectedDateRange = 'Today';
  }

  getCurrentPhilippineTime(): Date {
    const now = new Date();
    return new Date(now.getTime() + (8 * 60 * 60 * 1000));
  }

  onTrendPeriodChange(period: string): void {
    this.trendPeriod = period;
    this.loadSalesTrendData();
  }

  onDateRangeChange(): void {
    if (this.startDate && this.endDate) {
      // Ensure dates are properly set
      if (this.startDate instanceof Date && this.endDate instanceof Date) {
        this.isCustomDateRange = true;
        this.activeDatePreset = '';
        this.selectedDateRange = `${this.formatDisplayDate(this.startDate)} - ${this.formatDisplayDate(this.endDate)}`;
        this.loadAllData();
      }
    }
  }

  onStartDateChange(event: any): void {
    const dateValue = event.target.value;
    if (dateValue) {
      const [y, m, d] = dateValue.split('-').map(Number);
      this.startDate = new Date(y, m - 1, d);
      this.onDateRangeChange();
    }
  }

  onEndDateChange(event: any): void {
    const dateValue = event.target.value;
    if (dateValue) {
      const [y, m, d] = dateValue.split('-').map(Number);
      this.endDate = new Date(y, m - 1, d);
      this.onDateRangeChange();
    }
  }

  toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  resetToToday(): void {
    this.initializeDateRange();
    this.loadAllData();
  }

  private async loadSalesTrendData(): Promise<void> {
    try {
      const endDate = new Date(this.isCustomDateRange ? this.endDate : this.startDate); // Use current range end
      endDate.setHours(23, 59, 59, 999);

      let startDate: Date;

      // Calculate start date based on trend period
      switch (this.trendPeriod) {
        case '7d':
          startDate = new Date(endDate.getTime());
          startDate.setDate(startDate.getDate() - 6); // 6 days ago + today = 7 days
          break;
        case '30d':
          startDate = new Date(endDate.getTime());
          startDate.setDate(startDate.getDate() - 29);
          break;
        case '90d':
          startDate = new Date(endDate.getTime());
          startDate.setDate(startDate.getDate() - 89);
          break;
        default:
          startDate = new Date(endDate.getTime());
          startDate.setDate(startDate.getDate() - 6);
      }

      startDate.setHours(0, 0, 0, 0);

      // Ensure start date doesn't go before our custom date range if selected
      if (this.isCustomDateRange && startDate < this.startDate) {
        startDate = new Date(this.startDate);
        startDate.setHours(0, 0, 0, 0);
      }

      const salesReport = await firstValueFrom(this.transactionService.getSalesReport(startDate, endDate));

      if (salesReport && salesReport.dailySales) {
        this.salesTrendData = salesReport.dailySales;
        this.processChartData();
      } else {
        this.salesTrendData = [];
        this.chartData = [];
      }
    } catch (error) {
      this.salesTrendData = [];
      this.chartData = [];
    }
  }

  private processChartData(): void {
    if (!this.salesTrendData || this.salesTrendData.length === 0) {
      this.chartData = [];
      this.ngxChartData = [];
      return;
    }

    this.chartData = this.salesTrendData.map((day: any, index: number) => ({
      date: new Date(day.date),
      sales: day.totalSales || 0,
      transactions: day.transactionCount || 0,
      formattedDate: this.formatChartDate(new Date(day.date)),
      color: this.getBarColor(index)
    }));

    this.chartData.sort((a, b) => a.date.getTime() - b.date.getTime());

    this.ngxChartData = [
      {
        name: 'Revenue',
        series: this.chartData.map(d => ({
          name: d.formattedDate,
          value: d.sales,
          extra: { transactions: d.transactions, date: d.date }
        }))
      }
    ];
  }

  formatYAxisTick = (value: number): string => {
    return this.formatCompact(value);
  };

  private formatChartDate(date: Date): string {
    if (this.trendPeriod === '7d') {
      return date.toLocaleDateString('en-PH', { weekday: 'short' });
    } else if (this.trendPeriod === '30d') {
      return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-PH', { month: 'short' });
    }
  }

  getTrendInsights(): any {
    if (this.chartData.length < 2) {
      return { trend: 'neutral', percentage: 0, message: 'Insufficient data for trend analysis' };
    }

    // For small datasets, compare the last 2 data points
    const recentData = this.chartData.slice(-1); // Last data point
    const olderData = this.chartData.slice(-2, -1); // Previous data point

    if (olderData.length === 0) {
      return { trend: 'neutral', percentage: 0, message: 'Insufficient data for trend analysis' };
    }

    const recentTotal = recentData[0].sales;
    const olderTotal = olderData[0].sales;

    if (olderTotal === 0) {
      return { trend: 'neutral', percentage: 0, message: 'No previous data for comparison' };
    }

    const percentageChange = ((recentTotal - olderTotal) / olderTotal) * 100;

    let trend = 'neutral';
    let message = '';

    if (percentageChange > 5) {
      trend = 'positive';
      message = `Sales increased by ${percentageChange.toFixed(1)}% compared to previous day`;
    } else if (percentageChange < -5) {
      trend = 'negative';
      message = `Sales decreased by ${Math.abs(percentageChange).toFixed(1)}% compared to previous day`;
    } else {
      trend = 'neutral';
      message = `Sales remained stable (${percentageChange.toFixed(1)}% change)`;
    }

    return { trend, percentage: percentageChange, message };
  }

  hasTrendData(): boolean {
    return this.chartData.length > 0;
  }

  getBarColor(index: number): string {
    const colors = [
      'linear-gradient(to top, #3b82f6, #60a5fa)',      // Blue
      'linear-gradient(to top, #10b981, #34d399)',      // Green
      'linear-gradient(to top, #f59e0b, #fbbf24)',      // Amber
      'linear-gradient(to top, #ef4444, #f87171)',      // Red
      'linear-gradient(to top, #8b5cf6, #a78bfa)',      // Purple
      'linear-gradient(to top, #06b6d4, #22d3ee)',      // Cyan
      'linear-gradient(to top, #84cc16, #a3e635)',      // Lime
      'linear-gradient(to top, #f97316, #fb923c)',      // Orange
      'linear-gradient(to top, #ec4899, #f472b6)',      // Pink
      'linear-gradient(to top, #6b7280, #9ca3af)'      // Gray
    ];

    return colors[index % colors.length];
  }

  getBarHeight(sales: number): number {
    if (!this.chartData || this.chartData.length === 0) return 0;

    const maxSales = Math.max(...this.chartData.map(d => d.sales));
    if (maxSales === 0) return 0;

    const height = (sales / maxSales) * 100;
    return sales === 0 ? 2 : Math.max(height, 4);
  }

  getChartTotal(): number {
    return this.chartData.reduce((sum, d) => sum + d.sales, 0);
  }

  getChartAverage(): number {
    if (this.chartData.length === 0) return 0;
    return this.getChartTotal() / this.chartData.length;
  }

  getChartPeak(): number {
    if (this.chartData.length === 0) return 0;
    return Math.max(...this.chartData.map(d => d.sales));
  }

  getChartMax(): number {
    const peak = this.getChartPeak();
    if (peak === 0) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
    return Math.ceil(peak / magnitude) * magnitude;
  }

  formatCompact(value: number): string {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    return value.toFixed(0);
  }

  private formatDisplayDate(date: Date): string {
    return date.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getDateRangeLabel(): string {
    if (this.isCustomDateRange) {
      if (this.startDate.getTime() === this.endDate.getTime()) {
        return this.formatDisplayDate(this.startDate);
      }
      return `${this.formatDisplayDate(this.startDate)} - ${this.formatDisplayDate(this.endDate)}`;
    }
    return 'Today';
  }

  getSummaryTitle(): string {
    if (this.isCustomDateRange) {
      if (this.startDate.getTime() === this.endDate.getTime()) {
        return `${this.formatDisplayDate(this.startDate)} Summary`;
      }
      return `${this.formatDisplayDate(this.startDate)} - ${this.formatDisplayDate(this.endDate)} Summary`;
    }
    return 'Today\'s Summary';
  }

  private async loadAllData(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;

    const timeoutId = setTimeout(() => {
      this.isLoading = false;
    }, 10000);

    try {
      await this.loadDailyReport();
      await this.loadProducts();
      await this.loadTopProducts();
      await this.loadRecentTransactions();
      await this.loadSalesTrendData(); // Load sales trend data for Performance Metrics
      await this.loadAllTimeProductSales(); // Load all-time product sales
      await this.loadProfitLossReport();
      await this.loadInventoryValuation();
      await this.loadAccountantSummary();
      await this.loadPeriodComparison();
      await this.loadCategoryBreakdown();
      this.loadPaymentBreakdown();
      await this.loadSupplierBreakdown();
      await this.loadConsumption();
      await this.loadActivityMovements();
      this.generateInsights();

      clearTimeout(timeoutId);
      this.isLoading = false;
    } catch (error) {
      this.errorMessage = 'Failed to load reports data. Please try again.';

      clearTimeout(timeoutId);
      this.isLoading = false;
    }
  }

  private async loadProducts(): Promise<void> {
    try {
      let attempts = 0;
      const maxAttempts = 10;

      while (this.products.length === 0 && attempts < maxAttempts) {
        const products = await firstValueFrom(this.productService.getProducts());

        if (products && products.length > 0) {
          this.products = products;
          break;
        }

        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      if (this.products.length === 0) {
        this.products = [];
      }
    } catch (error) {
      this.products = [];
    }
  }

  private async loadDailyReport(): Promise<void> {
    try {
      // Always use the sales report API for consistent behavior
      // Ensure strict time bounds: Start of startDate to End of endDate
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);

      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);

      const report = await firstValueFrom(this.transactionService.getSalesReport(queryStartDate, queryEndDate));

      if (!report) {
        this.dailyReport = this.createEmptyReport();
        this.salesReportData = null;
      } else {
        // Store the sales report data for summary calculations
        this.salesReportData = report;

        // Transform sales report data to match daily report format
        this.dailyReport = {
          date: this.startDate,
          totalSales: report.totalSales || 0,
          transactionCount: report.totalTransactions || 0,
          averageTransactionValue: report.totalTransactions > 0 ? report.totalSales / report.totalTransactions : 0,
          topProducts: [] // Will be loaded separately
        };
      }
    } catch (error: any) {
      this.dailyReport = this.createEmptyReport();
      this.salesReportData = null;

      if (error?.status === 0) {
        this.errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else if (error?.status === 404) {
        this.errorMessage = 'Reports endpoint not found. Please check the API configuration.';
      } else if (error?.status === 500) {
        this.errorMessage = 'Server error occurred. Please check the backend logs.';
      } else {
        this.errorMessage = `Failed to load daily report (${error?.status || 'unknown'}). Please try again.`;
      }
    }
  }

  private async loadTopProducts(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);

      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);

      const products = await firstValueFrom(this.transactionService.getTopProducts(queryStartDate, queryEndDate, 10));

      if (products && products.length > 0) {
        this.topProducts = products.map((product: any) => {
          // Use the name from the API response (historical name from transaction)
          // Fall back to current product lookup only if name is not provided
          let productName = product.Name || product.name;
          let productCategory = product.Category || product.category;

          if (!productName || !productCategory) {
            const actualProduct = this.products.find(p => p.id === product.ProductId || p.id === product.productId);

            if (!productName) {
              productName = actualProduct?.name || `Product ${product.ProductId || product.productId}`;
            }

            if (!productCategory) {
              productCategory = actualProduct?.category || 'General';
            }
          }

          return {
            name: productName,
            category: productCategory,
            sales: product.Revenue || product.revenue || 0,
            quantity: product.Quantity || product.quantity || 0
          };
        });
      } else {
        this.topProducts = [];
      }
    } catch (error) {
      this.topProducts = [];
    }
  }

  private async loadAllTimeProductSales(): Promise<void> {
    try {
      const sales = await firstValueFrom(this.transactionService.getAllTimeProductSales());

      if (sales && Array.isArray(sales) && sales.length > 0) {
        this.allTimeProductSales = sales.map((product: any) => {
          let productName = product.Name || product.name;
          let productCategory = product.Category || product.category;

          if (!productName || !productCategory) {
            const actualProduct = this.products.find(p => p.id === product.ProductId || p.id === product.productId);

            if (!productName) {
              productName = actualProduct?.name || `Product ${product.ProductId || product.productId}`;
            }

            if (!productCategory) {
              productCategory = actualProduct?.category || 'General';
            }
          }

          return {
            name: productName,
            category: productCategory,
            sales: product.TotalRevenue || product.totalRevenue || 0,
            quantity: product.TotalSold || product.totalSold || 0,
            lastSoldDate: product.LastSoldDate || product.lastSoldDate || null
          };
        });
        this.updateAllTimeCategories();
      } else {
        this.allTimeProductSales = [];
        this.updateAllTimeCategories();
      }
    } catch (error) {
      this.allTimeProductSales = [];
      this.updateAllTimeCategories();
    }
  }

  private async loadRecentTransactions(): Promise<void> {
    try {
      const startOfRange = new Date(this.startDate);
      startOfRange.setHours(0, 0, 0, 0);

      const endOfRange = new Date(this.endDate);
      endOfRange.setHours(0, 0, 0, 0);
      endOfRange.setDate(endOfRange.getDate() + 1); // Add one day to include the end date

      const allTransactions = await firstValueFrom(this.transactionService.getRecentTransactions(50));

      if (allTransactions && allTransactions.length > 0) {
        const rangeTransactions = allTransactions.filter(t => {
          const transactionDate = new Date(t.timestamp);
          const isInRange = transactionDate >= startOfRange && transactionDate < endOfRange;
          const isCompleted = t.status === 'completed';
          return isInRange && isCompleted;
        });



        this.recentTransactions = rangeTransactions;
      } else {
        this.recentTransactions = [];
      }
    } catch (error) {
      this.recentTransactions = [];
    }
  }

  private async loadProfitLossReport(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.profitLossData = await firstValueFrom(this.transactionService.getProfitLossReport(queryStartDate, queryEndDate));
    } catch (error) {
      this.profitLossData = null;
    }
  }

  private async loadInventoryValuation(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.inventoryData = await firstValueFrom(this.transactionService.getInventoryValuation(queryStartDate, queryEndDate));
    } catch (error) {
      this.inventoryData = null;
    }
  }

  private async loadSupplierBreakdown(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.supplierData = await firstValueFrom(this.transactionService.getSupplierBreakdown(queryStartDate, queryEndDate));
    } catch (error) {
      this.supplierData = null;
    }
  }

  private async loadConsumption(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.consumptionData = await firstValueFrom(this.transactionService.getConsumption(queryStartDate, queryEndDate));
    } catch (error) {
      this.consumptionData = null;
    }
  }

  private async loadActivityMovements(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);

      // Load ingredients map for name lookups
      const ingredients: any[] = await firstValueFrom(this.ingredientService.getAllIngredients());
      this.ingredientsMap.clear();
      for (const ing of ingredients) {
        this.ingredientsMap.set(ing.id, { name: ing.name, unit: ing.unit });
      }

      // Load movements
      this.activityMovements = await firstValueFrom(
        this.stockMovementService.getAllMovements(undefined, queryStartDate, queryEndDate)
      );
      this.activityMovements.sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      this.filterActivityMovements();
    } catch (error) {
      this.activityMovements = [];
      this.filteredActivityMovements = [];
    }
  }

  filterActivityMovements(): void {
    let filtered = this.activityMovements;
    if (this.activityTypeFilter) {
      filtered = filtered.filter((m: any) => m.movementType === this.activityTypeFilter);
    }
    if (this.activitySearchTerm.trim()) {
      const search = this.activitySearchTerm.toLowerCase();
      filtered = filtered.filter((m: any) => {
        const name = this.getIngredientName(m.ingredientId).toLowerCase();
        return name.includes(search);
      });
    }
    this.filteredActivityMovements = filtered;

    // Calculate totals
    this.activityTotalIn = filtered
      .filter((m: any) => m.quantity > 0)
      .reduce((sum: number, m: any) => sum + Math.abs(m.quantity) * (m.unitCost || 0), 0);
    this.activityTotalOut = filtered
      .filter((m: any) => m.quantity < 0)
      .reduce((sum: number, m: any) => sum + Math.abs(m.quantity) * (m.unitCost || 0), 0);
    this.activityNet = this.activityTotalIn - this.activityTotalOut;
  }

  getIngredientName(ingredientId: string): string {
    return this.ingredientsMap.get(ingredientId)?.name || 'Unknown';
  }

  getIngredientUnit(ingredientId: string): string {
    return this.ingredientsMap.get(ingredientId)?.unit || '';
  }

  getMovementTotal(m: any): number {
    return Math.abs(m.quantity) * (m.unitCost || 0);
  }

  formatActivityDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  private async loadAccountantSummary(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.accountantSummary = await firstValueFrom(this.transactionService.getAccountantSummary(queryStartDate, queryEndDate));
    } catch (error) {
      this.accountantSummary = null;
    }
  }

  private async loadPeriodComparison(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      this.periodComparison = await firstValueFrom(this.transactionService.getPeriodComparison(queryStartDate, queryEndDate));
    } catch (error) {
      this.periodComparison = null;
    }
  }

  private async loadCategoryBreakdown(): Promise<void> {
    try {
      const queryStartDate = new Date(this.startDate);
      queryStartDate.setHours(0, 0, 0, 0);
      const queryEndDate = new Date(this.endDate);
      queryEndDate.setHours(23, 59, 59, 999);
      const data = await firstValueFrom(this.transactionService.getCategoryReport(queryStartDate, queryEndDate));
      this.categoryBreakdown = data || [];
    } catch (error) {
      this.categoryBreakdown = [];
    }
  }

  private loadPaymentBreakdown(): void {
    // Extract from accountant summary (already loaded)
    if (this.accountantSummary?.paymentMethodBreakdown) {
      this.paymentBreakdown = this.accountantSummary.paymentMethodBreakdown;
    } else {
      this.paymentBreakdown = [];
    }
  }

  getChangeClass(percent: number): string {
    if (percent > 0) return 'change-up';
    if (percent < 0) return 'change-down';
    return 'change-flat';
  }

  formatChange(percent: number): string {
    if (percent === 0) return '—';
    const arrow = percent > 0 ? '+' : '';
    return `${arrow}${percent.toFixed(1)}%`;
  }

  getPaymentTotal(): number {
    return this.paymentBreakdown.reduce((sum: number, p: any) => sum + (p.total || 0), 0);
  }

  getPaymentPercent(amount: number): number {
    const total = this.getPaymentTotal();
    return total > 0 ? (amount / total) * 100 : 0;
  }

  private createEmptyReport(): any {
    return {
      Date: new Date(),
      TotalSales: 0,
      TransactionCount: 0,
      AverageTransactionValue: 0,
      TopProducts: [],
      totalSales: 0,
      transactionCount: 0,
      averageTransactionValue: 0,
      total: 0,
      count: 0,
      average: 0
    };
  }

  refreshReports(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.loadAllData();
  }

  formatCurrency(amount: number): string {
    if (!amount || isNaN(amount)) return '₱0.00';
    return `₱${amount.toFixed(2)}`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }

  formatTime(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid Time';
      }

      // Convert to Philippine timezone (UTC+8)
      const phTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));

      return phTime.toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Invalid Time';
    }
  }

  formatDateTime(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid Date/Time';
      }

      // Convert to Philippine timezone (UTC+8)
      const phTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));

      return phTime.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Invalid Date/Time';
    }
  }

  getProductName(productId: string): string {
    const product = this.products.find(p => p.id === productId);
    return product?.name || `Product ${productId}`;
  }

  getTotalSales(): number {
    // For custom date ranges, use the sales report data
    if (this.isCustomDateRange && this.salesReportData) {
      return this.salesReportData.totalSales || 0;
    }

    // For today's view, use recent transactions
    if (this.recentTransactions && this.recentTransactions.length > 0) {
      const total = this.recentTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
      return total;
    }

    if (!this.dailyReport) return 0;
    const totalSales = this.dailyReport.totalSales || this.dailyReport.TotalSales || this.dailyReport.total || 0;
    return typeof totalSales === 'number' ? totalSales : 0;
  }

  getTransactionCount(): number {
    // For custom date range, use the sales report data
    if (this.isCustomDateRange && this.salesReportData) {
      return this.salesReportData.totalTransactions || 0;
    }

    // For today's view, use recent transactions
    if (this.recentTransactions && this.recentTransactions.length > 0) {
      return this.recentTransactions.length;
    }

    if (!this.dailyReport) return 0;
    const transactionCount = this.dailyReport.transactionCount || this.dailyReport.TransactionCount || this.dailyReport.count || 0;
    return typeof transactionCount === 'number' ? transactionCount : 0;
  }

  getAverageTransactionValue(): number {
    const totalSales = this.getTotalSales();
    const transactionCount = this.getTransactionCount();

    if (transactionCount > 0) {
      const average = totalSales / transactionCount;
      return average;
    }

    if (!this.dailyReport) return 0;
    const avgValue = this.dailyReport.averageTransactionValue || this.dailyReport.AverageTransactionValue || this.dailyReport.average || 0;
    return typeof avgValue === 'number' ? avgValue : 0;
  }

  getTopProductName(): string {
    if (!this.topProducts || this.topProducts.length === 0) return 'N/A';
    return this.topProducts[0]?.name || 'N/A';
  }

  get kpiItems(): KpiItem[] {
    const pc = this.periodComparison;
    const prevLabel = pc ? this.getPreviousPeriodLabel() : '';
    return [
      {
        label: 'Revenue',
        value: this.formatCurrency(this.getTotalSales()),
        trend: pc ? `${pc.salesChangePercent > 0 ? '+' : ''}${pc.salesChangePercent.toFixed(1)}% vs ${prevLabel}` : this.getDateRangeLabel(),
        trendDirection: pc ? (pc.salesChangePercent > 0 ? 'up' as const : pc.salesChangePercent < 0 ? 'down' as const : 'neutral' as const) : 'neutral' as const
      },
      {
        label: 'Transactions',
        value: this.getTransactionCount(),
        trend: pc ? `${pc.transactionsChangePercent > 0 ? '+' : ''}${pc.transactionsChangePercent.toFixed(1)}% vs ${prevLabel}` : this.getDateRangeLabel(),
        trendDirection: pc ? (pc.transactionsChangePercent > 0 ? 'up' as const : pc.transactionsChangePercent < 0 ? 'down' as const : 'neutral' as const) : 'neutral' as const
      },
      {
        label: 'Avg Order Value',
        value: this.formatCurrency(this.getAverageTransactionValue()),
        trend: pc ? `${pc.avgOrderChangePercent > 0 ? '+' : ''}${pc.avgOrderChangePercent.toFixed(1)}% vs ${prevLabel}` : 'per transaction',
        trendDirection: pc ? (pc.avgOrderChangePercent > 0 ? 'up' as const : pc.avgOrderChangePercent < 0 ? 'down' as const : 'neutral' as const) : 'neutral' as const
      },
      {
        label: 'Gross Margin',
        value: this.profitLossData ? `${this.profitLossData.marginPercent.toFixed(1)}%` : 'N/A',
        trend: this.profitLossData ? `${this.formatCurrency(this.profitLossData.grossProfit)} profit` : '',
        trendDirection: this.profitLossData ? (this.profitLossData.marginPercent > 50 ? 'up' as const : this.profitLossData.marginPercent < 30 ? 'down' as const : 'neutral' as const) : 'neutral' as const
      }
    ];
  }

  getMarginClass(margin: number): string {
    if (margin > 50) return 'margin-good';
    if (margin < 30) return 'margin-bad';
    return 'margin-ok';
  }

  hasData(): boolean {
    return this.getTransactionCount() > 0 || this.topProducts.length > 0 || this.recentTransactions.length > 0;
  }

  // --- Insights generation ---
  generateInsights(): void {
    const insights: typeof this.insights = [];
    const pc = this.periodComparison;
    const pnl = this.profitLossData;
    const inv = this.inventoryData;

    if (pc) {
      // Revenue change
      if (pc.salesChangePercent > 5) {
        insights.push({ level: 'positive', icon: '\ud83d\udcc8', headline: `Revenue up ${pc.salesChangePercent.toFixed(1)}% this period`, detail: `${this.formatCurrency(pc.currentSales)} vs ${this.formatCurrency(pc.previousSales)} in the previous period (${this.getPreviousPeriodLabel()})` });
      } else if (pc.salesChangePercent < -15) {
        insights.push({ level: 'alert', icon: '\ud83d\udea8', headline: `Revenue down ${Math.abs(pc.salesChangePercent).toFixed(1)}%`, detail: `${this.formatCurrency(pc.currentSales)} vs ${this.formatCurrency(pc.previousSales)} previously. Review product availability and traffic.` });
      } else if (pc.salesChangePercent < -5) {
        insights.push({ level: 'warning', icon: '\u26a0\ufe0f', headline: `Revenue dipped ${Math.abs(pc.salesChangePercent).toFixed(1)}%`, detail: `${this.formatCurrency(pc.currentSales)} vs ${this.formatCurrency(pc.previousSales)} in the previous period` });
      }

      // Transaction count
      if (pc.transactionsChangePercent > 5) {
        insights.push({ level: 'positive', icon: '\ud83d\udcc8', headline: `Transaction volume up ${pc.transactionsChangePercent.toFixed(1)}%`, detail: `${pc.currentTransactions} orders vs ${pc.previousTransactions} previously` });
      }
    }

    if (pnl) {
      // Margin health
      if (pnl.marginPercent < 30) {
        insights.push({ level: 'alert', icon: '\ud83d\udea8', headline: `Gross margin critically low at ${pnl.marginPercent.toFixed(1)}%`, detail: 'Review ingredient costs and product pricing urgently' });
      } else if (pnl.marginPercent >= 30 && pnl.marginPercent < 50) {
        insights.push({ level: 'warning', icon: '\u26a0\ufe0f', headline: `Gross margin at ${pnl.marginPercent.toFixed(1)}%`, detail: 'Consider reviewing pricing or ingredient costs to improve profitability' });
      }
    }

    if (inv) {
      // Waste
      if (inv.wasteAndShrinkage > 0) {
        insights.push({ level: 'warning', icon: '\ud83d\uddd1\ufe0f', headline: `Waste cost: ${this.formatCurrency(inv.wasteAndShrinkage)}`, detail: 'Review waste entries in the Costs tab to identify causes' });
      }
      // Low stock
      if (inv.lowStockCount > 3) {
        insights.push({ level: 'alert', icon: '\ud83d\udce6', headline: `${inv.lowStockCount} ingredients are low on stock`, detail: 'Check inventory levels and reorder soon' });
      } else if (inv.lowStockCount > 0) {
        insights.push({ level: 'info', icon: '\u2139\ufe0f', headline: `${inv.lowStockCount} ingredient${inv.lowStockCount > 1 ? 's' : ''} running low`, detail: 'Monitor stock levels' });
      }
    }

    // All clear
    if (insights.length === 0 && this.hasData()) {
      insights.push({ level: 'positive', icon: '\u2705', headline: 'All clear', detail: 'All metrics look stable for this period' });
    }

    this.insights = insights;
  }

  getPreviousPeriodLabel(): string {
    const durationMs = this.endDate.getTime() - this.startDate.getTime();
    const prevEnd = new Date(this.startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    return `${this.formatDisplayDate(prevStart)} \u2013 ${this.formatDisplayDate(prevEnd)}`;
  }

  // --- Date presets ---
  setDatePreset(preset: string): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.activeDatePreset = preset;

    switch (preset) {
      case 'today':
        this.startDate = new Date(today);
        this.endDate = new Date(today);
        this.isCustomDateRange = false;
        break;
      case '7d':
        this.endDate = new Date(today);
        this.startDate = new Date(today);
        this.startDate.setDate(this.startDate.getDate() - 6);
        this.isCustomDateRange = true;
        break;
      case '30d':
        this.endDate = new Date(today);
        this.startDate = new Date(today);
        this.startDate.setDate(this.startDate.getDate() - 29);
        this.isCustomDateRange = true;
        break;
      case 'thisMonth':
        this.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        this.endDate = new Date(today);
        this.isCustomDateRange = true;
        break;
      case 'lastMonth':
        this.startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        this.endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        this.isCustomDateRange = true;
        break;
    }
    this.selectedDateRange = this.getDateRangeLabel();
    this.loadAllData();
  }

  // --- Inventory tab collapsible toggle ---
  toggleInventorySection(section: string): void {
    this.inventoryExpanded[section] = !this.inventoryExpanded[section];
    // Lazy-load data when expanding
    if (this.inventoryExpanded[section]) {
      if (section === 'activity' && this.activityMovements.length === 0) {
        this.loadActivityMovements();
      }
      if (section === 'suppliers' && !this.supplierData) {
        this.loadSupplierBreakdown();
      }
      if (section === 'consumption' && !this.consumptionData) {
        this.loadConsumption();
      }
    }
  }

  // --- P&L quick-add expense modal ---
  openExpenseModal(): void {
    this.showExpenseModal = true;
  }

  onExpenseModalSaved(): void {
    this.showExpenseModal = false;
    this.loadProfitLossReport();
    this.loadAccountantSummary();
  }

  onExpenseModalClosed(): void {
    this.showExpenseModal = false;
  }

  // --- Sparkline data (last 7 data points from salesTrendData) ---
  getSparklineData(): number[] {
    if (!this.chartData || this.chartData.length === 0) return [];
    const data = this.chartData.slice(-7).map((d: any) => d.sales);
    return data;
  }

  getSparklineMax(): number {
    const data = this.getSparklineData();
    if (data.length === 0) return 1;
    return Math.max(...data, 1);
  }

  canExportCurrentTab(): boolean {
    switch (this.activeTab) {
      case 'pnl': return !!this.profitLossData;
      case 'inventory': return !!this.inventoryData;
      default: return this.hasData();
    }
  }

  exportCurrentTab(): void {
    if (this.exportingKey) return;
    const section = this.activeTab === 'dashboard' ? 'full' : this.activeTab;
    this.exportingKey = `${section}:xlsx`;

    const start = new Date(this.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.endDate);
    end.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      section,
      format: 'xlsx',
      startDate: this.toIsoNoTz(start),
      endDate: this.toIsoNoTz(end)
    });

    this.http.get(`${environment.apiUrl}/reports/export?${params.toString()}`, { responseType: 'blob', observe: 'response' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const blob = response.body;
          if (!blob) {
            this.toast.error('Export returned no content.');
            this.exportingKey = null;
            return;
          }
          const fallbackName = `${section}_${new Date().toISOString().split('T')[0]}.xlsx`;
          const filename = this.extractFilename(response.headers.get('content-disposition')) ?? fallbackName;
          this.triggerDownload(blob, filename);
          this.toast.success(`${section.toUpperCase()} export ready.`);
          this.exportingKey = null;
        },
        error: () => {
          this.toast.error('Export failed. Please try again.');
          this.exportingKey = null;
        }
      });
  }

  private toIsoNoTz(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private extractFilename(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
    return match ? decodeURIComponent(match[1].replace(/"/g, '')) : null;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  get filteredAllTimeSales(): any[] {
    let filtered = [...this.allTimeProductSales];

    // Category filter
    if (this.allTimeSelectedCategory) {
      filtered = filtered.filter(p => p.category === this.allTimeSelectedCategory);
    }

    // Search filter
    if (this.allTimeSearchQuery) {
      const query = this.allTimeSearchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (this.allTimeSortBy === 'sales') {
        return b.sales - a.sales;
      } else if (this.allTimeSortBy === 'quantity') {
        return b.quantity - a.quantity;
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }

  selectAllTimeCategory(category: string): void {
    this.allTimeSelectedCategory = category;
  }

  onLeaderboardSearchChange(term: string): void {
    this.allTimeSearchQuery = term;
  }

  onLeaderboardSortChange(value: string): void {
    this.allTimeSortBy = value as 'sales' | 'quantity' | 'name';
  }

  onLeaderboardCategoryChange(category: string): void {
    this.allTimeSelectedCategory = category;
  }

  private updateAllTimeCategories(): void {
    const categories = Array.from(new Set(
      this.allTimeProductSales
        .map(product => product.category)
        .filter((category: string | undefined) => !!category)
    )) as string[];

    categories.sort((a, b) => a.localeCompare(b));
    this.allTimeCategories = categories;

    if (this.allTimeSelectedCategory && !this.allTimeCategories.includes(this.allTimeSelectedCategory)) {
      this.allTimeSelectedCategory = '';
    }
  }

  getMaxAllTimeSales(): number {
    if (this.allTimeProductSales.length === 0) return 1;
    return Math.max(...this.allTimeProductSales.map(p => p.sales), 1);
  }

  getMaxAllTimeQuantity(): number {
    if (this.allTimeProductSales.length === 0) return 1;
    return Math.max(...this.allTimeProductSales.map(p => p.quantity), 1);
  }

  openTransactionDetails(transaction: Transaction): void {
    this.selectedTransaction = transaction;
    this.isTransactionModalOpen = true;
  }

  closeTransactionModal(): void {
    this.isTransactionModalOpen = false;
    this.selectedTransaction = null;
  }

  // Helper methods for Receipt UI
  getReceiptNumber(transaction: Transaction | null): string | number {
    if (!transaction) return 'N/A';
    // Prefer daily receipt number if available
    const anyTransaction = transaction as any;
    const receiptNumber = anyTransaction.receiptNumber || anyTransaction.ReceiptNumber;
    if (receiptNumber !== undefined && receiptNumber !== null) {
      return receiptNumber;
    }
    return transaction.id || 'N/A';
  }

  getPaymentMethodDisplay(method: string | undefined): string {
    if (!method) return 'N/A';
    if (method === 'cash') return 'Cash';
    if (method === 'gcash') return 'GCash';
    return method.charAt(0).toUpperCase() + method.slice(1);
  }

  getTemperature(item: any): string | null {
    if (!item) return null;
    const temp = item.temperature;
    if (!temp && temp !== 0) return null;

    if (typeof temp === 'number') {
      if (temp === 1) return 'hot';
      if (temp === 2) return 'cold';
      return null;
    }

    if (typeof temp === 'string') {
      const lowerTemp = temp.toLowerCase();
      if (lowerTemp === 'hot' || lowerTemp === '1') return 'hot';
      if (lowerTemp === 'cold' || lowerTemp === 'iced' || lowerTemp === '2') return 'cold';
      return null;
    }

    return null;
  }

  isHot(item: any): boolean {
    return this.getTemperature(item) === 'hot';
  }

  isCold(item: any): boolean {
    const temp = this.getTemperature(item);
    return temp === 'cold' || temp === 'iced';
  }

  hasAddOns(item: any): boolean {
    if (!item) return false;
    const addOns = item.addOns || item.addons;
    return Array.isArray(addOns) && addOns.length > 0;
  }

  getAddOns(item: any): any[] {
    if (!item) return [];
    const addOns = item.addOns || item.addons;
    return Array.isArray(addOns) ? addOns : [];
  }

  getSubtotal(transaction: Transaction | null): number {
    if (!transaction) return 0;
    return transaction.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getDiscountTotal(transaction: Transaction | null): number {
    if (!transaction) return 0;
    return transaction.items.reduce((sum, item) => {
      const discount = (item as any).discount;
      return sum + (discount?.amount || 0);
    }, 0);
  }

  getChange(transaction: Transaction | null): number {
    if (!transaction) return 0;
    const anyTransaction = transaction as any;
    const amountReceived = anyTransaction.amountReceived || anyTransaction.AmountReceived || 0;
    if (!amountReceived) return 0;
    return Math.max(0, amountReceived - transaction.total);
  }

  formatPrice(amount: number): string {
    return this.formatCurrency(amount);
  }

  getAmountReceived(transaction: Transaction | null): number {
    if (!transaction) return 0;
    const anyTransaction = transaction as any;
    return anyTransaction.amountReceived || anyTransaction.AmountReceived || 0;
  }

  printSummary(): void {
    window.print();
  }

  async printReceipt(): Promise<void> {
    if (!this.selectedTransaction) return;

    try {
      // Use the shared thermal printer service to ensure consistent format with the sidebar
      await this.thermalPrinter.printReceipt(this.selectedTransaction, true);
    } catch (error: any) {
      this.toast.error(error.message || 'Failed to print receipt');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

