# Backlog produit du stage (6 mois) — Méthodologie hybride CRISP-DM × Scrum

> Projet : Plateforme multi-agents d'optimisation des ventes et des stocks (Retail)
> Stage PFE — 6 mois : **du 2 février 2026 au 2 août 2026**
> Frontend : Angular (dashboard, chat coach, inventaire, Kanban achats, monitoring)
> Backend : FastAPI + LangGraph (agents Sales & Inventory), PostgreSQL, Milvus, TimesFM

---

## 1. Justification de la méthodologie hybride

Le projet combine deux natures de tr
- **Une composante data science / IA** (prévision TimesFM, agents LLM, RAG, évaluation
  des modèles) → cycle de vie **CRISP-DM** (Cross-Industry Standard Process for Data
  Mining), la référence pour structurer un projet centré données.
- **Une composante ingénierie logicielle** (API, frontend Angular, temps réel,
  sécurité) → cadre **Scrum**, la référence pour livrer de façon itérative et
  incrémentale avec un feedback régulier des parties prenantes.

CRISP-DM seul ne dit rien sur l'organisation d'équipe ni la cadence de livraison ;
Scrum seul ne structure pas les activités data (compréhension des données,
préparation, modélisation, évaluation). **La fusion retenue** :

| Principe | Mise en œuvre |
|---|---|
| CRISP-DM = axe **quoi** (cycle de vie data) | Chaque user story est étiquetée par sa phase CRISP-DM |
| Scrum = axe **quand/comment** (cadence) | 13 sprints de 2 semaines (26 semaines), backlog priorisé MoSCoW, revue + rétrospective |
| Itérativité partagée | Les phases CRISP-DM ne sont pas séquentielles : chaque sprint peut revisiter *Data Preparation* ou *Evaluation* (boucles de retour natives de CRISP-DM) |
| Definition of Done enrichie | Une story « Modeling » n'est *Done* que si son critère d'évaluation CRISP-DM est mesuré (ex. MAPE de la prévision) |
| HITL comme évaluation continue | La phase *Evaluation* n'est pas ponctuelle : les validations humaines (HITL) et le taux d'adoption des suggestions IA alimentent l'évaluation en continu |

**Correspondance phases CRISP-DM ↔ calendrier du stage (6 mois) :**

```
            Février         Mars            Avril           Mai             Juin            Juillet → 2 août
CRISP-DM :  Business ─────► Data Underst. ─► Modeling ────────────────────► Evaluation ───► Deployment
            Understanding   & Preparation    (agents, forecast, RAG)        (HITL, KPIs)    & rapport
Sprints  :  [S1]─[S2]───────[S3]─[S4]───────[S5]─[S6]─[S7]─[S8]────────────[S9]─[S10]──────[S11]─[S12]─[S13]
                        ↑ boucles de retour à chaque revue de sprint ↑
```

**Rôles Scrum :** Product Owner = encadrant entreprise (porteur du besoin retail) ;
Scrum Master = encadrant académique / rotation ; équipe de développement = stagiaire PFE.
Cérémonies : sprint planning (lundi de démarrage), points d'avancement hebdomadaires
avec l'encadrant, sprint review avec démo (vendredi de fin), rétrospective.

---

## 2. Épics

| ID | Épic | Phase(s) CRISP-DM dominante(s) |
|---|---|---|
| **E0** | Intégration & montée en compétences | — (onboarding) |
| **E1** | Cadrage métier & architecture | Business Understanding |
| **E2** | Socle de données (PostgreSQL, migrations, seeds, historique 4,5 ans) | Data Understanding / Data Preparation |
| **E3** | Prévision de la demande (TimesFM, forecast EOD & horaire) | Modeling |
| **E4** | Agents Inventory (Analysis, Context, Decision, orchestrateur batch) | Modeling |
| **E5** | Agents Sales / Coaching (Analyste ReAct, Stratège Reflexion, Coach, RAG) | Modeling |
| **E6** | Human-In-The-Loop & approvisionnement (Kanban PO, guardrail, file HITL) | Evaluation / Deployment |
| **E7** | Frontend Angular (auth, dashboard, chat, inventaire, monitoring) | Deployment |
| **E8** | Observabilité & évaluation (Langfuse, KPIs d'adoption, benchmark forecast) | Evaluation |
| **E9** | Consolidation, documentation & rapport de PFE | Deployment |

---

## 3. Backlog produit priorisé

Priorité **MoSCoW** (M = Must, S = Should, C = Could) — Estimation en **points de story** (suite de Fibonacci).

### E0 — Intégration & montée en compétences *(onboarding)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-0.1 | En tant que **stagiaire**, je veux découvrir l'environnement métier retail (boutiques, processus de vente, gestion de stock) afin de comprendre le domaine. | M | 3 | S1 |
| US-0.2 | En tant que **stagiaire**, je veux monter en compétences sur la stack cible (LangGraph, FastAPI, Angular, PostgreSQL, Milvus) afin d'être opérationnelle. | M | 5 | S1 |
| US-0.3 | En tant que **stagiaire**, je veux mettre en place l'environnement de développement (dépôts git, Docker, base locale) afin de démarrer les développements. | M | 3 | S1 |

### E1 — Cadrage métier & architecture *(Business Understanding)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-1.1 | En tant que **Product Owner**, je veux formaliser les objectifs métier (réduction des ruptures, atteinte des objectifs de vente journaliers) afin d'aligner le système sur la valeur retail. | M | 3 | S1 |
| US-1.2 | En tant qu'**équipe**, je veux réaliser un état de l'art des systèmes multi-agents LLM (patterns ReAct, Reflexion, orchestration, HITL) afin de choisir les approches adaptées. | M | 5 | S2 |
| US-1.3 | En tant qu'**équipe**, je veux définir l'architecture multi-agents cible (modules Sales & Inventory, orchestrateurs) afin de cadrer les développements. | M | 5 | S2 |
| US-1.4 | En tant qu'**équipe**, je veux identifier les acteurs et cas d'utilisation (manager, conseiller, agents) afin de produire la conception UML de référence. | M | 3 | S2 |
| US-1.5 | En tant que **Product Owner**, je veux définir les critères de succès mesurables (précision prévision, taux d'adoption des suggestions IA, latence des cycles) afin d'évaluer le projet objectivement. | M | 2 | S2 |

### E2 — Socle de données *(Data Understanding / Data Preparation)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-2.1 | En tant que **data engineer**, je veux explorer et profiler l'historique de ventes (volumétrie, saisonnalité, qualité) afin de comprendre les données disponibles. | M | 5 | S3 |
| US-2.2 | En tant que **data engineer**, je veux construire un schéma PostgreSQL versionné par migrations Alembic (source unique de vérité, zéro DDL runtime) afin de fiabiliser le socle. | M | 8 | S3 |
| US-2.3 | En tant que **data engineer**, je veux générer un historique time-series réaliste (~1,5 M lignes, 4,5 ans, saisonnalité 3 ans) afin d'alimenter la prévision et les agents. | M | 8 | S3 |
| US-2.4 | En tant que **data engineer**, je veux des seeds idempotents (produits, boutiques, stocks, utilisateurs) afin de reconstruire un environnement complet à la demande. | S | 5 | S4 |
| US-2.5 | En tant que **système**, je veux un simulateur de transactions POS temps réel afin de reproduire l'activité d'une boutique en démonstration. | S | 5 | S4 |
| US-2.6 | En tant que **data engineer**, je veux vectoriser les scripts de vente dans Milvus (pipeline RAG) afin de fournir un contexte métier aux agents de coaching. | M | 5 | S4 |

### E3 — Prévision de la demande *(Modeling)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-3.1 | En tant que **manager**, je veux une prévision de chiffre d'affaires fin de journée (TimesFM) afin d'anticiper l'atteinte de l'objectif. | M | 8 | S5 |
| US-3.2 | En tant que **manager**, je veux une prévision horaire et par mix produits afin de piloter la journée en cours. | S | 5 | S6 |
| US-3.3 | En tant que **data scientist**, je veux exposer TimesFM comme outils MCP afin que l'AnalystAgent l'invoque dans sa boucle ReAct. | M | 5 | S6 |
| US-3.4 | En tant que **data scientist**, je veux un benchmark prévision vs réalisé (MAPE, biais) afin de mesurer la qualité du modèle en continu. | M | 5 | S10 |

### E4 — Agents Inventory *(Modeling)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-4.1 | En tant que **manager**, je veux que l'AnalysisAgent calcule les métriques de stock (EOQ, stock de sécurité, point de commande, jours de stock) et classe le risque par SKU afin d'objectiver l'état du stock. | M | 8 | S5 |
| US-4.2 | En tant que **manager**, je veux que le ContextAgent traduise les signaux externes (météo, promotions, jours fériés, événements) en uplift de demande calibré afin d'ajuster les prévisions de besoin. | M | 8 | S5 |
| US-4.3 | En tant que **manager**, je veux que le DecisionAgent fusionne analyse et contexte pour recommander une action (ORDER / HOLD / MONITOR / EXPEDITE) avec quantité et justification afin de guider le réapprovisionnement. | M | 8 | S6 |
| US-4.4 | En tant qu'**exploitant**, je veux un orchestrateur batch parallélisé (8 workers, pré-chargement DB, graphes compilés une seule fois) afin d'analyser 110 SKUs × 8 boutiques en moins de 2 minutes. | M | 8 | S6 |
| US-4.5 | En tant qu'**exploitant**, je veux une dégradation contrôlée (fallback règles sans LLM, baseline sans uplift si Context échoue) afin de garantir la disponibilité du pipeline. | M | 5 | S8 |
| US-4.6 | En tant que **manager**, je veux des alertes de stock synchronisées (Redis bus) afin d'être notifié des risques de rupture. | S | 5 | S9 |

### E5 — Agents Sales / Coaching *(Modeling)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-5.1 | En tant que **système**, je veux un AnalystAgent ReAct (ingestion POS, gap objectif, urgence, forecast EOD) afin de produire un diagnostic de la journée en cours. | M | 8 | S6 |
| US-5.2 | En tant que **système**, je veux un StrategistAgent Reflexion (contexte + RAG + génération d'actions + auto-critique) afin de proposer des actions commerciales priorisées. | M | 8 | S7 |
| US-5.3 | En tant que **conseiller**, je veux converser avec un CoachAgent qui intègre les actions du Stratège, mon historique et les scripts de vente afin de recevoir un conseil personnalisé et actionnable. | M | 8 | S7 |
| US-5.4 | En tant que **système**, je veux un CycleOrchestrator LangGraph (Analyste → Stratège → Coach conditionnel) déclenché par cron ou à la demande afin d'automatiser les cycles de coaching. | M | 5 | S7 |
| US-5.5 | En tant que **conseiller**, je veux des réponses en streaming (SSE) avec fallback multi-LLM (OpenRouter → Mistral → Ollama) afin d'avoir une expérience fluide et robuste. | S | 5 | S8 |
| US-5.6 | En tant qu'**exploitant**, je veux un orchestrateur Coach→Stratège résilient (cache LRU 30 min, retry ×3, fallback 4 niveaux) afin que le Coach ne soit jamais indisponible. | M | 8 | S8 |
| US-5.7 | En tant que **responsable conformité**, je veux un GuardrailAgent qui valide chaque réponse (blocage hors-sujet, contenus à risque, escalade HITL) afin de sécuriser les sorties LLM. | M | 8 | S8 |

### E6 — Human-In-The-Loop & approvisionnement *(Evaluation / Deployment)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-6.1 | En tant que **manager**, je veux un Kanban des bons de commande synchronisé en temps réel (WebSocket) afin de suivre le cycle de vie des commandes. | M | 8 | S9 |
| US-6.2 | En tant que **manager**, je veux une machine à états des statuts de commande (transitions contrôlées) afin d'éviter les incohérences de flux. | M | 3 | S9 |
| US-6.3 | En tant qu'**agent IA**, je veux pouvoir suggérer un bon de commande (statut SUGGERE) sans jamais l'approuver moi-même afin de préserver la barrière de validation humaine. | M | 5 | S10 |
| US-6.4 | En tant que **manager**, je veux approuver ou rejeter un bon de commande suggéré (avec motif) afin de garder le contrôle final sur les engagements financiers. | M | 5 | S10 |
| US-6.5 | En tant que **manager**, je veux une file de validation HITL centralisée (recommandations sensibles, blocages guardrail) avec statistiques afin d'auditer les décisions de l'IA. | M | 5 | S10 |
| US-6.6 | En tant que **système**, je veux enregistrer chaque décision humaine (approbation/rejet + motif) comme feedback afin d'alimenter l'amélioration des agents. | S | 3 | S10 |

### E7 — Frontend Angular *(Deployment)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-7.1 | En tant qu'**utilisateur**, je veux m'authentifier avec un contrôle d'accès par rôle (manager multi-boutiques / vendeur mono-boutique, sessions 24 h / 12 h) afin de sécuriser l'accès. | M | 5 | S5 |
| US-7.2 | En tant que **manager**, je veux un dashboard boutique temps réel (KPIs, transactions WebSocket, réalisé vs prévu) afin de piloter la journée. | M | 8 | S7 |
| US-7.3 | En tant que **conseiller**, je veux une page conseiller (gap personnel, urgence, historique de conseils) afin de suivre ma performance. | M | 5 | S8 |
| US-7.4 | En tant que **conseiller**, je veux une interface de chat avec le coach (streaming, historique de conversation persistant) afin d'interagir naturellement. | M | 8 | S8 |
| US-7.5 | En tant que **manager**, je veux une page inventaire (recommandations, alertes, objectif métier actif, croisement stock × demande) afin d'agir sur les stocks. | M | 8 | S9 |
| US-7.6 | En tant que **manager**, je veux la page Kanban achats (drag & drop des statuts, cartes suggérées par l'agent mises en évidence) afin de gérer l'approvisionnement. | M | 8 | S9 |
| US-7.7 | En tant que **manager**, je veux une page de monitoring des agents (santé, latence, coûts, erreurs, timeline des cycles) afin de superviser le système. | S | 8 | S11 |
| US-7.8 | En tant qu'**équipe**, je veux des tests e2e sur les parcours critiques afin de sécuriser les livraisons. | S | 5 | S11 |

### E8 — Observabilité & évaluation *(Evaluation)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-8.1 | En tant qu'**exploitant**, je veux des traces Langfuse hiérarchiques (trace cycle → span agent → génération LLM) afin de diagnostiquer chaque exécution. | M | 5 | S7 |
| US-8.2 | En tant qu'**exploitant**, je veux journaliser chaque exécution d'agent (agent_runs / agent_logs : latence, tokens, statut) afin de mesurer coûts et fiabilité. | M | 5 | S8 |
| US-8.3 | En tant que **Product Owner**, je veux des KPIs d'adoption IA (taux d'approbation des suggestions, volumes HITL) afin d'évaluer la valeur métier du système. | M | 5 | S11 |
| US-8.4 | En tant que **Product Owner**, je veux le benchmark des prévisions (TimesFM vs réalisé) affiché dans l'interface afin de justifier la confiance dans le modèle. | M | 5 | S11 |
| US-8.5 | En tant qu'**exploitant**, je veux des endpoints de santé et de dépendances afin d'intégrer la plateforme à une supervision d'exploitation. | C | 3 | S11 |

### E9 — Consolidation, documentation & rapport *(Deployment)*

| ID | User story | Priorité | Pts | Sprint |
|---|---|---|---|---|
| US-9.1 | En tant que **stagiaire**, je veux corriger les anomalies remontées en revues de sprint (stabilisation générale) afin de livrer une plateforme fiable. | M | 8 | S12 |
| US-9.2 | En tant que **stagiaire**, je veux finaliser la documentation technique (architecture, installation, exploitation) afin d'assurer la transmission du projet. | M | 5 | S12 |
| US-9.3 | En tant que **stagiaire**, je veux rédiger le rapport de PFE (conception UML, méthodologie, résultats d'évaluation) afin de préparer la soutenance. | M | 13 | S12–S13 |
| US-9.4 | En tant que **stagiaire**, je veux préparer la démonstration de soutenance (scénario bout-en-bout, jeu de données de démo) afin de valoriser le travail réalisé. | M | 3 | S13 |
| US-9.5 | En tant que **stagiaire**, je veux réaliser la recette finale avec l'encadrant entreprise et la passation du projet afin de clôturer le stage proprement. | M | 3 | S13 |

---

## 4. Plan des 13 sprints (6 mois — 02/02/2026 → 02/08/2026)

Sprints de 2 semaines (26 semaines au total). Vélocité cible : **~26–30 points / sprint**.

| Sprint | Dates | Objectif de sprint (Sprint Goal) | Phase(s) CRISP-DM | Livrable démontrable |
|---|---|---|---|---|
| **S1** | 02/02 → 13/02 | Onboarding : domaine retail, stack technique, environnement de dev | Business Understanding | Environnement opérationnel, note de cadrage métier |
| **S2** | 16/02 → 27/02 | Cadrage : état de l'art multi-agents, architecture cible, conception UML | Business Understanding | Dossier de conception (cas d'utilisation, séquences), critères de succès |
| **S3** | 02/03 → 13/03 | Socle data : exploration des ventes, schéma PostgreSQL migré, historique 4,5 ans | Data Understanding, Data Preparation | Rapport d'exploration, migrations Alembic, time-series chargées |
| **S4** | 16/03 → 27/03 | Données prêtes : seeds, simulateur POS, corpus RAG indexé dans Milvus | Data Preparation | Environnement reconstructible, RAG interrogeable, flux POS simulé |
| **S5** | 30/03 → 10/04 | Premiers modèles : forecast EOD TimesFM, agents Analysis & Context, authentification | Modeling | Prévision EOD démontrable, premières analyses de stock, login par rôle |
| **S6** | 13/04 → 24/04 | Pipeline Inventory complet : DecisionAgent, orchestrateur batch < 2 min, TimesFM en outils MCP, AnalystAgent ReAct | Modeling | Batch 110 SKUs bout-en-bout avec recommandations persistées |
| **S7** | 27/04 → 08/05 | Pipeline Sales complet : Stratège Reflexion, Coach, CycleOrchestrator, dashboard temps réel, traces Langfuse | Modeling | Cycle de coaching bout-en-bout visible dans le dashboard |
| **S8** | 11/05 → 22/05 | Robustesse & UX conseiller : guardrail, fallback multi-LLM, orchestrateur résilient, chat streaming, page conseiller | Modeling, Evaluation | Chat coach robuste (pannes LLM simulées), journalisation agents |
| **S9** | 25/05 → 05/06 | Approvisionnement : page inventaire, alertes stock, Kanban PO temps réel avec machine à états | Deployment | Kanban achats synchronisé WebSocket, page inventaire opérationnelle |
| **S10** | 08/06 → 19/06 | Boucle HITL complète : PO suggérés par l'agent, approbation/rejet, file HITL, feedback, benchmark forecast | Evaluation | Validation humaine des suggestions IA démontrée de bout en bout |
| **S11** | 22/06 → 03/07 | Évaluation & supervision : KPIs d'adoption IA, benchmark dans l'UI, page monitoring, tests e2e | Evaluation | Tableau de bord d'évaluation chiffré (MAPE, taux d'adoption) |
| **S12** | 06/07 → 17/07 | Consolidation : stabilisation des anomalies, documentation technique, début de rédaction du rapport | Deployment | Plateforme stabilisée, documentation à jour, plan du rapport validé |
| **S13** | 20/07 → 31/07 | Clôture : finalisation du rapport de PFE, démo de soutenance, recette finale et transfert de connaissances | Deployment | Rapport finalisé, scénario de démonstration répété, passation |

**Jalons du stage :**

| Jalon | Date | Contenu |
|---|---|---|
| J1 — Fin de cadrage | fin février | Architecture validée, conception UML, critères de succès |
| J2 — Socle data prêt | fin mars | Base migrée, historique chargé, RAG indexé |
| J3 — Pipelines agents opérationnels | mi-mai | Inventory + Sales bout-en-bout avec observabilité |
| J4 — Boucle HITL démontrée | mi-juin | Suggestions IA validées par l'humain, feedback tracé |
| J5 — Évaluation chiffrée | début juillet | KPIs d'adoption IA, benchmark forecast, tests e2e |
| J6 — Clôture du stage | 31 juillet (fin : 2 août) | Rapport finalisé, démo de soutenance, recette et passation |

---

## 5. Definition of Done (enrichie CRISP-DM)

Une user story est **Done** si :

1. Code revu, mergé sur `main`, sans régression des tests existants ;
2. Critères d'acceptation démontrés en sprint review ;
3. **Pour les stories Modeling** : métrique d'évaluation mesurée et tracée
   (ex. MAPE du forecast, taux de fallback, latence de cycle) ;
4. **Pour les stories Evaluation/HITL** : la décision humaine est auditable en base ;
5. Observabilité en place (logs agent + trace Langfuse pour tout nouveau nœud) ;
6. Documentation d'architecture mise à jour si le design change.

---

## 6. Gestion des risques (extrait)

| Risque | Phase CRISP-DM concernée | Mitigation (implémentée) |
|---|---|---|
| Indisponibilité du fournisseur LLM | Modeling / Deployment | Fallback multi-fournisseurs (OpenRouter → Mistral → Ollama) + mode règles `use_llm=False` |
| Réponse LLM inappropriée face au client | Evaluation | GuardrailAgent bloquant + escalade HITL |
| Décision d'achat erronée de l'IA | Evaluation | Statut SUGGERE : aucune commande sans approbation humaine |
| Latence batch inacceptable | Deployment | Graphes LangGraph compilés une fois + pré-chargement DB (15 min → < 2 min) |
| Dérive de la qualité de prévision | Evaluation | Benchmark continu prévision vs réalisé exposé dans l'UI |
| Retard sur le planning (stagiaire seul) | — | Priorisation MoSCoW : les « Could » sont sacrifiables sans compromettre les jalons |
