"use client";

import { useCallback, useEffect, useState } from "react";

type HealthResponse = { ok: boolean; graphConnected: boolean; error?: string };
type PathNode = { labels: string[]; properties: Record<string, unknown> };
type GraphPath = { nodes?: PathNode[] };

type Impact = {
  graphPaths: { shortageToInventory: GraphPath; facilityToReview: GraphPath };
  productMatch: { status: string; rationale: string };
  syntheticFacilityItem: { id: string; name: string };
  syntheticInventory: {
    asOf: string; onHandQuantity: number; averageDailyUse: number; estimatedRunwayDays: number;
    formula: string; label: string;
  };
  syntheticService: { id: string; name: string };
  syntheticReview: { protocol: { id: string; name: string }; role: { id: string; name: string } };
};

type ImpactResponse = {
  caseId: string;
  notice: string;
  shortage: {
    id: string; sourceRecordId: string; genericName: string; status: string;
    availability: string; updateDate: string; dataOrigin: string;
  };
  provenance: {
    publicEvidence: { id: string; sourceUrl: string; retrievedAt: string; dataOrigin: string };
    syntheticEvidence: { id: string; dataOrigin: string; label: string };
  };
  impacts: Impact[];
};

type EvidenceBriefResponse = {
  summary: string;
  servicesToReview: string[];
  assumptionsUnknowns: string[];
  evidenceIds: string[];
  mode: "gemini" | "deterministic_fallback";
  fallbackReason?: string;
};

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(parsed)} IST`;
}

function pathNode(path: GraphPath, label: string) {
  return path.nodes?.find((node) => node.labels.includes(label));
}

function nodeText(node: PathNode | undefined, property: string) {
  const value = node?.properties[property];
  return typeof value === "string" ? value : undefined;
}

function StatusPill({ tone, children }: { tone: "public" | "synthetic" | "neutral" | "success"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function EvidenceStep({
  number, kind, title, detail, children,
}: {
  number: number;
  kind: "Public FDA fact" | "Reviewed mapping" | "Synthetic demo data";
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  const tone = kind === "Public FDA fact" ? "public" : kind === "Synthetic demo data" ? "synthetic" : "neutral";
  return (
    <li className="evidence-step">
      <div className="step-number" aria-hidden="true">{number}</div>
      <div className="step-content">
        <StatusPill tone={tone}>{kind}</StatusPill>
        <h3>{title}</h3>
        <p>{detail}</p>
        {children}
      </div>
    </li>
  );
}

function LoadingState() {
  return (
    <section className="loading-card" aria-live="polite" aria-busy="true">
      <div className="loading-mark" aria-hidden="true" />
      <div><h2>Tracing the connected evidence</h2><p>Loading the fixed FalkorDB impact path for the selected demo record…</p></div>
    </section>
  );
}

export default function ShortageBridgeDashboard() {
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState("What does this graph show and which synthetic services should a human review?");
  const [brief, setBrief] = useState<EvidenceBriefResponse | null>(null);
  const [briefState, setBriefState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [briefError, setBriefError] = useState("");

  const loadAnalysis = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const [healthResponse, impactResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/impact", { cache: "no-store" }),
      ]);
      const healthBody = await healthResponse.json() as HealthResponse;
      setHealth(healthBody);
      if (!impactResponse.ok) {
        const errorBody = await impactResponse.json() as { error?: string };
        setState("unavailable");
        setMessage(errorBody.error ?? "Impact analysis is unavailable right now.");
        return;
      }
      setData(await impactResponse.json() as ImpactResponse);
      setState("ready");
    } catch {
      setHealth(null);
      setState("error");
      setMessage("The app could not reach its server. Check the local app and FalkorDB services, then try again.");
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void loadAnalysis(); }, 0);
    return () => window.clearTimeout(initialRequest);
  }, [loadAnalysis]);

  const generateBrief = useCallback(async () => {
    setBriefState("loading");
    setBriefError("");
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) {
        const errorBody = await response.json() as { error?: string };
        throw new Error(errorBody.error ?? "The evidence brief could not be generated.");
      }
      setBrief(await response.json() as EvidenceBriefResponse);
      setBriefState("ready");
    } catch (error) {
      setBriefState("error");
      setBriefError(error instanceof Error ? error.message : "The evidence brief could not be generated.");
    }
  }, [question]);

  const primaryImpact = data?.impacts[0];
  const presentation = primaryImpact ? nodeText(pathNode(primaryImpact.graphPaths.shortageToInventory, "DrugPresentation"), "name") : undefined;

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="bridge-mark" aria-hidden="true">⌁</span> ShortageBridge</div>
          <h1>Trace shortage context.<br /><em>Keep the human in review.</em></h1>
          <p className="hero-summary">A graph-backed operational prototype that connects a public shortage record to clearly labeled, synthetic demo hospital evidence.</p>
        </div>
        <aside className="safety-note" aria-label="Prototype safety boundary">
          <StatusPill tone="neutral">Human review required</StatusPill>
          <p>Not clinical advice, a substitute recommendation, a live-stock feed, or an ordering system.</p>
        </aside>
      </header>

      <section className="control-bar" aria-label="Impact analysis controls">
        <div>
          <p className="section-kicker">Selected demo case</p>
          <strong>{data?.shortage.genericName ?? "Loading public shortage record…"}</strong>
          {data && <span className="case-id">{data.caseId}</span>}
        </div>
        <div className="control-actions">
          <span className={`connection ${health?.ok ? "connection-ok" : ""}`} aria-live="polite">
            <span className="connection-dot" aria-hidden="true" />
            {health?.ok ? "Graph connected" : state === "loading" ? "Checking graph" : "Graph status unavailable"}
          </span>
          <button type="button" className="refresh-button" onClick={() => void loadAnalysis()} disabled={state === "loading"}>
            {state === "loading" ? "Loading analysis…" : "Refresh analysis"}
          </button>
        </div>
      </section>

      {state === "loading" && <LoadingState />}

      {(state === "unavailable" || state === "error") && (
        <section className="unavailable-card" role="alert">
          <StatusPill tone="neutral">Analysis unavailable</StatusPill>
          <h2>We could not load the graph-backed impact path.</h2>
          <p>{message}</p>
          <button type="button" className="retry-button" onClick={() => void loadAnalysis()}>Try again</button>
        </section>
      )}

      {state === "ready" && data && primaryImpact && (
        <div className="dashboard-grid">
          {/* STEP 1: PUBLIC FDA SHORTAGE RECORD */}
          <section className="record-card surface-card public-boundary-card" aria-labelledby="record-heading">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Step 1 · Public FDA Shortage Record</p>
                <h2 id="record-heading">{data.shortage.genericName}</h2>
              </div>
              <StatusPill tone="public">openFDA public snapshot</StatusPill>
            </div>
            <dl className="record-facts">
              <div><dt>FDA status</dt><dd>{data.shortage.status}</dd></div>
              <div><dt>Availability field</dt><dd>{data.shortage.availability}</dd></div>
              <div><dt>FDA record update</dt><dd>{data.shortage.updateDate}</dd></div>
              <div><dt>Package NDC</dt><dd>{data.shortage.sourceRecordId}</dd></div>
            </dl>
            <div className="source-block">
              <div>
                <p className="section-kicker">Source & retrieval timestamp</p>
                <p>Retrieved {formatTimestamp(data.provenance.publicEvidence.retrievedAt)}</p>
              </div>
              <a href={data.provenance.publicEvidence.sourceUrl} target="_blank" rel="noreferrer">
                Open public openFDA source <span aria-hidden="true">↗</span>
              </a>
            </div>
          </section>

          <aside className="notice-card" aria-label="Important interpretation limit">
            <StatusPill tone="neutral">Safety Boundary</StatusPill>
            <p className="notice-title"><strong>Interpret carefully</strong></p>
            <p>{data.notice}</p>
          </aside>

          {/* STEP 2: FALKORDB CONNECTED EVIDENCE PATH */}
          <section className="path-card surface-card" aria-labelledby="path-heading">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Step 2 · FalkorDB Connected Evidence Path</p>
                <h2 id="path-heading">Multi-Hop Traversal: Public Shortage to Hospital Escalation</h2>
              </div>
              <span className="path-count">Fixed parameterized Cypher query · {data.impacts.length} services returned</span>
            </div>
            <ol className="evidence-path">
              <EvidenceStep
                number={1}
                kind="Public FDA fact"
                title={`ShortageRecord: ${data.shortage.genericName}`}
                detail={`Sourced from openFDA (package NDC ${data.shortage.sourceRecordId}). Status: ${data.shortage.status}; availability: ${data.shortage.availability}; updated ${data.shortage.updateDate}.`}
              />
              <EvidenceStep
                number={2}
                kind="Reviewed mapping"
                title={`DrugPresentation: ${presentation ?? "Matched drug presentation"}`}
                detail={primaryImpact.productMatch.rationale}
              >
                <p className="micro-copy">Relationship: <code>[:MATCHED_TO]</code> with status <strong>{primaryImpact.productMatch.status}</strong>. Explicit human review; does not assert local inventory availability.</p>
              </EvidenceStep>
              <EvidenceStep
                number={3}
                kind="Synthetic demo data"
                title={`FacilityProduct: ${primaryImpact.syntheticFacilityItem.name}`}
                detail="Fictional facility formulary item connected via [:HAS_ITEM] to Riverglen Demonstration Hospital."
              />
              <EvidenceStep
                number={4}
                kind="Synthetic demo data"
                title="InventorySnapshot: Illustrative stock data"
                detail={`Traversed via [:HAS_SNAPSHOT]. ${primaryImpact.syntheticInventory.onHandQuantity} synthetic units on hand; average daily consumption is ${primaryImpact.syntheticInventory.averageDailyUse} units per day.`}
              />
              <EvidenceStep
                number={5}
                kind="Synthetic demo data"
                title={`ServiceLine & Escalation: ${data.impacts.length} connected hospital services`}
                detail={`Traversed via [:USED_BY] to ${data.impacts.map((i) => i.syntheticService.name).join(" and ")}, following [:FOLLOWS] to ${primaryImpact.syntheticReview.protocol.name}, escalating via [:ESCALATE_TO] to ${primaryImpact.syntheticReview.role.name}.`}
              />
            </ol>
          </section>

          {/* STEP 3: SYNTHETIC HOSPITAL IMPACT & 4-DAY RUNWAY */}
          <section className="runway-card synthetic-boundary-card" aria-labelledby="runway-heading">
            <div>
              <StatusPill tone="synthetic">Synthetic demo data</StatusPill>
              <p className="section-kicker">Step 3A · Illustrative Stock Runway</p>
              <h2 id="runway-heading"><span>{primaryImpact.syntheticInventory.estimatedRunwayDays}</span> days</h2>
            </div>
            <div className="formula-block">
              <p>{primaryImpact.syntheticInventory.formula}</p>
              <strong>
                {primaryImpact.syntheticInventory.onHandQuantity} synthetic units ÷ {primaryImpact.syntheticInventory.averageDailyUse} synthetic units/day = {primaryImpact.syntheticInventory.estimatedRunwayDays} days
              </strong>
              <small>Snapshot timestamp: {primaryImpact.syntheticInventory.asOf}</small>
            </div>
            <p className="runway-limit">{primaryImpact.syntheticInventory.label}</p>
          </section>

          <section className="service-card surface-card synthetic-boundary-card" aria-labelledby="service-heading">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Step 3B · Connected Hospital Services</p>
                <h2 id="service-heading">Synthetic Services Sharing This Formulary Item</h2>
              </div>
              <StatusPill tone="synthetic">Synthetic Hospital Graph</StatusPill>
            </div>
            <p className="service-intro">FalkorDB traversed the graph to identify which hospital service lines rely on this synthetic item and their established escalation protocols:</p>
            <div className="service-grid">
              {data.impacts.map((impact) => (
                <article className="service-path" key={impact.syntheticService.id}>
                  <StatusPill tone="synthetic">Synthetic service</StatusPill>
                  <h3>{impact.syntheticService.name}</h3>
                  <div className="review-link">
                    <span aria-hidden="true">↳</span>
                    <p>Follows protocol: <strong>{impact.syntheticReview.protocol.name}</strong></p>
                  </div>
                  <div className="review-link">
                    <span aria-hidden="true">↳</span>
                    <p>Escalates review to: <strong>{impact.syntheticReview.role.name}</strong></p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* STEP 4: HUMAN REVIEW BRIEF */}
          <section className="brief-card surface-card" aria-labelledby="brief-heading">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Step 4 · Human Review Brief</p>
                <h2 id="brief-heading">Constrained Evidence Explainer (Gemini & Fallback)</h2>
              </div>
              <StatusPill tone="neutral">Explanatory layer only</StatusPill>
            </div>
            <p className="brief-intro">
              The server re-queries FalkorDB before each brief. Your question is analyzed with only the retrieved graph evidence—never credentials, patient records, or ungrounded assumptions.
            </p>
            <label className="question-label" htmlFor="brief-question">Question for the pharmacy operations review</label>
            <textarea
              id="brief-question"
              className="question-box"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={600}
              rows={3}
            />
            <div className="brief-controls">
              <span>{question.length}/600 characters</span>
              <button
                type="button"
                className="brief-button"
                onClick={() => void generateBrief()}
                disabled={briefState === "loading" || question.trim().length < 3}
              >
                {briefState === "loading" ? "Generating evidence brief…" : "Generate review brief"}
              </button>
            </div>
            {briefState === "error" && <p className="brief-error" role="alert">{briefError}</p>}
            {briefState === "ready" && brief && (
              <div className="brief-result" aria-live="polite">
                <div className="brief-result-heading">
                  <StatusPill tone={brief.mode === "gemini" ? "success" : "neutral"}>
                    {brief.mode === "gemini" ? "✓ Gemini 3.8 Flash evidence brief" : "Deterministic fallback"}
                  </StatusPill>
                  {brief.fallbackReason && <span className="fallback-note">{brief.fallbackReason}</span>}
                </div>
                <p className="brief-summary">{brief.summary}</p>
                <div className="brief-grid">
                  <div>
                    <h3>Services flagged for human review</h3>
                    <ul>
                      {brief.servicesToReview.map((service) => (
                        <li key={service}>{service} <span className="tag-synthetic">synthetic</span></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Assumptions and boundaries</h3>
                    <ul>
                      {brief.assumptionsUnknowns.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="brief-evidence">
                  <strong>Verified graph evidence IDs:</strong>
                  {brief.evidenceIds.map((id) => (
                    <code key={id}>{id}</code>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* PROVENANCE AND UNCERTAINTY FOOTER */}
          <section className="provenance-card" aria-labelledby="provenance-heading">
            <p className="section-kicker">Provenance and Safety Boundaries</p>
            <h2 id="provenance-heading">Data Origin Transparency</h2>
            <div className="provenance-grid">
              <div>
                <StatusPill tone="public">Public Source</StatusPill>
                <p><strong>{data.provenance.publicEvidence.id}</strong></p>
                <p>openFDA Drug Shortages snapshot retrieved at {formatTimestamp(data.provenance.publicEvidence.retrievedAt)}. Public listings track FDA manufacturer status, not local inventory stock.</p>
              </div>
              <div>
                <StatusPill tone="synthetic">Synthetic Hospital Context</StatusPill>
                <p><strong>{data.provenance.syntheticEvidence.id}</strong></p>
                <p>{data.provenance.syntheticEvidence.label}</p>
              </div>
              <div>
                <StatusPill tone="neutral">Reviewed Mapping</StatusPill>
                <p><strong>Explicit Demonstration Match</strong></p>
                <p>{primaryImpact.productMatch.rationale}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
