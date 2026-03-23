import { Directive, Input, TemplateRef } from '@angular/core';

@Directive({
  selector: '[cellDef]',
  standalone: true
})
export class CellDefDirective {
  @Input('cellDef') columnName = '';
  constructor(public templateRef: TemplateRef<any>) {}
}
