import {
  Component,
  OnInit,
  ViewChild,
  AfterViewInit,
  Input,
  ContentChild,
  ElementRef,
  ComponentFactoryResolver,
  Injector,
  OnDestroy,
  TemplateRef,
} from '@angular/core';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { SelectionModel } from '@angular/cdk/collections';
import { merge, Observable, Subscription, BehaviorSubject } from 'rxjs';
import { tap, delay, catchError } from 'rxjs/operators';
import { ComponentPortal } from '@angular/cdk/portal';
import { ApiBusinessLogic } from '../../business/services/api-business-logic';
import { ApiSearchRequest } from '../../domain/api/api-request';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { OnkaFilterPass } from '../../domain/onka/onka-filter-pass';
import { OnkaPageConfig } from '../../domain/onka/onka-page-config';
import { OnkaPageField } from '../../domain/onka/onka-page-field';
import { OnkaFilterComponent } from '../onka-inputs.component';
import { OnkaGridPass } from '../../domain/onka/onka-grid-pass';
import { OnkaGridFieldComponent } from '../onka-fields.component';
import { OnkaSearchLeftComponent } from '../content/onka-search-left.component';
import { OnkaSearchRightComponent } from '../content/onka-search-right.component';
import { OnkaService } from '../../business/services/onka-service';
import { OnkaPageStatus } from '../../domain/onka/onka-types';
import { UIManagerService } from '../../business/uimanager.service';

/**
 * Onka search component
 */
@Component({
  selector: 'onka-list',
  templateUrl: './onka-list.component.html',
})
export class OnkaListComponent implements OnInit, AfterViewInit, OnDestroy {
  /**
   * Configuration data
   */
  @Input() pageConfig: OnkaPageConfig;

  /**
   * Filter columns
   */
  @Input() filterColumns: OnkaPageField[];

  /**
   * Grid columns
   */
  @Input() displayedColumns: OnkaPageField[];

  /**
   * Initial values for filter data
   */
  @Input() initialValues: any = {};

  /**
   * Enable checkbox for bulk actions
   */
  @Input() checkbox: boolean = false;

  @Input() extraRowActions: (data: any) => any;

  /**
   * Left side content
   */
  @ContentChild(OnkaSearchLeftComponent) searchFieldsLeft: ElementRef;

  /**
   * Right side content
   */
  @ContentChild(OnkaSearchRightComponent) searchFieldsRight: ElementRef;

/**
   * 
   */
  @ContentChild("rowExtra", { read: TemplateRef }) rowExtra: TemplateRef<any>;

  /**
   * All column list to display
   */
  displayedAllColumns: string[] = [];

  /**
   * Datasource
   */
  dataSource = new MatTableDataSource();

  /**
   * Sort
   */
  @ViewChild(MatSort, { static: true }) sort: MatSort;

  /**
   * Paginator
   */
  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator;

  /**
   * Table component
   */
  @ViewChild(MatTable) table: MatTable<any>;

  /**
   * Request object data
   */
  request: ApiSearchRequest = new ApiSearchRequest();

  /**
   * Filter form
   */
  form: FormGroup;

  /**
   * Page status
   */
  status: OnkaPageStatus;

  /**
   * Refresh subscription
   */
  refreshSubscription: Subscription;

  /**
   * Searched result data
   */
  data = [];

  /**
   * filter data
   */
  filterData = {};

  /**
   * Default values
   */
  defaultValues: any;

  /**
   * Datasource connect data
   */
  dataConnect: BehaviorSubject<any>;

  /**
   * Filter portal components
   */
  _filterPortals = {};

  /**
   * Grid portal components
   */
  _gridPortals = {};

  constructor(
    private fb: FormBuilder,
    private business: ApiBusinessLogic,
    private componentFactoryResolver: ComponentFactoryResolver,
    private injector: Injector,
    public onkaService: OnkaService,
    public uiManager: UIManagerService
  ) {}

  ngOnInit(): void {
    this.filterColumns = this.pageConfig.fields.filter((x) => x.inFilter);
    this.displayedColumns = this.pageConfig.fields.filter((x) => x.inGrid);
    this.form = this.fb.group({});
    this.dataSource = new MatTableDataSource();
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sortData = (data, sort) => {
      console.log('sortData', data, sort);
      return data;
    };
    this.dataConnect = this.dataSource.connect();
    this.onkaService.selectedPage.next(this.pageConfig);
    this.refreshSubscription = this.onkaService.refreshPage.subscribe(() => {
      this.loadData();
    });
    this.defaultValues = this.onkaService.getDefaultValues();
    this.filterData = { ...this.initialValues, ...this.defaultValues };
  }

  ngAfterViewInit() {
    this.sort.sortChange.subscribe(() => (this.paginator.pageIndex = 0));

    merge(this.sort.sortChange, this.paginator.page)
      .pipe(tap(() => this.loadData()))
      .subscribe();

    setTimeout(() => {
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  customSort(event) {
    console.log('e', event);
    return false;
  }

  /**
   * Get filter components
   * @param item field
   */
  getFilterPortal(item: OnkaPageField) {
    if (this.onkaService.isHideDefaultFilters()) {
      // hide filters active
      if (Object.keys(this.defaultValues).indexOf(item.name) != -1) return null;
    }
    if (this._filterPortals[item.name]) return this._filterPortals[item.name];
    if (!this.form.controls[item.name])
      this.form.addControl(
        item.name,
        new FormControl(this.filterData[item.name] || '', {})
      );
    var portalInjector = Injector.create({
      providers: [
        {
          provide: FormControl,
          useValue: this.form.get(item.name),
        },
        {
          provide: OnkaFilterPass,
          useValue: new OnkaFilterPass({
            pageConfig: this.pageConfig,
            column: item,
            loadData: () => this.loadData(),
            onSubmit: () => this.onSubmit(),
          }),
        },
      ],
      parent: this.injector,
    });
    this._filterPortals[item.name] = new ComponentPortal(
      item.filterComponent || OnkaFilterComponent,
      null,
      portalInjector,
      this.componentFactoryResolver
    );
    return this._filterPortals[item.name];
  }

  /**
   * Get grid components
   * @param item
   * @param rowData
   */
  getGridPortal(item: OnkaPageField, rowData) {
    var key =
      item.name + this.pageConfig.primaryKeys.map((x) => rowData[x]).join('_');
    if (this._gridPortals[key]) return this._gridPortals[key];
    var portalInjector = Injector.create({
      providers: [
        {
          provide: OnkaGridPass,
          useValue: new OnkaGridPass({
            pageConfig: this.pageConfig,
            column: item,
            data: rowData,
          }),
        },
      ],
      parent: this.injector,
    });
    this._gridPortals[key] = new ComponentPortal(
      item.gridComponent || OnkaGridFieldComponent,
      null,
      portalInjector,
      this.componentFactoryResolver
    );
    return this._gridPortals[key];
  }

  /**
   * Make an api request
   */
  loadData() {
    this.status = 'loading';
    this.request.pagination.page = this.paginator.pageIndex + 1;
    this.request.pagination.perPage = this.paginator.pageSize;
    this.request.sort.field = this.sort.active || 'id';
    this.request.sort.order = (this.sort.direction || 'asc').toUpperCase();
    this.request.filter = { ...this.filterData, ...this.form.getRawValue() };
    this.business
      .search(this.pageConfig.route, this.request)
      .pipe(
        catchError((err) => {
          this.status = 'done';
          throw err;
        })
      )
      .subscribe((data) => {
        this.data = data.value;
        this.dataConnect.next(data.value);
        this.status = data.value.length > 0 ? '' : 'no-data';
        this.paginator.length = data.total;
        console.log('loaded', data);
      });
  }

  /**
   * On filter form submit
   */
  onSubmit() {
    console.log('onSubmit');
    this.loadData();
  }

  selection = new SelectionModel<any>(true, []);
  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    this.isAllSelected()
      ? this.selection.clear()
      : this.data.forEach((row) => this.selection.select(row));
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'select' : 'deselect'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${
      row.position + 1
    }`;
  }

  /**
   * Get selected row list
   */
  public getSelectedRows(): any[] {
    return this.selection.selected;
  }

  /**
   * Delete the item
   * @param id id
   */
  delete(id) {
    this.uiManager.confirm({}, (res) => {
      if (!res) return;
      this.business.delete(this.pageConfig.route, id).subscribe(() => {
        this.loadData();
      });
    });
  }

  /**
   * Get label for column
   * @param column column
   */
  getColumnLabel(column: OnkaPageField): string {
    return this.onkaService.getColumnLabel(this.pageConfig, column);
  }

  /**
   * Get value for column
   * @param row item data
   * @param column column
   */
  getColumnValue(row, column: OnkaPageField): string {
    return column.format
      ? column.format(row, row[column.name])
      : row[column.name];
  }

  /**
   * Get grid column names
   */
  getGridColumns() {
    if (this.displayedAllColumns.length == 0) {
      this.displayedAllColumns = this.displayedColumns.map((x) => x.name);
      if (this.checkbox) this.displayedAllColumns.unshift('checkbox');
      if (this.onkaService.isSelectField())
        this.displayedAllColumns.unshift('select');
      this.displayedAllColumns.push('actions');
    }

    return this.displayedAllColumns;
  }

  /**
   * On select button clicked
   * @param row item data
   */
  select_clicked(row) {
    this.onkaService.closeDialog(row);
  }

  /**
   *
   */
  getExtraRowActions(row) {
    if(!this.extraRowActions) return null;
    return this.extraRowActions(row);
  }
}
