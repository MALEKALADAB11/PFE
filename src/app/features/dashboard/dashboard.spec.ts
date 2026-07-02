import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { Dashboard } from './dashboard';
import { WebSocketService } from '../../core/services/websocket.service';

// ── Minimal WS stub ──────────────────────────────────────────────────────────
const wsStub: Partial<WebSocketService> = {
  connected:     signal(false) as any,
  urgencyLevel:  signal('LOW') as any,
  liveMetrics:   signal(null)  as any,
  weatherLabel:  signal('')    as any,
  weatherIcon:   signal('')    as any,
  isHolidayToday: () => false,
  nextHoliday:   signal('')    as any,
  strateRecos:   signal(null)  as any,
  analystPayload: signal(null) as any,
  liveInventory:  signal(null) as any,
  guardrailEvent: signal(null) as any,
  guardrailHistory: signal([]) as any,
};

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WebSocketService, useValue: wsStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show LOW urgency by default', () => {
    expect(component.niveauUrgence()).toBe('LOW');
  });

  it('isLive reflects ws.connected()', () => {
    expect(component.isLive()).toBe(false);
  });

  it('visitorsH defaults to 0 when no liveMetrics', () => {
    expect(component.visitorsH()).toBe(0);
  });

  it('attainment is 0 when no metrics loaded', () => {
    expect(component.attainment()).toBe(0);
  });

  it('should expose a storeId', () => {
    expect(component.storeId).toBeTruthy();
  });
});
