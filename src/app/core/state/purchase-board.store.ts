import { Injectable, signal, computed } from '@angular/core';
import { PurchaseOrder, PurchaseOrderStatut } from '../services/purchase-order-api.service';

export interface PoStatusChangedMessage {
  type: 'po_status_changed';
  store_id: string;
  po_id: string;
  sku: number;
  old_statut: PurchaseOrderStatut;
  new_statut: PurchaseOrderStatut;
  timestamp: number;
}

export interface PoSuggestedMessage {
  type: 'po_suggested';
  store_id: string;
  po: PurchaseOrder;
  timestamp: number;
}

export type PurchaseBoardMessage = PoStatusChangedMessage | PoSuggestedMessage;

@Injectable({ providedIn: 'root' })
export class PurchaseBoardStore {
  private readonly _byId = signal<Record<string, PurchaseOrder>>({});

  readonly orders = computed(() => Object.values(this._byId()));

  readonly byColumn = computed(() => {
    const grouped: Record<string, PurchaseOrder[]> = {};
    for (const po of this.orders()) {
      (grouped[po.statut] ??= []).push(po);
    }
    return grouped;
  });

  hydrate(orders: PurchaseOrder[]) {
    this._byId.set(Object.fromEntries(orders.map(po => [po.po_id, po])));
  }

  /** Optimistic local move — called immediately on drag-drop, before the PATCH resolves. */
  moveLocally(poId: string, newStatut: PurchaseOrderStatut) {
    this._byId.update(m => m[poId] ? { ...m, [poId]: { ...m[poId], statut: newStatut } } : m);
  }

  upsert(po: PurchaseOrder) {
    this._byId.update(m => ({ ...m, [po.po_id]: po }));
  }

  applyMessage(msg: PurchaseBoardMessage) {
    switch (msg?.type) {
      case 'po_status_changed':
        this._byId.update(m =>
          m[msg.po_id] ? { ...m, [msg.po_id]: { ...m[msg.po_id], statut: msg.new_statut } } : m,
        );
        break;
      case 'po_suggested':
        this.upsert(msg.po);
        break;
    }
  }

  reset() {
    this._byId.set({});
  }
}
