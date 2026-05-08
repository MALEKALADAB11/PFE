import { Injectable, signal, computed } from '@angular/core';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MonitoringService {
  // 1. On stocke les données brutes dans des Signals
  // Remplace le tableau vide par tes données MOCK actuelles
  private _agents = signal<any[]>([]);
  private _conflicts = signal<any[]>([]);
  private _healthScore = signal<number>(94);

  // 2. On expose les signaux en lecture seule pour les composants
  agents = computed(() => this._agents());
  conflicts = computed(() => this._conflicts());
  healthScore = computed(() => this._healthScore());

  constructor() {
    this.startSimulatingRealTime();
  }

  // 3. LA MÉTHODE MAGIQUE : Elle simule le dynamisme
  private startSimulatingRealTime() {
    // Toutes les 3 secondes, on simule une mise à jour réseau
    interval(3000).subscribe(() => {

      // Simulation : Variation de la latence des agents
      this._agents.update(list => list.map(agent => ({
        ...agent,
        latency: parseFloat((Math.random() * (1.5 - 0.5) + 0.5).toFixed(2))
      })));

      // Simulation : Variation légère du score de santé (BI)
      this._healthScore.update(score => {
        const change = Math.floor(Math.random() * 3) - 1; // -1, 0, ou +1
        return Math.min(100, Math.max(80, score + change));
      });

      console.log('🔄 Données de monitoring synchronisées (Mock Real-time)');
    });
  }

  // 4. LE FUTUR : Quand ton encadrant te donne la vraie API
  // Il suffira de créer cette méthode :
  /* getRealData() {
    return this.http.get('https://api.votre-backend.com/monitoring')
      .subscribe(data => this._agents.set(data));
  }
  */
}