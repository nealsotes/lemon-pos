import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

/** Row shape of GET /api/products/best-sellers (serialized PascalCase → camelCase fallback). */
export interface BestSellerEntry {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

/**
 * Loads the top-selling product ids for a trailing window and publishes them as
 * a Set so the POS grid and public menu can badge "Best seller" on those cards.
 * Failures degrade silently to an empty set (badges simply never show).
 */
@Injectable({ providedIn: 'root' })
export class BestSellerService {
  private apiUrl = '/api';
  private bestSellerIdsSubject = new BehaviorSubject<Set<string>>(new Set<string>());

  constructor(private http: HttpClient) {}

  /** Best-seller id set as an observable stream (emits current value immediately). */
  get bestSellerIds$() {
    return this.bestSellerIdsSubject.asObservable();
  }

  /** Current snapshot without subscribing. */
  getBestSellerIds(): Set<string> {
    return this.bestSellerIdsSubject.value;
  }

  isBestSeller(productId: string): boolean {
    return this.getBestSellerIds().has(productId);
  }

  /** Fetch top sellers over the last `days` days and publish their ids. */
  load(days = 30, count = 10): void {
    this.http
      .get<BestSellerEntry[]>(`${this.apiUrl}/products/best-sellers?days=${days}&count=${count}`)
      .pipe(
        tap({
          next: (entries) => this.bestSellerIdsSubject.next(this.toIdSet(entries)),
          error: () => this.bestSellerIdsSubject.next(new Set<string>())
        }),
        catchError(() => [])
      )
      .subscribe();
  }

  /** Refresh after a sale completes so freshly sold items can move into (or up) the set. */
  refresh(): void {
    this.load();
  }

  private toIdSet(entries: BestSellerEntry[] | null | undefined): Set<string> {
    const ids = new Set<string>();
    for (const entry of entries || []) {
      const id = entry?.productId ?? (entry as any)?.ProductId;
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }
}