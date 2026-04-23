import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Conseiller } from './conseiller';

describe('Conseiller', () => {
  let component: Conseiller;
  let fixture: ComponentFixture<Conseiller>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Conseiller],
    }).compileComponents();

    fixture = TestBed.createComponent(Conseiller);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
