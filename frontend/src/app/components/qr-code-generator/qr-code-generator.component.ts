import { Component, OnInit, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-qr-code-generator',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qr-code-generator.component.html',
  styleUrls: ['./qr-code-generator.component.css']
})
export class QrCodeGeneratorComponent implements OnInit {
  @Input() menuUrl: string = '';
  @Input() size: number = 200;
  @Input() showDownload: boolean = true;
  @Input() showUrl: boolean = true;

  qrData: string = '';

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.generateQrData();
  }

  private generateQrData(): void {
    if (!this.menuUrl) {
      // Generate default menu URL based on current location
      const baseUrl = window.location.origin;
      // Ensure we use the full URL with protocol for QR codes
      this.menuUrl = `${baseUrl}/menu`;
    }
    // Ensure the QR data uses the full URL
    this.qrData = this.menuUrl;
    this.cdr.markForCheck();
  }

  downloadQrCode(): void {
    const canvas = document.querySelector('qrcode canvas') as HTMLCanvasElement;
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'lemon-pos-advance-menu-qr-code.png';
          link.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  }

  copyUrl(): void {
    navigator.clipboard.writeText(this.menuUrl).then(() => {
      // You could show a toast notification here
      alert('URL copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy URL:', err);
    });
  }

  printQrCode(): void {
    window.print();
  }
}


