import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

@Component({
    selector: 'app-product-filters',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './product-filters.component.html',
    styleUrls: ['./product-filters.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductFiltersComponent implements OnInit, OnDestroy {
    @Input() categories: string[] = [];
    @Input() selectedCategory = 'all';
    @Input() searchTerm = '';

    @Output() search = new EventEmitter<string>();
    @Output() categoryChange = new EventEmitter<string>();

    private searchSubject = new Subject<string>();
    private destroy$ = new Subject<void>();

    ngOnInit(): void {
        this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntil(this.destroy$)
        ).subscribe(term => {
            this.search.emit(term);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onSearchInput(term: string): void {
        this.searchSubject.next(term);
    }

    selectCategory(category: string): void {
        this.categoryChange.emit(category);
    }
}
