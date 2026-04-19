import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('falls back safely when timezone formatting throws', () => {
    const timerSpy = spyOn<any>(HeaderComponent.prototype, 'updateResetTimers').and.throwError('RangeError');

    const safeFixture = TestBed.createComponent(HeaderComponent);
    const safeComponent = safeFixture.componentInstance;

    expect(() => safeFixture.detectChanges()).not.toThrow();

    expect(safeComponent.dailyReset).toBe('--H --M --S');
    expect(safeComponent.weeklyReset).toBe('--D --H --M --S');

    timerSpy.and.callThrough();
  });
});
