import {
  Component, OnInit, OnDestroy, signal, computed, inject
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { HttpClient }    from '@angular/common/http';
import { FormsModule }   from '@angular/forms';
import { environment }  from '../../../../environments/environment';

interface HitlReview {
  id:                 string;
  store_id:           string;
  cycle_id:           string;
  urgency_level:      string;
  gap_pct:            number;
  critique_score:     number;
  critique_feedback:  string;
  strategie_summary:  string;
  actions:            any[];
  source:             string;
  created_at:         string;
}

@Component({
  selector:   'app-hitl-panel',
  standalone: true,
  imports:    [CommonModule, FormsModule],
  templateUrl: './hitl-panel.html',
  styleUrl:    './hitl-panel.scss',
})
export class HitlPanelComponent implements OnInit, OnDestroy {

  private http = inject(HttpClient);

  reviews    = signal<HitlReview[]>([]);
  panelOpen  = signal(false);
  loading    = signal(false);
  validating = signal<string | null>(null);  // review id being validated

  pendingCount = computed(() => this.reviews().length);

  private _pollTimer: any;
  private readonly _BASE = environment.apiUrl;

  ngOnInit(): void {
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this._pollTimer);
  }

  togglePanel(): void {
    this.panelOpen.update(v => !v);
    if (this.panelOpen()) this._poll();
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  private _poll(): void {
    this.http.get<{ count: number; reviews: HitlReview[] }>(
      `${this._BASE}/api/v1/hitl/pending`
    ).subscribe({
      next:  r => this.reviews.set(r.reviews),
      error: () => {},
    });
  }

  validate(reviewId: string, decision: 'approved' | 'rejected'): void {
    this.validating.set(reviewId);
    this.http.post(
      `${this._BASE}/api/v1/hitl/validate/${reviewId}`,
      { decision, approver_name: 'Manager', approver_note: null }
    ).subscribe({
      next: () => {
        this.reviews.update(list => list.filter(r => r.id !== reviewId));
        this.validating.set(null);
      },
      error: () => this.validating.set(null),
    });
  }

  urgencyClass(level: string): string {
    return level === 'CRITICAL' ? 'badge--critical'
         : level === 'HIGH'     ? 'badge--high'
         : 'badge--medium';
  }

  relativeTime(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1)  return "à l'instant";
    if (diff < 60) return `il y a ${diff} min`;
    return `il y a ${Math.floor(diff / 60)}h`;
  }
}
