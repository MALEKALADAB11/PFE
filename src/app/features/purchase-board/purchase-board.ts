import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, transferArrayItem } from '@angular/cdk/drag-drop';

import {
  PurchaseOrderApiService,
  PurchaseOrder,
  PurchaseOrderStatut,
} from '../../core/services/purchase-order-api.service';
import { PurchaseBoardStore } from '../../core/state/purchase-board.store';
import { PurchaseBoardSocketService } from '../../core/realtime/purchase-board-socket.service';

interface Column {
  key: PurchaseOrderStatut;
  label: string;
}

const COLUMNS: Column[] = [
  { key: 'SUGGERE',   label: 'Suggéré (IA)' },
  { key: 'BROUILLON', label: 'Brouillon' },
  { key: 'SOUMIS',    label: 'Soumis' },
  { key: 'CONFIRME',  label: 'Confirmé' },
  { key: 'EXPEDIE',   label: 'Expédié' },
  { key: 'RECU',      label: 'Reçu' },
];

// Client-side mirror of supply_repo.ALLOWED_TRANSITIONS — backend remains the
// authority (PATCH is re-validated server-side); this only gates the drag UI.
// SUGGERE is deliberately absent here: those cards never move by drag, only
// via approve()/reject() (they touch inventory.recommendations too).
const ALLOWED_TRANSITIONS: Record<string, PurchaseOrderStatut[]> = {
  BROUILLON:    ['SOUMIS', 'ANNULE'],
  SOUMIS:       ['CONFIRME', 'ANNULE', 'LITIGE'],
  CONFIRME:     ['EXPEDIE', 'ANNULE', 'LITIGE'],
  EXPEDIE:      ['RECU_PARTIEL', 'RECU', 'LITIGE'],
  RECU_PARTIEL: ['RECU', 'LITIGE'],
  RECU:         [],
  ANNULE:       [],
  LITIGE:       ['CONFIRME', 'EXPEDIE', 'ANNULE'],
};

@Component({
  selector: 'app-purchase-board',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './purchase-board.html',
  styleUrl: './purchase-board.scss',
})
export class PurchaseBoardComponent implements OnInit, OnDestroy {
  private readonly api    = inject(PurchaseOrderApiService);
  private readonly boardStore = inject(PurchaseBoardStore);
  private readonly socket = inject(PurchaseBoardSocketService);
  private readonly router = inject(Router);

  openDetail(po: PurchaseOrder): void {
    this.router.navigate(['/purchase-board', po.po_id]);
  }

  readonly columns = COLUMNS;
  selectedStore = signal<string>('I63');
  loading  = signal(false);
  errorMsg = signal<string | null>(null);
  toastMsg = signal<string | null>(null);

  readonly byColumn = computed(() => this.boardStore.byColumn());
  readonly annuleOrders = computed(() => this.byColumn()['ANNULE'] ?? []);
  readonly litigeOrders = computed(() => this.byColumn()['LITIGE'] ?? []);

  readonly allDropListIds = [
    ...COLUMNS.map(c => `col-${c.key}`),
    'col-ANNULE',
    'col-LITIGE',
  ];

  // ── Vue liste « Purchase Tickets » ─────────────────────────────────────
  viewMode     = signal<'liste' | 'kanban'>('liste');
  searchTerm   = signal('');
  statusFilter = signal<'all' | PurchaseOrderStatut>('all');
  sortKey      = signal<'date' | 'montant' | 'statut' | 'produit'>('date');
  sortDir      = signal<1 | -1>(-1);
  selectedIds  = signal<ReadonlySet<string>>(new Set());

  readonly statusOptions: { key: 'all' | PurchaseOrderStatut; label: string }[] = [
    { key: 'all',          label: 'Tous les statuts' },
    { key: 'SUGGERE',      label: 'Suggéré (IA)' },
    { key: 'BROUILLON',    label: 'Brouillon' },
    { key: 'SOUMIS',       label: 'Soumis' },
    { key: 'CONFIRME',     label: 'Confirmé' },
    { key: 'EXPEDIE',      label: 'Expédié' },
    { key: 'RECU_PARTIEL', label: 'Reçu partiel' },
    { key: 'RECU',         label: 'Reçu' },
    { key: 'ANNULE',       label: 'Annulé' },
    { key: 'LITIGE',       label: 'Litige' },
  ];

  readonly filteredOrders = computed(() => {
    const term   = this.searchTerm().trim().toLowerCase();
    const filter = this.statusFilter();
    const key    = this.sortKey();
    const dir    = this.sortDir();

    let rows = this.boardStore.orders();
    if (filter !== 'all') rows = rows.filter(po => po.statut === filter);
    if (term) {
      rows = rows.filter(po =>
        po.po_id.toLowerCase().includes(term) ||
        (po.product_name ?? '').toLowerCase().includes(term) ||
        String(po.sku).includes(term) ||
        (po.supplier_id ?? '').toLowerCase().includes(term),
      );
    }

    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case 'montant': cmp = a.montant_total_ht - b.montant_total_ht; break;
        case 'statut':  cmp = a.statut.localeCompare(b.statut); break;
        case 'produit': cmp = (a.product_name ?? String(a.sku)).localeCompare(b.product_name ?? String(b.sku)); break;
        default:        cmp = new Date(a.date_commande).getTime() - new Date(b.date_commande).getTime();
      }
      return cmp * dir;
    });
  });

  /** Nombre de suggestions IA en attente de décision humaine. */
  readonly pendingSuggestions = computed(() =>
    this.boardStore.orders().filter(po => po.statut === 'SUGGERE').length,
  );

  readonly selectedApprovable = computed(() => {
    const sel = this.selectedIds();
    return this.boardStore.orders().filter(po => sel.has(po.po_id) && po.statut === 'SUGGERE');
  });

  setSort(key: 'date' | 'montant' | 'statut' | 'produit'): void {
    if (this.sortKey() === key) {
      this.sortDir.update(d => (d === 1 ? -1 : 1));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'date' ? -1 : 1);
    }
  }

  sortArrow(key: string): string {
    if (this.sortKey() !== key) return '⇅';
    return this.sortDir() === 1 ? '↑' : '↓';
  }

  toggleSelect(poId: string): void {
    this.selectedIds.update(prev => {
      const next = new Set(prev);
      next.has(poId) ? next.delete(poId) : next.add(poId);
      return next;
    });
  }

  isSelected(poId: string): boolean {
    return this.selectedIds().has(poId);
  }

  approveSelected(): void {
    for (const po of this.selectedApprovable()) this.approve(po);
    this.selectedIds.set(new Set());
  }

  statusLabel(statut: PurchaseOrderStatut): string {
    return this.statusOptions.find(o => o.key === statut)?.label ?? statut;
  }

  statusClass(statut: PurchaseOrderStatut): string {
    return `pt-badge pt-badge--${statut.toLowerCase()}`;
  }

  /** Action contextuelle de la ligne : prochaine transition « heureuse » du workflow. */
  rowAction(po: PurchaseOrder): { label: string; css: string; next: PurchaseOrderStatut | 'APPROVE' } | null {
    switch (po.statut) {
      case 'SUGGERE':      return { label: 'Approuver', css: 'pt-action--approve', next: 'APPROVE' };
      case 'BROUILLON':    return { label: 'Soumettre', css: 'pt-action--submit',  next: 'SOUMIS' };
      case 'SOUMIS':       return { label: 'Confirmer', css: 'pt-action--approve', next: 'CONFIRME' };
      case 'CONFIRME':     return { label: 'Expédier',  css: 'pt-action--ship',    next: 'EXPEDIE' };
      case 'EXPEDIE':      return { label: 'Recevoir',  css: 'pt-action--receive', next: 'RECU' };
      case 'RECU_PARTIEL': return { label: 'Recevoir',  css: 'pt-action--receive', next: 'RECU' };
      default:             return null;
    }
  }

  runRowAction(po: PurchaseOrder): void {
    const action = this.rowAction(po);
    if (!action) return;
    if (action.next === 'APPROVE') {
      this.approve(po);
      return;
    }
    const previousStatut = po.statut;
    this.boardStore.moveLocally(po.po_id, action.next);
    this.api.updatePurchaseOrderStatus(po.po_id, action.next).subscribe({
      error: (err) => {
        console.error('[PurchaseBoard] row action failed', err);
        this.boardStore.moveLocally(po.po_id, previousStatut);
        this.toastMsg.set('La mise à jour a échoué — statut restauré.');
        setTimeout(() => this.toastMsg.set(null), 3000);
      },
    });
  }

  ngOnInit(): void {
    this.loadBoard();
    this.socket.connect(this.selectedStore());
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
    this.boardStore.reset();
  }

  loadBoard(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.api.getPurchaseOrders(this.selectedStore(), 'all').subscribe({
      next: (res) => {
        this.boardStore.hydrate(res.purchase_orders);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[PurchaseBoard] load failed', err);
        this.errorMsg.set("Impossible de charger les commandes.");
        this.loading.set(false);
      },
    });
  }

  ordersFor(key: PurchaseOrderStatut): PurchaseOrder[] {
    return this.byColumn()[key] ?? [];
  }

  dropListId(key: string): string {
    return `col-${key}`;
  }

  /** Blocks drops that would violate ALLOWED_TRANSITIONS — server re-validates regardless. */
  canEnter = (targetKey: PurchaseOrderStatut) => (drag: any): boolean => {
    const po: PurchaseOrder = drag.data;
    if (!po) return false;
    if (po.statut === targetKey) return true; // reorder within same column
    return ALLOWED_TRANSITIONS[po.statut]?.includes(targetKey) ?? false;
  };

  onDrop(event: CdkDragDrop<PurchaseOrder[]>, targetKey: PurchaseOrderStatut): void {
    const po: PurchaseOrder = event.item.data;
    if (!po || event.previousContainer === event.container) return;

    const previousStatut = po.statut;
    if (!(ALLOWED_TRANSITIONS[previousStatut]?.includes(targetKey))) {
      this.toastMsg.set(`Transition ${previousStatut} → ${targetKey} non autorisée.`);
      setTimeout(() => this.toastMsg.set(null), 3000);
      return;
    }

    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    // Optimistic update — move now, roll back on HTTP error.
    this.boardStore.moveLocally(po.po_id, targetKey);

    this.api.updatePurchaseOrderStatus(po.po_id, targetKey).subscribe({
      error: (err) => {
        console.error('[PurchaseBoard] status update failed', err);
        this.boardStore.moveLocally(po.po_id, previousStatut);
        this.toastMsg.set("La mise à jour a échoué — statut restauré.");
        setTimeout(() => this.toastMsg.set(null), 3000);
      },
    });
  }

  approve(po: PurchaseOrder): void {
    this.api.approvePurchaseOrder(po.po_id, 'manager').subscribe({
      next: (updated) => this.boardStore.upsert(updated),
      error: (err) => {
        console.error('[PurchaseBoard] approve failed', err);
        this.toastMsg.set("L'approbation a échoué.");
        setTimeout(() => this.toastMsg.set(null), 3000);
      },
    });
  }

  reject(po: PurchaseOrder): void {
    this.api.rejectPurchaseOrder(po.po_id, 'manager').subscribe({
      next: (updated) => this.boardStore.upsert(updated),
      error: (err) => {
        console.error('[PurchaseBoard] reject failed', err);
        this.toastMsg.set("Le rejet a échoué.");
        setTimeout(() => this.toastMsg.set(null), 3000);
      },
    });
  }

  priorityColor(priorite: string): string {
    switch (priorite) {
      case 'URGENTE': return '#DC2626';
      case 'HAUTE':   return '#EA580C';
      case 'BASSE':   return '#64748B';
      default:        return '#2563EB'; // NORMAL
    }
  }

  ageLabel(po: PurchaseOrder): string {
    const days = Math.floor((Date.now() - new Date(po.date_commande).getTime()) / 86_400_000);
    if (days <= 0) return "aujourd'hui";
    return `${days}j`;
  }

  // ── Croisement stock × achat (champs calculés backend) ─────────────────

  /** Couverture stock actuelle du SKU, capée pour l'affichage. */
  coverageLabel(po: PurchaseOrder): string {
    const d = po.days_to_stockout;
    if (d == null) return '—';
    if (d >= 999) return '> 1 an';
    return `${Math.round(d)} j`;
  }

  coverageColor(po: PurchaseOrder): string {
    const d = po.days_to_stockout;
    if (d == null) return '#94A3B8';
    if (d < 7)  return '#E74C3C';
    if (d < 14) return '#F9A825';
    return '#27AE60';
  }

  /** Temps restant avant réception (livraison prévue). */
  etaLabel(po: PurchaseOrder): string {
    const d = po.eta_days;
    if (d == null) return '';
    if (d < 0)  return `ETA dépassée de ${-d} j`;
    if (d === 0) return 'Réception aujourd\'hui';
    return `Réception dans ${d} j`;
  }

  // ── Suivi livraison : livré quand, prévu quand, retard/avance ──────────

  /** Date de livraison prévue, formatée pour la carte. */
  expectedDeliveryLabel(po: PurchaseOrder): string {
    if (!po.date_livraison_prevue) return '';
    return `Prévu le ${new Date(po.date_livraison_prevue).toLocaleDateString('fr-FR')}`;
  }

  /** Date de livraison réelle ("délivré quand") — uniquement une fois reçu. */
  deliveredLabel(po: PurchaseOrder): string {
    if (!po.date_livraison_reelle) return '';
    return `Livré le ${new Date(po.date_livraison_reelle).toLocaleDateString('fr-FR')}`;
  }

  /**
   * Retard / avance : écart réel persisté (BC livré) ou projeté (ETA dépassée
   * sur un BC en cours) — même convention backend : >0 retard, <0 avance.
   */
  deliveryDeltaLabel(po: PurchaseOrder): string {
    const d = po.delivery_delay_days;
    if (d == null || po.delivery_status == null) return '';
    const projected = !po.date_livraison_reelle;
    if (po.delivery_status === 'EN_RETARD') {
      return projected ? `Retard de ${d} j (en cours)` : `Retard de ${d} j`;
    }
    if (po.delivery_status === 'EN_AVANCE') return `Avance de ${-d} j`;
    return projected ? 'Dans les délais' : 'Livré à temps';
  }

  deliveryDeltaClass(po: PurchaseOrder): string {
    switch (po.delivery_status) {
      case 'EN_RETARD': return 'pb-card__delivery--late';
      case 'EN_AVANCE': return 'pb-card__delivery--early';
      case 'A_TEMPS':   return 'pb-card__delivery--ontime';
      default:          return '';
    }
  }

  /** Temps d'attente dans le statut courant. */
  waitLabel(po: PurchaseOrder): string {
    const d = po.waiting_days;
    if (d == null || d <= 0) return '';
    return `${d} j dans ce statut`;
  }

  waitIsLong(po: PurchaseOrder): boolean {
    return (po.waiting_days ?? 0) > 5;
  }

  /** Prédiction rupture vs réception — bandeau de la carte. */
  riskBanner(po: PurchaseOrder): { text: string; kind: 'danger' | 'ok' } | null {
    if (po.stockout_before_delivery === true) {
      const gap = Math.abs(Math.round(po.coverage_gap_days ?? 0));
      return {
        kind: 'danger',
        text: `Rupture prévue ${gap > 0 ? gap + ' j ' : ''}avant réception — accélérer`,
      };
    }
    if (po.stockout_before_delivery === false) {
      const gap = Math.round(po.coverage_gap_days ?? 0);
      return {
        kind: 'ok',
        text: `Stock couvre jusqu'à réception (+${gap} j de marge)`,
      };
    }
    return null;
  }

  trackByPoId(_index: number, po: PurchaseOrder): string {
    return po.po_id;
  }
}
