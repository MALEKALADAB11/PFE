# Dossier de conception — Rapport PFE

Conception UML et backlog méthodologique de la plateforme multi-agents
Ventes & Inventaire (frontend Angular `d:\frontend\PFE` + backend FastAPI
`D:\backend\multi-agent-sales-inventory`).

## Contenu

| Fichier | Contenu |
|---|---|
| `01-cas-utilisation-global.puml` | Diagramme de cas d'utilisation global (2 acteurs humains, 5 acteurs systèmes, 6 packages) |
| `02-sequence-authentification.puml` | SD-01 : login, sessions, contrôle par rôle |
| `03-sequence-cycle-coaching.puml` | SD-02 : cycle Analyste → Stratège → Coach (LangGraph) |
| `04-sequence-chat-coach.puml` | SD-03 : chat conseiller (SSE, RAG, guardrail, fallback LLM) |
| `05-sequence-coach-stratege-resilient.puml` | SD-04 : orchestrateur résilient (cache LRU / retry / fallback 4 niveaux) |
| `06-sequence-analyse-inventaire.puml` | SD-05 : batch inventaire (Analysis ‖ Context → Decision) |
| `07-sequence-po-suggere-hitl.puml` | SD-06 : PO suggéré par l'agent + validation humaine + Kanban WebSocket |
| `08-sequence-dashboard-temps-reel.puml` | SD-07 : dashboard manager (WebSocket POS + TimesFM) |
| `09-sequence-hitl-validation.puml` | SD-08 : file de validation HITL |
| `10-sequence-monitoring.puml` | SD-09 : supervision agents + KPIs d'évaluation |
| `11-backlog-crisp-dm-scrum.md` | Backlog produit hybride CRISP-DM × Scrum (8 épics, ~40 user stories, 7 sprints) |

## Générer les images des diagrammes

Les `.puml` se rendent avec [PlantUML](https://plantuml.com) :

- **En ligne** : coller le contenu sur https://www.plantuml.com/plantuml
- **VS Code** : extension « PlantUML » (jebbs) → `Alt+D` pour prévisualiser
- **CLI** (nécessite Java + Graphviz) :
  ```bash
  java -jar plantuml.jar -tpng docs/rapport/*.puml   # ou -tsvg pour le rapport
  ```

Pour le rapport LaTeX/Word, exporter en **SVG** (qualité vectorielle).
