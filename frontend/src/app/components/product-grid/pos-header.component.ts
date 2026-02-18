import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-pos-header',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './pos-header.component.html',
    styleUrls: ['./pos-header.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class POSHeaderComponent {
    @Input() isOnline = true;
    @Input() cartItemCount = 0;

    @Output() openCart = new EventEmitter<void>();
    @Output() refresh = new EventEmitter<void>();

    onOpenCart(): void {
        this.openCart.emit();
    }

    onRefresh(): void {
        this.refresh.emit();
    }
}
