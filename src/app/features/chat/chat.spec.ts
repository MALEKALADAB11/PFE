import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Chat } from './chat';
import { WebSocketService } from '../../core/services/websocket.service';
import { ApiService } from '../../core/services/api';

// ── Stubs ────────────────────────────────────────────────────────────────────
const wsStub: Partial<WebSocketService> = {
  connected:        signal(true)  as any,
  urgencyLevel:     signal('LOW') as any,
  liveMetrics:      signal(null)  as any,
  liveInventory:    signal(null)  as any,
  guardrailEvent:   signal(null)  as any,
  guardrailHistory: signal([])    as any,
};

const apiStub: Partial<ApiService> = {
  getStockAlerts: () => ({ subscribe: () => {} }) as any,
};

describe('Chat', () => {
  let component: Chat;
  let fixture: ComponentFixture<Chat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WebSocketService, useValue: wsStub },
        { provide: ApiService,       useValue: apiStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Chat);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with at least one conversation', () => {
    expect(component.conversations().length).toBeGreaterThan(0);
  });

  it('inputValue is empty by default', () => {
    expect(component.inputValue()).toBe('');
  });

  it('chatDomain defaults to "sales"', () => {
    expect(component.chatDomain()).toBe('sales');
  });

  it('isTyping is false by default', () => {
    expect(component.isTyping()).toBe(false);
  });

  it('first conversation has at least one message (welcome)', () => {
    const first = component.conversations()[0];
    expect(first.messages.length).toBeGreaterThan(0);
  });

  it('showSidebar is true by default', () => {
    expect(component.showSidebar()).toBe(true);
  });

  it('activeMessages returns messages of active conversation', () => {
    const id = component.activeConvId();
    const conv = component.conversations().find(c => c.id === id);
    expect(component.activeMessages()).toEqual(conv?.messages ?? []);
  });
});
