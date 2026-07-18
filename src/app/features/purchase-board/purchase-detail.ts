import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  PurchaseOrderApiService,
  PurchaseOrder,
  PurchaseOrderStatut,
} from '../../core/services/purchase-order-api.service';

interface WorkflowStep {
  key: PurchaseOrderStatut;
  label: string;
  date: string | null;
}

/** Ordre du chemin « heureux » du workflow — les états ANNULE/LITIGE sont hors stepper. */
const STEP_ORDER: PurchaseOrderStatut[] = ['SUGGERE', 'BROUILLON', 'SOUMIS', 'CONFIRME', 'EXPEDIE', 'RECU'];

@Component({
  selector: 'app-purchase-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './purchase-detail.html',
  styleUrl: './purchase-detail.scss',
})
export class PurchaseDetailComponent implements OnInit {
  private readonly api    = inject(PurchaseOrderApiService);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);

  po       = signal<PurchaseOrder | null>(null);
  related  = signal<PurchaseOrder[]>([]);
  loading  = signal(true);
  errorMsg = signal<string | null>(null);
  toastMsg = signal<string | null>(null);

  ngOnInit(): void {
    // paramMap observé (pas snapshot) : la navigation vers un ticket lié
    // réutilise ce même composant sans le détruire.
    this.route.paramMap.subscribe(params => {
      const poId = params.get('poId');
      if (!poId) {
        this.router.navigate(['/purchase-board']);
        return;
      }
      this.load(poId);
    });
  }

  private load(poId: string): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.api.getPurchaseOrder(poId).subscribe({
      next: (po) => {
        this.po.set(po);
        this.loading.set(false);
        this.loadRelated(po);
      },
      error: (err) => {
        console.error('[PurchaseDetail] load failed', err);
        this.errorMsg.set('Bon de commande introuvable.');
        this.loading.set(false);
      },
    });
  }

  /** Autres tickets du même store — la mini-liste « Purchase Tickets » de la fiche. */
  private loadRelated(current: PurchaseOrder): void {
    this.api.getPurchaseOrders(current.store_id, 'all').subscribe({
      next: (res) => {
        const others = res.purchase_orders
          .filter(po => po.po_id !== current.po_id)
          .sort((a, b) => new Date(b.date_commande).getTime() - new Date(a.date_commande).getTime())
          .slice(0, 6);
        this.related.set(others);
      },
      error: () => this.related.set([]),
    });
  }

  openRelated(po: PurchaseOrder): void {
    this.router.navigate(['/purchase-board', po.po_id]);
  }

  /** Chip « ✓ Approuvé » : suggestion IA validée par l'humain (a quitté SUGGERE sans être annulée). */
  isApprovedSuggestion(po: PurchaseOrder): boolean {
    return po.source === 'AGENT' && !['SUGGERE', 'ANNULE'].includes(po.statut);
  }

  back(): void {
    this.router.navigate(['/purchase-board']);
  }

  // ── Stepper de workflow ────────────────────────────────────────────────

  readonly steps = computed<WorkflowStep[]>(() => {
    const po = this.po();
    if (!po) return [];
    const all: WorkflowStep[] = [
      { key: 'SUGGERE',   label: 'Suggéré (IA)', date: po.source === 'AGENT' ? po.created_at : null },
      { key: 'BROUILLON', label: 'Brouillon',    date: po.date_commande },
      { key: 'SOUMIS',    label: 'Soumis',       date: po.date_soumission },
      { key: 'CONFIRME',  label: 'Confirmé',     date: po.date_confirmation },
      { key: 'EXPEDIE',   label: 'Expédié',      date: null },
      { key: 'RECU',      label: 'Reçu',         date: po.date_livraison_reelle },
    ];
    // BC créé manuellement : la phase « Suggéré (IA) » n'existe pas.
    return po.source === 'AGENT' ? all : all.slice(1);
  });

  /** Index de l'étape courante dans steps() ; -1 si hors workflow (ANNULE/LITIGE). */
  readonly currentStepIndex = computed(() => {
    const po = this.po();
    if (!po) return -1;
    const statut: PurchaseOrderStatut = po.statut === 'RECU_PARTIEL' ? 'EXPEDIE' : po.statut;
    return this.steps().findIndex(s => s.key === statut);
  });

  readonly isOffTrack = computed(() => {
    const s = this.po()?.statut;
    return s === 'ANNULE' || s === 'LITIGE';
  });

  stepState(index: number): 'done' | 'current' | 'todo' {
    const current = this.currentStepIndex();
    if (current < 0) return 'todo';
    if (index < current) return 'done';
    if (index === current) return 'current';
    return 'todo';
  }

  /** Fil d'ariane compact du header : Brouillon → Soumis → … */
  readonly breadcrumb = computed(() =>
    this.steps().map(s => s.label).join('  →  '),
  );

  // ── Badges & libellés ──────────────────────────────────────────────────

  statusLabel(statut: PurchaseOrderStatut): string {
    const map: Record<string, string> = {
      SUGGERE: 'Suggéré (IA)', BROUILLON: 'Brouillon', SOUMIS: 'Soumis',
      CONFIRME: 'Confirmé', EXPEDIE: 'Expédié', RECU_PARTIEL: 'Reçu partiel',
      RECU: 'Reçu', ANNULE: 'Annulé', LITIGE: 'Litige',
    };
    return map[statut] ?? statut;
  }

  statusClass(statut: PurchaseOrderStatut): string {
    return `pt-badge pt-badge--${statut.toLowerCase()}`;
  }

  priorityColor(priorite: string): string {
    switch (priorite) {
      case 'URGENTE': return '#DC2626';
      case 'HAUTE':   return '#EA580C';
      case 'BASSE':   return '#64748B';
      default:        return '#2563EB';
    }
  }

  coverageLabel(po: PurchaseOrder): string {
    const d = po.days_to_stockout;
    if (d == null) return '—';
    if (d >= 999) return '> 1 an';
    return `${Math.round(d)} j`;
  }

  deliveryDeltaLabel(po: PurchaseOrder): string {
    const d = po.delivery_delay_days;
    if (d == null || po.delivery_status == null) return '';
    if (po.delivery_status === 'EN_RETARD') return `Retard de ${d} j`;
    if (po.delivery_status === 'EN_AVANCE') return `Avance de ${-d} j`;
    return 'Dans les délais';
  }

  riskBanner(po: PurchaseOrder): { text: string; kind: 'danger' | 'ok' } | null {
    if (po.stockout_before_delivery === true) {
      const gap = Math.abs(Math.round(po.coverage_gap_days ?? 0));
      return { kind: 'danger', text: `Rupture prévue ${gap > 0 ? gap + ' j ' : ''}avant réception — accélérer` };
    }
    if (po.stockout_before_delivery === false) {
      const gap = Math.round(po.coverage_gap_days ?? 0);
      return { kind: 'ok', text: `Stock couvre jusqu'à réception (+${gap} j de marge)` };
    }
    return null;
  }

  // ── Actions de workflow (mêmes transitions que la liste/Kanban) ────────

  primaryAction(po: PurchaseOrder): { label: string; css: string; next: PurchaseOrderStatut | 'APPROVE' } | null {
    switch (po.statut) {
      case 'SUGGERE':      return { label: '✓ Approuver la suggestion', css: 'pt-action--approve', next: 'APPROVE' };
      case 'BROUILLON':    return { label: 'Passer au statut Soumis',   css: 'pt-action--submit',  next: 'SOUMIS' };
      case 'SOUMIS':       return { label: 'Confirmer la commande',     css: 'pt-action--approve', next: 'CONFIRME' };
      case 'CONFIRME':     return { label: 'Marquer comme expédié',     css: 'pt-action--ship',    next: 'EXPEDIE' };
      case 'EXPEDIE':      return { label: 'Réceptionner',              css: 'pt-action--receive', next: 'RECU' };
      case 'RECU_PARTIEL': return { label: 'Réceptionner le solde',     css: 'pt-action--receive', next: 'RECU' };
      default:             return null;
    }
  }

  canReject(po: PurchaseOrder): boolean {
    return po.statut === 'SUGGERE';
  }

  canCancel(po: PurchaseOrder): boolean {
    return ['BROUILLON', 'SOUMIS', 'CONFIRME'].includes(po.statut);
  }

  runPrimaryAction(): void {
    const po = this.po();
    if (!po) return;
    const action = this.primaryAction(po);
    if (!action) return;

    if (action.next === 'APPROVE') {
      this.api.approvePurchaseOrder(po.po_id, 'manager').subscribe({
        next: (updated) => this.afterAction(updated ?? { ...po, statut: 'BROUILLON' }),
        error: (err) => this.actionFailed(err, "L'approbation a échoué."),
      });
      return;
    }
    this.transitionTo(action.next);
  }

  reject(): void {
    const po = this.po();
    if (!po) return;
    this.api.rejectPurchaseOrder(po.po_id, 'manager').subscribe({
      next: (updated) => this.afterAction(updated ?? { ...po, statut: 'ANNULE' }),
      error: (err) => this.actionFailed(err, 'Le rejet a échoué.'),
    });
  }

  cancel(): void {
    this.transitionTo('ANNULE');
  }

  private transitionTo(statut: PurchaseOrderStatut): void {
    const po = this.po();
    if (!po) return;
    this.api.updatePurchaseOrderStatus(po.po_id, statut).subscribe({
      next: () => this.afterAction({ ...po, statut }),
      error: (err) => this.actionFailed(err, 'La mise à jour a échoué.'),
    });
  }

  private afterAction(updated: PurchaseOrder): void {
    this.po.set(updated);
    this.toastMsg.set(`Statut mis à jour : ${this.statusLabel(updated.statut)}`);
    setTimeout(() => this.toastMsg.set(null), 3000);
    // Recharge pour récupérer les dates/champs calculés côté serveur.
    this.load(updated.po_id);
  }

  private actionFailed(err: unknown, message: string): void {
    console.error('[PurchaseDetail] action failed', err);
    this.toastMsg.set(message);
    setTimeout(() => this.toastMsg.set(null), 3000);
  }
}
