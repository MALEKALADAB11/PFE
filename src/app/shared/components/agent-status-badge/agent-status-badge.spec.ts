import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgentStatusBadge } from './agent-status-badge';

describe('AgentStatusBadge', () => {
  let component: AgentStatusBadge;
  let fixture: ComponentFixture<AgentStatusBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentStatusBadge],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentStatusBadge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
