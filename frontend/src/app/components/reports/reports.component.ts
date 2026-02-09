import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { TransactionService } from '../../services/transaction.service';
import { ProductService } from '../../services/product.service';
import { ThermalPrinterService } from '../../services/thermal-printer.service';
import { Transaction } from '../../models/transaction.model';
import { Product } from '../../models/product.model';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatSnackBarModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css']
})
export class ReportsComponent implements OnInit {
  selectedTransaction: Transaction | null = null;
  isTransactionModalOpen: boolean = false;
  dailyReport: any = null;
  today: Date = new Date();
  topProducts: any[] = [];
  recentTransactions: Transaction[] = [];
  products: Product[] = [];
  errorMessage: string = '';
  isLoading: boolean = false;

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

  // All-time product sales (no date filtering)
  allTimeProductSales: any[] = [];
  allTimeSearchQuery: string = '';
  allTimeSortBy: 'sales' | 'quantity' | 'name' = 'sales';
  allTimeCategories: string[] = [];
  allTimeSelectedCategory: string = 'all';

  constructor(
    private transactionService: TransactionService,
    private productService: ProductService,
    private thermalPrinter: ThermalPrinterService,
    private snackBar: MatSnackBar
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
        this.selectedDateRange = `${this.formatDisplayDate(this.startDate)} - ${this.formatDisplayDate(this.endDate)}`;
        this.loadAllData();
      }
    }
  }

  onStartDateChange(event: any): void {
    const dateValue = event.target.value;
    if (dateValue) {
      this.startDate = new Date(dateValue);
      this.onDateRangeChange();
    }
  }

  onEndDateChange(event: any): void {
    const dateValue = event.target.value;
    if (dateValue) {
      this.endDate = new Date(dateValue);
      this.onDateRangeChange();
    }
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
      return;
    }

    // Process daily sales data for chart
    this.chartData = this.salesTrendData.map((day: any, index: number) => ({
      date: new Date(day.date),
      sales: day.totalSales || 0,
      transactions: day.transactionCount || 0,
      formattedDate: this.formatChartDate(new Date(day.date)),
      color: this.getBarColor(index) // Add color property
    }));

    // Sort by date
    this.chartData.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

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

    // Calculate height as percentage of max sales, with minimum height of 5%
    const height = (sales / maxSales) * 100;
    return Math.max(height, 5);
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
    this.isLoading = false;

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

  hasData(): boolean {
    return this.getTransactionCount() > 0 || this.topProducts.length > 0 || this.recentTransactions.length > 0;
  }

  // Export functionality
  exportData(format: 'csv' | 'excel' | 'pdf'): void {
    try {
      switch (format) {
        case 'csv':
          this.exportToCSV();
          break;
        case 'excel':
          this.exportToExcel();
          break;
        case 'pdf':
          this.exportToPDF();
          break;
      }
    } catch (error) {
      this.snackBar.open(`Failed to export to ${format.toUpperCase()}. Please try again.`, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  private exportToCSV(): void {
    const data = this.prepareExportData();
    const csvContent = this.convertToCSV(data);
    this.downloadFile(csvContent, `reports_${this.getExportDate()}.csv`, 'text/csv');
    this.snackBar.open('CSV export completed successfully!', 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  private exportToExcel(): void {
    const data = this.prepareExportData();
    const excelContent = this.convertToExcel(data);
    this.downloadFile(excelContent, `reports_${this.getExportDate()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    this.snackBar.open('Excel export completed successfully!', 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  private exportToPDF(): void {
    const data = this.prepareExportData();
    this.generatePDF(data);
  }

  private prepareExportData(): any {
    const exportData = {
      reportInfo: {
        title: this.isCustomDateRange ? 'Custom Date Range Report' : 'Today\'s Report',
        dateRange: this.getDateRangeLabel(),
        generatedAt: new Date().toLocaleString('en-PH'),
        summary: {
          totalSales: this.getTotalSales(),
          transactionCount: this.getTransactionCount(),
          averageTransactionValue: this.getAverageTransactionValue()
        }
      },
      salesTrend: this.chartData.map((item, index) => ({
        date: item.formattedDate,
        sales: item.sales,
        transactions: item.transactions,
        color: this.getBarColor(index)
      })),
      topProducts: this.topProducts.map((product, index) => ({
        rank: index + 1,
        name: product.name,
        category: product.category,
        sales: product.sales,
        quantity: product.quantity
      })),
      recentTransactions: this.recentTransactions.map(transaction => ({
        id: transaction.id,
        timestamp: this.formatDateTime(transaction.timestamp),
        items: transaction.items.length,
        total: transaction.total,
        status: transaction.status
      }))
    };

    return exportData;
  }

  private convertToCSV(data: any): string {
    let csv = 'Report Data\n\n';

    // Summary Section
    csv += 'SUMMARY\n';
    csv += 'Title,' + data.reportInfo.title + '\n';
    csv += 'Date Range,' + data.reportInfo.dateRange + '\n';
    csv += 'Generated At,' + data.reportInfo.generatedAt + '\n';
    csv += 'Total Sales,' + data.reportInfo.summary.totalSales + '\n';
    csv += 'Transaction Count,' + data.reportInfo.summary.transactionCount + '\n';
    csv += 'Average Transaction Value,' + data.reportInfo.summary.averageTransactionValue + '\n\n';

    // Sales Trend Section
    csv += 'SALES TREND\n';
    csv += 'Date,Sales,Transactions\n';
    data.salesTrend.forEach((item: any) => {
      csv += `${item.date},${item.sales},${item.transactions}\n`;
    });
    csv += '\n';

    // Top Products Section
    csv += 'TOP PRODUCTS\n';
    csv += 'Rank,Name,Category,Sales,Quantity\n';
    data.topProducts.forEach((product: any) => {
      csv += `${product.rank},${product.name},${product.category},${product.sales},${product.quantity}\n`;
    });
    csv += '\n';

    // Recent Transactions Section
    csv += 'RECENT TRANSACTIONS\n';
    csv += 'ID,Timestamp,Items,Total,Status\n';
    data.recentTransactions.forEach((transaction: any) => {
      csv += `${transaction.id},${transaction.timestamp},${transaction.items},${transaction.total},${transaction.status}\n`;
    });

    return csv;
  }

  private convertToExcel(data: any): string {
    // For now, we'll create a simple HTML table that can be opened in Excel
    // In a production app, you'd use a library like SheetJS or similar
    let html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reports Export</title>
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .section { margin-top: 20px; }
            .section-title { font-size: 18px; font-weight: bold; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>${data.reportInfo.title}</h1>
          <p><strong>Date Range:</strong> ${data.reportInfo.dateRange}</p>
          <p><strong>Generated At:</strong> ${data.reportInfo.generatedAt}</p>
          
          <div class="section">
            <div class="section-title">Summary</div>
            <table>
              <tr><th>Metric</th><th>Value</th></tr>
              <tr><td>Total Sales</td><td>${data.reportInfo.summary.totalSales}</td></tr>
              <tr><td>Transaction Count</td><td>${data.reportInfo.summary.transactionCount}</td></tr>
              <tr><td>Average Transaction Value</td><td>${data.reportInfo.summary.averageTransactionValue}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <div class="section-title">Sales Trend</div>
            <table>
              <tr><th>Date</th><th>Sales</th><th>Transactions</th></tr>
              ${data.salesTrend.map((item: any) => `<tr><td>${item.date}</td><td>${item.sales}</td><td>${item.transactions}</td></tr>`).join('')}
            </table>
          </div>
          
          <div class="section">
            <div class="section-title">Top Products</div>
            <table>
              <tr><th>Rank</th><th>Name</th><th>Category</th><th>Sales</th><th>Quantity</th></tr>
              ${data.topProducts.map((product: any) => `<tr><td>${product.rank}</td><td>${product.name}</td><td>${product.category}</td><td>${product.sales}</td><td>${product.quantity}</td></tr>`).join('')}
            </table>
          </div>
          
          <div class="section">
            <div class="section-title">Recent Transactions</div>
            <table>
              <tr><th>ID</th><th>Timestamp</th><th>Items</th><th>Total</th><th>Status</th></tr>
              ${data.recentTransactions.map((transaction: any) => `<tr><td>${transaction.id}</td><td>${transaction.timestamp}</td><td>${transaction.items}</td><td>${transaction.total}</td><td>${transaction.status}</td></tr>`).join('')}
            </table>
          </div>
        </body>
      </html>
    `;

    return html;
  }

  private generatePDF(data: any): void {
    // For now, we'll show a message that PDF export is coming soon
    // In a production app, you'd use a library like jsPDF or similar
    this.snackBar.open('PDF export is coming soon! For now, please use CSV or Excel export.', 'Close', {
      duration: 4000,
      panelClass: ['info-snackbar']
    });
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private getExportDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  get filteredAllTimeSales(): any[] {
    let filtered = [...this.allTimeProductSales];

    // Category filter
    if (this.allTimeSelectedCategory !== 'all') {
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

  private updateAllTimeCategories(): void {
    const categories = Array.from(new Set(
      this.allTimeProductSales
        .map(product => product.category)
        .filter((category: string | undefined) => !!category)
    )) as string[];

    categories.sort((a, b) => a.localeCompare(b));
    this.allTimeCategories = categories;

    if (this.allTimeSelectedCategory !== 'all' && !this.allTimeCategories.includes(this.allTimeSelectedCategory)) {
      this.allTimeSelectedCategory = 'all';
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

  async printReceipt(): Promise<void> {
    if (!this.selectedTransaction) return;

    try {
      // Use the shared thermal printer service to ensure consistent format with the sidebar
      await this.thermalPrinter.printReceipt(this.selectedTransaction, true);
    } catch (error: any) {
      this.snackBar.open(error.message || 'Failed to print receipt', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }
}




