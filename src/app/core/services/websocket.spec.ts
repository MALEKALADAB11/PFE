import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';

import { WebSocketService } from './websocket.service';

describe('WebSocketService', () => {
  let svc: WebSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WebSocketService,
        { provide: PLATFORM_ID, useValue: 'server' }, // no real WebSocket in tests
      ],
    });
    svc = TestBed.inject(WebSocketService);
  });

  it('should create', () => {
    expect(svc).toBeTruthy();
  });

  it('connected starts false', () => {
    expect(svc.connected()).toBe(false);
  });

  it('urgencyLevel starts LOW', () => {
    expect(svc.urgencyLevel()).toBe('LOW');
  });

  it('guardrailHistory starts empty', () => {
    expect(svc.guardrailHistory()).toEqual([]);
  });

  it('guardrailEvent starts null', () => {
    expect(svc.guardrailEvent()).toBeNull();
  });

  it('liveInventory starts null', () => {
    expect(svc.liveInventory()).toBeNull();
  });

  it('isUrgent computed returns false when LOW', () => {
    expect(svc.isUrgent()).toBe(false);
  });

  it('isUrgent returns true when urgencyLevel is HIGH', () => {
    (svc as any).urgencyLevel.set('HIGH');
    expect(svc.isUrgent()).toBe(true);
  });

  it('guardrailHistory accumulates events', () => {
    const fakeEvt = {
      status: 'BLOCK',
      store_id: 'I63',
      advisor: 'Ahmed',
      issues: [{ rule: 'G1', message: 'No stock' }],
      urgency: 'HIGH',
      timestamp: new Date().toISOString(),
    };
    (svc as any).guardrailHistory.update((h: any[]) => [fakeEvt, ...h]);
    expect(svc.guardrailHistory().length).toBe(1);
    expect(svc.guardrailHistory()[0].status).toBe('BLOCK');
  });
});
