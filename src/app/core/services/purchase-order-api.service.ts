import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PurchaseOrderStatut =
  | 'BROUILLON'
  | 'SOUMIS'
  | 'CONFIRME'
  | 'EXPEDIE'
  | 'RECU_PARTIEL'
  | 'RECU'
  | 'ANNULE'
  | 'LITIGE';

export interface PurchaseOrder {
  po_id: string;
  sku: number;
  supplier_id: string | null;
  store_id: string;
  quantite_commandee: number;
  quantite_recue: number;
  prix_unitaire_ht: number;
  montant_total_ht: number;
  devise: string;
  statut: PurchaseOrderStatut;
  priorite: 'URGENTE' | 'HAUTE' | 'NORMAL' | 'BASSE' | string;
  date_commande: string;
  date_livraison_prevue: string | null;
  date_livraison_reelle: string | null;
  delai_reel_jours: number | null;
  reference_externe: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  recommendation_id: string | null;
  product_name: string | null;
}

@Injectable({ providedIn: 'root' })
export class PurchaseOrderApiService {

  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/supply`;

  private _headers(): HttpHeaders {
    const token = sessionStorage.getItem('ooredoo_token');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  getPurchaseOrders(
    storeId: string,
    statut?: PurchaseOrderStatut | 'all',
  ): Observable<{ store_id: string; purchase_orders: PurchaseOrder[]; count: number; filter: string }> {
    const params = statut ? new HttpParams().set('statut', statut) : undefined;
    return this.http.get<{ store_id: string; purchase_orders: PurchaseOrder[]; count: number; filter: string }>(
      `${this.base}/purchase-orders/${storeId}`,
      { params, headers: this._headers() },
    );
  }

  getPurchaseOrder(poId: string): Observable<PurchaseOrder> {
    return this.http.get<PurchaseOrder>(
      `${this.base}/purchase-orders/detail/${poId}`,
      { headers: this._headers() },
    );
  }

  createPurchaseOrder(
    recommendationId: string,
    supplierId?: string,
    priorite = 'NORMAL',
  ): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(
      `${this.base}/purchase-orders`,
      { recommendation_id: recommendationId, supplier_id: supplierId, priorite },
      { headers: this._headers() },
    );
  }

  updatePurchaseOrderStatus(
    poId: string,
    statut: PurchaseOrderStatut,
  ): Observable<{ po_id: string; statut: string; updated: boolean }> {
    return this.http.patch<{ po_id: string; statut: string; updated: boolean }>(
      `${this.base}/purchase-orders/${poId}`,
      { statut },
      { headers: this._headers() },
    );
  }
}
