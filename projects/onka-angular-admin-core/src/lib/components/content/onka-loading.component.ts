import { Component, OnInit, AfterViewInit } from '@angular/core';

/**
 * Loading component
 */
@Component({
  selector: 'onka-loading',
  template: '<mat-progress-bar mode="indeterminate"></mat-progress-bar>'
})
export class OnkaLoadingComponent implements OnInit, AfterViewInit {
  ngOnInit(): void {}

  ngAfterViewInit() {}
}
