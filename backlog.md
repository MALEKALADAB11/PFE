# Backlog — AI Sales Coach & Inventory Advisor

Backlog reconstitué à partir de l'historique Git (51 commits, du 01 avril au 06 juillet 2026) et de l'état actuel du code.

## Chronologie

| Période | Phase | Contenu |
|---|---|---|
| Avril 2026 | Socle : dashboard & inventaire | Squelette Angular, premier dashboard, écran inventaire, premier agent analyste LangGraph |
| Fin avril 2026 | Agents & temps réel | Agent Analyste + WebSocket, CoachAgent LLM, advisors dynamiques, agent stock, reconnexion WS |
| Mai 2026 | Données réelles & auth | Mapping Ooredoo I63, monitoring, chat RAG, page login, recommandations d'inventaire |
| Juin 2026 | Fiabilisation | Provider CSV temps réel, liaison backend inventaire, refactor du chat, nettoyage du code |
| Juillet 2026 | HITL & achats | Panel Human-in-the-loop, service de layout, environnements, tests e2e, kanban des commandes fournisseurs |

## Backlog par module

### Authentification & rôles (`/login`, `authGuard`, `managerGuard`)
**Statut : Stable**

Réalisé :
- Page de login
- Guards de rôle (manager / vendeur) sur toutes les routes
- Résolution des conflits de routing après fusions successives

À faire :
- [ ] Tests unitaires réels (`auth-guard.spec.ts` et `auth.spec.ts` ne couvrent qu'un cas trivial)
- [ ] Gestion de session expirée / refresh (non visible dans le code actuel)

### Dashboard temps réel (`/dashboard`)
**Statut : Stable**

Réalisé :
- KPIs et graphe Sankey (chart.js)
- Connexion WebSocket à l'agent analyste
- Guards anti-NaN sur les advisors dynamiques
- Panel HITL (human-in-the-loop) intégré

À faire :
- [ ] `dashboard.html`/`dashboard.scss` ont doublé de volume en un commit (+699/+316 lignes) — repasser dessus pour factoriser
- [ ] Étoffer `dashboard.spec.ts` au-delà du test de création par défaut

### Inventaire & recommandations IA (`/inventory`)
**Statut : En cours**

Réalisé :
- Connexion aux données réelles Ooredoo (magasin I63)
- Recommandations de réapprovisionnement générées par l'agent stock
- Passage de `stockKpi` au format objet (nettoyage architecture)

À faire :
- [ ] Supprimer `inventory-deprecated.html` (875 lignes mortes encore présentes dans le dossier feature)
- [ ] Compléter `inventory.spec.ts` (actuellement un test de création vide)

### Coach IA / Chat — RAG (`/chat`)
**Statut : Stable**

Réalisé :
- API chat branchée sur le RAG
- `ConversationStorageService` pour la persistance des échanges
- Refactor : suppression des imports inutiles, restauration des propriétés manquantes

À faire :
- [ ] Historique multi-session (actuellement pas de vue pour reprendre une conversation passée)

### Conseiller — assistant vendeur (`/conseiller`)
**Statut : En cours**

Réalisé :
- Écran conseiller accessible aux rôles manager + vendeur

À faire :
- [ ] Le module le moins développé du projet — `conseiller.spec.ts` est un squelette de scaffolding (22 lignes, aucun test métier)
- [ ] Clarifier la différence de périmètre avec le Chat / Coach IA

### Monitoring des agents (`/monitoring`, `/admin/realtime`)
**Statut : Stable**

Réalisé :
- Timeline des agents LangGraph (`receive_pos`, `compute_gap`, `call_timesfm`, `detect_urgency`, `llm_summary`)
- Provider CSV temps réel (CA progressif depuis `transactions_2025_2026_v2.csv`)
- Réécriture majeure de `monitoring.ts` (-1776 lignes nettes, gros ménage)

À faire :
- [ ] Vérifier la non-régression après la grosse réécriture de juin (couverture de test faible : 25 lignes de spec)

### Purchase Board — commandes fournisseurs (`/purchase-board`)
**Statut : Nouveau**

Réalisé :
- Kanban drag & drop (Angular CDK) par statut de commande
- Machine à états côté client miroir du backend (`ALLOWED_TRANSITIONS`)
- Mise à jour optimiste avec rollback sur erreur HTTP
- WebSocket dédié (`PurchaseBoardSocketService`) + store d'état

À faire :
- [ ] Aucun fichier `.spec.ts` pour `purchase-board`, `purchase-order-api.service` ou `purchase-board.store`
- [ ] Sélecteur de magasin figé sur `"I63"` (`selectedStore` n'a pas d'UI pour changer de store)
- [ ] Gérer l'affichage des colonnes ANNULE / LITIGE en dehors du board principal (actuellement calculées mais non branchées à un composant listé)

### Socle technique (`core/`, `environments/`, `e2e/`)
**Statut : En cours**

Réalisé :
- `WebSocketService` générique partagé entre dashboard et purchase-board
- `LayoutService`, configuration par environnement
- Premier test e2e (`smoke.spec.ts`)

À faire :
- [ ] `websocket.service.ts` a gagné +115 lignes en un commit — vérifier qu'il ne mélange pas trop de responsabilités (dashboard + purchase-board)
- [ ] `e2e/` ne contient qu'un seul smoke test

## Backlog transverse

| Priorité | Item | Pourquoi |
|---|---|---|
| Haute | Supprimer `inventory-deprecated.html` | 875 lignes de dette technique morte, aucune référence active dans les routes |
| Haute | Tests pour le module Purchase Board | Module le plus récent et le plus complexe (drag & drop, WS, rollback optimiste) — zéro couverture |
| Moyenne | Étoffer les tests scaffoldés | conseiller, inventory, monitoring (core), api, auth, mock-data n'ont qu'un test "should create" |
| Moyenne | Mettre en place une CI | Aucun workflow détecté (`.github/workflows` absent) malgré la présence de tests unitaires et e2e |
| Moyenne | Documenter le projet réel dans `README.md` | Le README est encore celui généré par défaut par Angular CLI |
| Basse | Étendre les tests e2e au-delà du smoke test | Parcours critiques (login → dashboard, drag & drop purchase-board) non couverts |
