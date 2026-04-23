import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdvisorRow } from './advisor-row';

describe('AdvisorRow', () => {
  let component: AdvisorRow;
  let fixture: ComponentFixture<AdvisorRow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvisorRow],
    }).compileComponents();

    fixture = TestBed.createComponent(AdvisorRow);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
