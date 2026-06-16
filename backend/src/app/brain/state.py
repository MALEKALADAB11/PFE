"""
LangGraph Shared State for the MCP Agentic Brain Architecture.

This module defines the complete TypedDict state that flows through all 9 agents
of the MCP (Model Context Protocol) architecture, from ZONE A (Inputs) to
ZONE B (MCP Processing) and finally to ZONE D (Outputs).

Architecture overview:
  ZONE A  → Raw inputs: POS, WMS, Weather, Events
  ZONE B  → Agent processing: APPOG, APPOB, APPOX, APP-CTX, APP05,
                              APP-RSK, APP-CNT, APP-MEM, APP03
  ZONE D  → Outputs: recommendations, NLG coaching, dashboard data, alerts

Usage:
    from backend.src.app.brain.state import MCPState, create_initial_state, validate_state

    state: MCPState = create_initial_state(cycle_id="cycle-001", store_id="store-42")
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Sequence, TypedDict


# ---------------------------------------------------------------------------
# Enumerations / Literal types
# ---------------------------------------------------------------------------

AgentName = Literal[
    "APPOG",   # Orchestrator
    "APPOB",   # Inventory Watcher
    "APPOX",   # Analysis Agent
    "APP-CTX", # Context Enrichment Agent
    "APP05",   # Strategy Definition Agent
    "APP-RSK", # Risk Identification Agent
    "APP-CNT", # Constraints Management Agent
    "APP-MEM", # Memory Agent
    "APP03",   # Forecast Agent
]

AgentStatus = Literal["PENDING", "RUNNING", "DONE", "ERROR", "SKIPPED"]

RiskLevel = Literal["critical", "high", "medium", "low", "ok"]

RecommendationType = Literal[
    "reorder", "redistribution", "markdown", "upsell", "hold", "escalate"
]

CoachingPriority = Literal["HIGH", "MED", "LOW", "OK"]

RouteMode = Literal["analyse", "prediction", "strategie", "risque"]


# ---------------------------------------------------------------------------
# ZONE A — Input sub-types
# ---------------------------------------------------------------------------


class POSTransaction(TypedDict):
    """A single point-of-sale transaction from the WebSocket feed."""

    transaction_id: str
    """Unique identifier of the POS transaction."""

    store_id: str
    """Identifier of the store/boutique where the transaction occurred."""

    advisor_id: str
    """Identifier of the sales advisor who processed the transaction."""

    timestamp: str
    """ISO-8601 UTC timestamp of the transaction."""

    sku: str
    """Stock-Keeping Unit identifier of the sold product."""

    quantity: int
    """Number of units sold in this transaction."""

    unit_price: float
    """Price per unit in local currency (DT)."""

    total_amount: float
    """Total transaction amount in local currency (DT)."""

    payment_method: str
    """Payment method used (e.g. 'card', 'cash', 'mobile')."""


class POSData(TypedDict):
    """Aggregated POS data consumed from the WebSocket feed (ZONE A)."""

    transactions: List[POSTransaction]
    """List of raw POS transactions received in the current processing cycle."""

    ca_journalier: float
    """Daily revenue (CA) accumulated so far (DT)."""

    ca_objectif: float
    """Daily revenue target for the store (DT)."""

    nb_transactions: int
    """Total number of transactions in the current cycle."""

    top_skus: List[str]
    """SKUs with the highest sales volume in the current cycle."""

    last_updated: str
    """ISO-8601 UTC timestamp of the last POS update received."""


class WMSStockEntry(TypedDict):
    """Inventory level for a single SKU from the Warehouse Management System."""

    sku: str
    """Stock-Keeping Unit identifier."""

    stock_current: int
    """Current on-hand stock quantity."""

    stock_min: int
    """Minimum safety stock threshold; below this triggers a risk alert."""

    stock_max: int
    """Maximum stock capacity; above this may indicate overstock."""

    coverage_days: float
    """Estimated days of coverage based on current demand rate."""

    last_reception_date: Optional[str]
    """ISO-8601 date of the last stock reception (None if never received)."""

    in_transit_qty: int
    """Quantity currently in transit / pending reception."""


class WMSData(TypedDict):
    """WMS inventory snapshot consumed from the WMS feed (ZONE A)."""

    store_id: str
    """Store identifier for which inventory data is provided."""

    stock_entries: List[WMSStockEntry]
    """Per-SKU inventory levels for the store."""

    global_coverage_ratio: float
    """Overall stock coverage ratio across all SKUs (0–1 scale)."""

    critical_skus: List[str]
    """SKUs flagged as critically low on stock."""

    last_updated: str
    """ISO-8601 UTC timestamp of the last WMS snapshot."""


class WeatherData(TypedDict):
    """Current and forecast weather data from an external weather API (ZONE A)."""

    location: str
    """City/region name for the store location."""

    condition: str
    """Human-readable weather condition (e.g. 'Sunny', 'Rainy', 'Cloudy')."""

    temperature_c: float
    """Current temperature in degrees Celsius."""

    humidity_pct: float
    """Current relative humidity percentage (0–100)."""

    wind_speed_kmh: float
    """Current wind speed in km/h."""

    impact_on_traffic: Literal["positive", "neutral", "negative"]
    """Estimated impact of weather on in-store foot traffic."""

    forecast_24h: str
    """Short weather forecast for the next 24 hours."""

    retrieved_at: str
    """ISO-8601 UTC timestamp when the weather data was fetched."""


class KafkaEvent(TypedDict):
    """A business event consumed from a Kafka topic (ZONE A)."""

    event_id: str
    """Unique Kafka message key / event identifier."""

    topic: str
    """Kafka topic from which the event was consumed."""

    event_type: str
    """Type of event (e.g. 'promotion_start', 'competitor_sale', 'local_event')."""

    payload: Dict[str, Any]
    """Arbitrary event payload as a JSON-serialisable dictionary."""

    event_timestamp: str
    """ISO-8601 UTC timestamp of when the event occurred."""

    distance_km: Optional[float]
    """Distance from store to the event location in km (None if not applicable)."""

    estimated_impact: Optional[str]
    """LLM-generated or rule-based estimate of business impact."""


# ---------------------------------------------------------------------------
# ZONE B — Agent output sub-types
# ---------------------------------------------------------------------------


class AgentMeta(TypedDict):
    """Execution metadata attached to every agent output."""

    agent_id: AgentName
    """Identifier of the agent that produced this output."""

    status: AgentStatus
    """Execution status of the agent in the current cycle."""

    started_at: str
    """ISO-8601 UTC timestamp when agent execution started."""

    finished_at: Optional[str]
    """ISO-8601 UTC timestamp when agent execution finished (None if still running)."""

    latency_ms: Optional[int]
    """Wall-clock execution time of the agent in milliseconds."""

    error: Optional[str]
    """Error message if the agent status is 'ERROR', otherwise None."""

    model_used: Optional[str]
    """Name/version of the LLM or ML model invoked by the agent (if any)."""


class APPOXOutput(TypedDict):
    """Output produced by the APPOX Analysis Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    sales_velocity: Dict[str, float]
    """Per-SKU sales velocity (units / hour) computed for the current cycle."""

    anomalies: List[Dict[str, Any]]
    """List of detected sales anomalies with details (sku, deviation, severity)."""

    segment_insights: Dict[str, Any]
    """Insights per product/advisor segment (e.g. top performers, laggards)."""

    ca_trajectory: float
    """Projected end-of-day CA based on current sales pace (DT)."""

    performance_gap: float
    """Difference between ca_trajectory and ca_objectif (DT); negative = underperforming."""

    raw_analysis: Optional[str]
    """Full free-text LLM analysis narrative (for logging / explainability)."""


class APPCTXOutput(TypedDict):
    """Output produced by the APP-CTX Context Enrichment Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    enriched_context: Dict[str, Any]
    """Merged context combining weather, events, and POS data for downstream agents."""

    context_tags: List[str]
    """Semantic tags describing the current business context (e.g. 'rainy_day', 'promo_active')."""

    traffic_forecast: float
    """Estimated in-store traffic for the next hour (number of visitors)."""

    sentiment: Literal["positive", "neutral", "negative"]
    """Overall sentiment of the enriched context for the current period."""

    context_summary: Optional[str]
    """Free-text LLM-generated summary of the current context."""


class APP05Output(TypedDict):
    """Output produced by the APP05 Strategy Definition Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    route_mode: RouteMode
    """Processing route selected by the strategy agent for this cycle."""

    priority_actions: List[Dict[str, Any]]
    """Ordered list of prioritised actions to execute (with rationale)."""

    advisor_targets: Dict[str, float]
    """Revised per-advisor CA targets for the remainder of the day (DT)."""

    strategy_narrative: Optional[str]
    """Free-text LLM narrative explaining the chosen strategy."""


class APPRSKOutput(TypedDict):
    """Output produced by the APP-RSK Risk Identification Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    risk_flags: List[Dict[str, Any]]
    """List of identified risk items with (sku, risk_level, reason, recommended_action)."""

    overall_risk_level: RiskLevel
    """Aggregated risk level for the store in the current cycle."""

    rupture_probability: Dict[str, float]
    """Per-SKU probability of stock-out within 24 h (0.0–1.0)."""

    financial_exposure: float
    """Estimated financial exposure (lost revenue) from current risks (DT)."""

    risk_summary: Optional[str]
    """Free-text LLM risk summary."""


class APPCNTOutput(TypedDict):
    """Output produced by the APP-CNT Constraints Management Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    active_constraints: List[Dict[str, Any]]
    """List of active business/operational constraints (type, description, scope)."""

    violated_constraints: List[Dict[str, Any]]
    """Constraints that are currently violated and require action."""

    relaxation_suggestions: List[str]
    """Suggestions for relaxing non-critical constraints to improve performance."""

    constraints_summary: Optional[str]
    """Free-text summary of the current constraint landscape."""


class APPMEMOutput(TypedDict):
    """Output produced by the APP-MEM Memory Agent."""

    meta: AgentMeta
    """Agent execution metadata."""

    short_term_memory: Dict[str, Any]
    """In-session key-value store for ephemeral agent state (cleared each cycle)."""

    long_term_patterns: List[Dict[str, Any]]
    """Historical patterns retrieved from the Milvus vector store."""

    advisor_history: Dict[str, Any]
    """Per-advisor performance history summary retrieved from persistent storage."""

    relevant_episodes: List[Dict[str, Any]]
    """Similar past episodes (context + outcome) fetched from episodic memory."""

    memory_summary: Optional[str]
    """Free-text narrative synthesising retrieved memories for downstream agents."""


class APP03Output(TypedDict):
    """Output produced by the APP03 Forecast Agent (TimeFM / ML engine)."""

    meta: AgentMeta
    """Agent execution metadata."""

    demand_forecast: Dict[str, List[float]]
    """Per-SKU demand forecast for the next 24 h in 1-hour buckets (units/h)."""

    ca_forecast_hourly: List[float]
    """Hourly CA forecast for the store for the next 24 h (DT/h)."""

    ca_forecast_eod: float
    """Predicted end-of-day CA (DT)."""

    confidence_intervals: Dict[str, Any]
    """90% confidence intervals for the key forecast metrics."""

    model_version: str
    """Version tag of the forecasting model used (e.g. 'timefm-v1.2')."""

    forecast_summary: Optional[str]
    """Free-text LLM narrative interpreting the forecast results."""


# ---------------------------------------------------------------------------
# ZONE D — Output sub-types
# ---------------------------------------------------------------------------


class Recommendation(TypedDict):
    """A single actionable recommendation produced at the end of a cycle."""

    recommendation_id: str
    """Unique identifier of this recommendation."""

    type: RecommendationType
    """Category of the recommended action."""

    sku: Optional[str]
    """Target SKU if the recommendation is product-specific (None for global)."""

    advisor_id: Optional[str]
    """Target advisor if the recommendation is advisor-specific (None for global)."""

    message: str
    """Human-readable description of the recommended action."""

    urgency: RiskLevel
    """Urgency / priority of the recommendation."""

    expected_impact_dt: Optional[float]
    """Estimated positive revenue impact of the action (DT) if executed."""

    confidence: float
    """Model confidence score for this recommendation (0.0–1.0)."""

    rationale: Optional[str]
    """LLM-generated rationale for why this recommendation was produced."""


class NLGCoachingMessage(TypedDict):
    """Natural Language Generation coaching message for a sales advisor."""

    message_id: str
    """Unique identifier of this coaching message."""

    advisor_id: str
    """Identifier of the advisor this message is addressed to."""

    advisor_name: str
    """Display name of the advisor."""

    priority: CoachingPriority
    """Priority level of the coaching message."""

    subject: str
    """Brief subject / headline of the coaching message."""

    body: str
    """Full coaching message body generated by the NLG (APP-CTX / LLM)."""

    context_tags: List[str]
    """Tags explaining the context that triggered this coaching message."""

    target_sku: Optional[str]
    """SKU referenced in the coaching message (None if not product-specific)."""

    generated_at: str
    """ISO-8601 UTC timestamp when the message was generated."""

    status: Literal["pending", "approved", "sent", "dismissed"]
    """Lifecycle status of this coaching message."""


class DashboardData(TypedDict):
    """Aggregated data payload for the frontend dashboards (ZONE D)."""

    store_id: str
    """Store identifier."""

    ca_journalier: float
    """Accumulated daily CA (DT)."""

    ca_objectif: float
    """Daily CA target (DT)."""

    ca_forecast_eod: float
    """Forecast end-of-day CA (DT)."""

    performance_pct: float
    """Current performance vs target as a percentage (0–100+)."""

    overall_risk_level: RiskLevel
    """Aggregated risk level for the store."""

    agent_statuses: Dict[AgentName, AgentStatus]
    """Current execution status of all 9 agents."""

    kpi_cards: List[Dict[str, Any]]
    """Pre-formatted KPI card payloads for the frontend KPI widgets."""

    product_mix: List[Dict[str, Any]]
    """Per-product-category breakdown for the product-mix chart."""

    traffic_data: List[Dict[str, Any]]
    """Time-series traffic data for the traffic chart widget."""

    updated_at: str
    """ISO-8601 UTC timestamp of this dashboard snapshot."""


class Alert(TypedDict):
    """A system alert or flag raised during the processing cycle."""

    alert_id: str
    """Unique identifier of the alert."""

    alert_type: Literal[
        "stock_rupture",
        "performance_gap",
        "anomaly_detected",
        "constraint_violated",
        "forecast_deviation",
        "system_error",
    ]
    """Category of the alert."""

    severity: RiskLevel
    """Severity / urgency level of the alert."""

    message: str
    """Human-readable alert message."""

    source_agent: AgentName
    """Agent that raised this alert."""

    target_sku: Optional[str]
    """SKU involved (None if not product-specific)."""

    target_advisor: Optional[str]
    """Advisor involved (None if not advisor-specific)."""

    raised_at: str
    """ISO-8601 UTC timestamp when the alert was raised."""

    resolved: bool
    """Whether the alert has been acknowledged / resolved."""


# ---------------------------------------------------------------------------
# Metadata sub-types
# ---------------------------------------------------------------------------


class CycleMetadata(TypedDict):
    """Metadata tracking the lifecycle of a single processing cycle."""

    cycle_id: str
    """Unique identifier for the current processing cycle (UUID)."""

    store_id: str
    """Identifier of the store/boutique being processed."""

    cycle_number: int
    """Sequential cycle counter within the current session (1-based)."""

    started_at: str
    """ISO-8601 UTC timestamp when the cycle started."""

    finished_at: Optional[str]
    """ISO-8601 UTC timestamp when the cycle completed (None if in progress)."""

    route_mode: Optional[RouteMode]
    """Processing route selected for this cycle (set by APP05)."""

    agent_sequence: List[AgentName]
    """Ordered list of agents that have been executed in this cycle."""

    parallel_groups: List[List[AgentName]]
    """Groups of agents executed in parallel during this cycle."""

    total_latency_ms: Optional[int]
    """Total wall-clock time for the complete cycle in milliseconds."""

    llm_tokens_used: int
    """Total LLM tokens consumed across all agents in this cycle."""

    errors: List[str]
    """List of error messages collected during the cycle (for diagnostics)."""


# ---------------------------------------------------------------------------
# Root MCPState — shared across all 9 agents
# ---------------------------------------------------------------------------


class MCPState(TypedDict):
    """
    Complete shared LangGraph state for the MCP Agentic Brain Architecture.

    This TypedDict is passed through every node of the LangGraph graph and is
    progressively enriched as each agent executes.  The state flows:

        ZONE A inputs  →  ZONE B agent outputs  →  ZONE D final outputs

    Agents should only write to their own output key and should treat all
    other keys as read-only inputs.

    Example usage::

        from backend.src.app.brain.state import MCPState, create_initial_state

        state: MCPState = create_initial_state("cycle-001", "store-42")
        # Pass to LangGraph graph.invoke(state)
    """

    # ------------------------------------------------------------------
    # ZONE A — Inputs
    # ------------------------------------------------------------------

    pos_data: Optional[POSData]
    """
    Real-time POS data streamed via WebSocket from the store terminals.
    Populated by the ingestion layer before the cycle starts.
    """

    wms_data: Optional[WMSData]
    """
    Inventory snapshot from the Warehouse Management System.
    Updated at the start of each cycle or when a WMS event is received.
    """

    weather_data: Optional[WeatherData]
    """
    Current weather conditions and 24-h forecast for the store location.
    Fetched from the external weather API (mcp_urllib tool).
    """

    kafka_events: List[KafkaEvent]
    """
    Business events consumed from Kafka topics in the current cycle window.
    May include promotions, competitor activity, and local events.
    """

    # ------------------------------------------------------------------
    # ZONE B — Agent outputs (progressively populated)
    # ------------------------------------------------------------------

    appox_output: Optional[APPOXOutput]
    """
    Output of the APPOX Analysis Agent.
    Contains sales velocity, anomalies, trajectory, and performance gap.
    """

    app_ctx_output: Optional[APPCTXOutput]
    """
    Output of the APP-CTX Context Enrichment Agent.
    Contains enriched context, traffic forecast, and sentiment.
    """

    app05_output: Optional[APP05Output]
    """
    Output of the APP05 Strategy Definition Agent.
    Defines the route_mode and priority actions for the cycle.
    """

    app_rsk_output: Optional[APPRSKOutput]
    """
    Output of the APP-RSK Risk Identification Agent.
    Contains risk flags, rupture probabilities, and financial exposure.
    """

    app_cnt_output: Optional[APPCNTOutput]
    """
    Output of the APP-CNT Constraints Management Agent.
    Lists active and violated business constraints.
    """

    app_mem_output: Optional[APPMEMOutput]
    """
    Output of the APP-MEM Memory Agent.
    Provides short-term memory, long-term patterns, and advisor history.
    """

    app03_output: Optional[APP03Output]
    """
    Output of the APP03 Forecast Agent (TimeFM / ML engine).
    Contains demand forecasts and end-of-day CA prediction.
    """

    # ------------------------------------------------------------------
    # ZONE D — Final outputs
    # ------------------------------------------------------------------

    recommendations: List[Recommendation]
    """
    Actionable recommendations synthesised by the orchestrator (APPOG)
    from all agent outputs.  Sent to the frontend dashboard and advisors.
    """

    coaching_messages: List[NLGCoachingMessage]
    """
    NLG-generated personalised coaching messages for sales advisors.
    Produced by APP-CTX / the NLG pipeline and approved by APPOG.
    """

    dashboard_data: Optional[DashboardData]
    """
    Pre-aggregated payload for the frontend Angular dashboards.
    Serialised and pushed via WebSocket to the dashboard.
    """

    alerts: List[Alert]
    """
    System alerts and flags raised during the cycle by any agent.
    Displayed in real-time on the monitoring dashboard.
    """

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    metadata: CycleMetadata
    """
    Cycle lifecycle metadata: cycle ID, store ID, timestamps, agent sequence,
    token usage, and errors.  Updated throughout the cycle by the orchestrator.
    """


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def create_initial_state(cycle_id: Optional[str] = None, store_id: str = "") -> MCPState:
    """
    Create a fresh MCPState with all optional fields set to None/empty and
    metadata initialised for a new processing cycle.

    Args:
        cycle_id:  Unique identifier for the cycle.  Auto-generated UUID if None.
        store_id:  Identifier of the store being processed.

    Returns:
        A fully initialised MCPState ready to be passed to the LangGraph graph.

    Example::

        state = create_initial_state(store_id="store-42")
    """
    now = _utc_now()
    return MCPState(
        # ZONE A inputs
        pos_data=None,
        wms_data=None,
        weather_data=None,
        kafka_events=[],
        # ZONE B agent outputs
        appox_output=None,
        app_ctx_output=None,
        app05_output=None,
        app_rsk_output=None,
        app_cnt_output=None,
        app_mem_output=None,
        app03_output=None,
        # ZONE D outputs
        recommendations=[],
        coaching_messages=[],
        dashboard_data=None,
        alerts=[],
        # Metadata
        metadata=CycleMetadata(
            cycle_id=cycle_id or str(uuid.uuid4()),
            store_id=store_id,
            cycle_number=1,
            started_at=now,
            finished_at=None,
            route_mode=None,
            agent_sequence=[],
            parallel_groups=[],
            total_latency_ms=None,
            llm_tokens_used=0,
            errors=[],
        ),
    )


def create_agent_meta(
    agent_id: AgentName,
    *,
    model_used: Optional[str] = None,
) -> AgentMeta:
    """
    Create an AgentMeta dict for an agent that is about to start executing.

    Args:
        agent_id:   The name of the agent (must be one of the AgentName literals).
        model_used: Optional name/version of the LLM model being used.

    Returns:
        An AgentMeta dict with status='RUNNING' and started_at set to now.
    """
    return AgentMeta(
        agent_id=agent_id,
        status="RUNNING",
        started_at=_utc_now(),
        finished_at=None,
        latency_ms=None,
        error=None,
        model_used=model_used,
    )


def finalize_agent_meta(meta: AgentMeta, *, error: Optional[str] = None) -> AgentMeta:
    """
    Finalise an AgentMeta dict once an agent has finished executing.

    Computes the latency from started_at to now and sets the appropriate status.

    Args:
        meta:  The AgentMeta dict returned by :func:`create_agent_meta`.
        error: Optional error message; if provided, status is set to 'ERROR'.

    Returns:
        An updated AgentMeta dict with finished_at, latency_ms, and status set.
    """
    finished = _utc_now()
    started_dt = datetime.fromisoformat(meta["started_at"].replace("Z", "+00:00"))
    finished_dt = datetime.fromisoformat(finished.replace("Z", "+00:00"))
    latency_ms = int((finished_dt - started_dt).total_seconds() * 1000)

    return AgentMeta(
        agent_id=meta["agent_id"],
        status="ERROR" if error else "DONE",
        started_at=meta["started_at"],
        finished_at=finished,
        latency_ms=latency_ms,
        error=error,
        model_used=meta.get("model_used"),
    )


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def validate_state(state: MCPState) -> List[str]:
    """
    Validate the consistency and completeness of an MCPState.

    Performs lightweight checks without raising exceptions so that the caller
    can decide how to handle validation failures.

    Args:
        state: The MCPState to validate.

    Returns:
        A list of human-readable validation error messages.
        An empty list means the state is valid.

    Example::

        errors = validate_state(state)
        if errors:
            logger.warning("State validation errors: %s", errors)
    """
    errors: List[str] = []

    # Metadata checks
    meta = state.get("metadata")
    if not meta:
        errors.append("metadata is missing from state")
        return errors  # cannot proceed without metadata

    if not meta.get("cycle_id"):
        errors.append("metadata.cycle_id must not be empty")

    if not meta.get("store_id"):
        errors.append("metadata.store_id must not be empty")

    if meta.get("cycle_number", 0) < 1:
        errors.append("metadata.cycle_number must be >= 1")

    # ZONE A — at least one input source must be present
    has_input = any([
        state.get("pos_data") is not None,
        state.get("wms_data") is not None,
        state.get("weather_data") is not None,
        bool(state.get("kafka_events")),
    ])
    if not has_input:
        errors.append("At least one ZONE A input (pos_data, wms_data, weather_data, kafka_events) must be provided")

    # ZONE B — validate agent outputs that are present
    if (appox := state.get("appox_output")) is not None:
        if appox["meta"]["status"] == "ERROR" and not appox["meta"].get("error"):
            errors.append("appox_output.meta.status is 'ERROR' but meta.error is empty")

    if (app03 := state.get("app03_output")) is not None:
        if not app03.get("model_version"):
            errors.append("app03_output.model_version must be set")
        for sku, forecast in app03.get("demand_forecast", {}).items():
            if len(forecast) != 24:
                errors.append(
                    f"app03_output.demand_forecast['{sku}'] must have exactly 24 hourly buckets"
                )

    if (app03 := state.get("app03_output")) is not None:
        if len(app03.get("ca_forecast_hourly", [])) not in (0, 24):
            errors.append("app03_output.ca_forecast_hourly must be empty or have exactly 24 values")

    # ZONE D — check recommendations have required fields
    for i, rec in enumerate(state.get("recommendations", [])):
        if not rec.get("recommendation_id"):
            errors.append(f"recommendations[{i}].recommendation_id is empty")
        if not rec.get("message"):
            errors.append(f"recommendations[{i}].message is empty")
        conf = rec.get("confidence", -1.0)
        if not (0.0 <= conf <= 1.0):
            errors.append(f"recommendations[{i}].confidence must be between 0.0 and 1.0")

    # Check alerts
    for i, alert in enumerate(state.get("alerts", [])):
        if not alert.get("alert_id"):
            errors.append(f"alerts[{i}].alert_id is empty")

    return errors


def is_zone_b_complete(state: MCPState) -> bool:
    """
    Return True if all 7 ZONE B agent outputs are populated and error-free.

    Useful for conditional edges in the LangGraph graph that gate ZONE D
    output generation until all processing agents have finished.

    Args:
        state: The current MCPState.

    Returns:
        True if every agent output is present and has status 'DONE'.
    """
    agent_output_keys: Sequence[str] = [
        "appox_output",
        "app_ctx_output",
        "app05_output",
        "app_rsk_output",
        "app_cnt_output",
        "app_mem_output",
        "app03_output",
    ]
    for key in agent_output_keys:
        output = state.get(key)  # type: ignore[literal-required]
        if output is None:
            return False
        if output.get("meta", {}).get("status") not in ("DONE",):
            return False
    return True


def get_active_alerts(state: MCPState, min_severity: RiskLevel = "low") -> List[Alert]:
    """
    Return unresolved alerts at or above a given severity level.

    Severity ordering (most to least severe):
        critical > high > medium > low > ok

    Args:
        state:        The current MCPState.
        min_severity: Minimum severity level to include (default: 'low').

    Returns:
        Filtered list of unresolved Alert dicts sorted by severity (desc).
    """
    severity_rank: Dict[str, int] = {
        "critical": 5,
        "high": 4,
        "medium": 3,
        "low": 2,
        "ok": 1,
    }
    threshold = severity_rank.get(min_severity, 0)
    result = [
        a for a in state.get("alerts", [])
        if not a.get("resolved", False)
        and severity_rank.get(a.get("severity", "ok"), 0) >= threshold
    ]
    result.sort(key=lambda a: severity_rank.get(a.get("severity", "ok"), 0), reverse=True)
    return result


def state_to_dict(state: MCPState) -> Dict[str, Any]:
    """
    Convert an MCPState to a plain JSON-serialisable dictionary.

    All TypedDict values are already plain dicts/lists so this is essentially
    an identity operation; it exists as an explicit serialisation boundary for
    API responses and WebSocket payloads.

    Args:
        state: The MCPState to serialise.

    Returns:
        A JSON-serialisable dict representation of the state.
    """
    # TypedDicts are plain dicts at runtime; a shallow copy is sufficient.
    return dict(state)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _utc_now() -> str:
    """Return the current UTC time as an ISO-8601 string with 'Z' suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
