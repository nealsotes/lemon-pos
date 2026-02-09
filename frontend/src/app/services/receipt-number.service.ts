import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ReceiptNumberService {
  private readonly STORAGE_KEY = 'receiptNumberData';

  /**
   * Get the next receipt number for today
   * Resets to 1 if it's a new day
   */
  getNextReceiptNumber(): number {
    const today = this.getTodayString();
    const stored = this.getStoredData();

    // If it's a new day, reset to 1
    if (stored.date !== today) {
      this.saveReceiptNumber(1, today);
      return 1;
    }

    // Increment and save
    const nextNumber = stored.number + 1;
    this.saveReceiptNumber(nextNumber, today);
    return nextNumber;
  }

  /**
   * Get the current receipt number without incrementing
   */
  getCurrentReceiptNumber(): number {
    const today = this.getTodayString();
    const stored = this.getStoredData();

    // If it's a new day, return 0 (no receipts yet today)
    if (stored.date !== today) {
      return 0;
    }

    return stored.number;
  }

  /**
   * Reset receipt number to 1 for today (manual reset)
   */
  resetReceiptNumber(): void {
    const today = this.getTodayString();
    this.saveReceiptNumber(1, today);
  }

  /**
   * Get today's date as a string (YYYY-MM-DD)
   */
  private getTodayString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get stored receipt number data from localStorage
   */
  private getStoredData(): { number: number; date: string } {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          number: parsed.number || 0,
          date: parsed.date || ''
        };
      }
    } catch (error) {
      // Error reading from localStorage
    }
    return { number: 0, date: '' };
  }

  /**
   * Save receipt number data to localStorage
   */
  private saveReceiptNumber(number: number, date: string): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ number, date }));
    } catch (error) {
      // Error saving to localStorage
    }
  }
}





