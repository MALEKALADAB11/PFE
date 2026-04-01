import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoachingCard } from './coaching-card';

describe('CoachingCard', () => {
  let component: CoachingCard;
  let fixture: ComponentFixture<CoachingCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoachingCard],
    }).compileComponents();

    fixture = TestBed.createComponent(CoachingCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
