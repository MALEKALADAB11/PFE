import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlipKpiCard } from './flip-kpi-card';

describe('FlipKpiCard', () => {
  let component: FlipKpiCard;
  let fixture: ComponentFixture<FlipKpiCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlipKpiCard],
    }).compileComponents();

    fixture = TestBed.createComponent(FlipKpiCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
