"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EvidenceGraph, { HOPS, type GraphPath, type PathNode } from "@/app/evidence-graph";
import { IMPACT_QUERY } from "@/lib/impact-query";

type HealthResponse = { ok: boolean; graphConnected: boolean; error?: string };

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

type SavedReviewActionResponse = {
  actionId: string;
  status: string;
  reviewedAt: string;
  syntheticLabel: string;
  linkedTo: { shortageRecordId: string; facilityProductId: string };
  citedEvidenceIds: string[];
  notice: string;
};

type EvidenceBriefResponse = {
  summary: string;
  servicesToReview: string[];
  assumptionsUnknowns: string[];
  evidenceIds: string[];
  mode: "gemini" | "deterministic_fallback";
  fallbackReason?: string;
};

const MAIN_QUESTION = "What does this affect?";
const DEFAULT_BRIEF_QUESTION = "What does this graph show and which synthetic services should a human review?";

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }).format(parsed)} IST`;
}

function pathNode(path: GraphPath, label: string): PathNode | undefined {
  return path.nodes?.find((node) => node.labels.includes(label));
}

function nodeText(node: PathNode | undefined, property: string) {
  const value = node?.properties[property];
  return typeof value === "string" ? value : undefined;
}

type IconName = "mark" | "external" | "shield";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    // Two nodes joined by an edge: the project's one visual mark.
    mark: <><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="7" r="3" /><path d="M8 15.5 16 8.5" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    shield: <><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Tag({ tone, children }: { tone: "public" | "synthetic" | "bridge" | "neutral" | "success"; children: React.ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function StoryHeading({ step, kicker, title, tag }: {
  step: number; kicker: string; title: string; tag?: React.ReactNode;
}) {
  return (
    <div className="story-heading">
      <span className="story-step" aria-hidden="true">{String(step).padStart(2, "0")}</span>
      <div className="story-heading-text">
        <p className="kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      {tag}
    </div>
  );
}

export default function ShortageBridgeDashboard() {
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [message, setMessage] = useState("");
  const [asked, setAsked] = useState(false);
  const [tracing, setTracing] = useState(false);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState(DEFAULT_BRIEF_QUESTION);
  const [brief, setBrief] = useState<EvidenceBriefResponse | null>(null);
  const [briefState, setBriefState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [briefError, setBriefError] = useState("");
  const [savedAction, setSavedAction] = useState<SavedReviewActionResponse | null>(null);
  const [actionState, setActionState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [actionError, setActionError] = useState("");
  const graphSection = useRef<HTMLElement>(null);

  const fetchImpact = useCallback(async () => {
    const started = performance.now();
    const response = await fetch("/api/impact", { cache: "no-store" });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) {
      const errorBody = await response.json() as { error?: string };
      throw Object.assign(new Error(errorBody.error ?? "Impact analysis is unavailable right now."), { unavailable: true });
    }
    return { body: await response.json() as ImpactResponse, elapsed };
  }, []);

  const loadAnalysis = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const healthResponse = await fetch("/api/health", { cache: "no-store" });
      setHealth(await healthResponse.json() as HealthResponse);
      const { body } = await fetchImpact();
      setData(body);
      setState("ready");
    } catch (error) {
      const unavailable = typeof error === "object" && error !== null && "unavailable" in error;
      setState(unavailable ? "unavailable" : "error");
      setMessage(unavailable && error instanceof Error
        ? error.message
        : "The app could not reach its server. Check the local app and FalkorDB services, then try again.");
    }
  }, [fetchImpact]);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void loadAnalysis(); }, 0);
    return () => window.clearTimeout(initialRequest);
  }, [loadAnalysis]);

  // Asking the question re-runs the FalkorDB traversal and starts the walkthrough at the public record.
  const askQuestion = useCallback(async () => {
    setTracing(true);
    try {
      const { body, elapsed } = await fetchImpact();
      setData(body);
      setQueryMs(elapsed);
      setStep(0);
      setAsked(true);
      window.setTimeout(() => graphSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (error) {
      setState("unavailable");
      setMessage(error instanceof Error ? error.message : "Impact analysis is unavailable right now.");
    } finally {
      setTracing(false);
    }
  }, [fetchImpact]);

  const generateBrief = useCallback(async () => {
    setBriefState("loading");
    setBriefError("");
    setSavedAction(null);
    setActionState("idle");
    setActionError("");
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

  // Writes a synthetic ReviewAction node in FalkorDB. The browser sends only a confirmation flag.
  const saveReviewAction = useCallback(async () => {
    setActionState("saving");
    setActionError("");
    try {
      const response = await fetch("/api/review-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!response.ok) {
        const errorBody = await response.json() as { error?: string };
        throw new Error(errorBody.error ?? "The demo review action could not be saved.");
      }
      setSavedAction(await response.json() as SavedReviewActionResponse);
      setActionState("saved");
    } catch (error) {
      setActionState("error");
      setActionError(error instanceof Error ? error.message : "The demo review action could not be saved.");
    }
  }, []);

  const primaryImpact = data?.impacts[0];
  const shortageNode = primaryImpact ? pathNode(primaryImpact.graphPaths.shortageToInventory, "ShortageRecord") : undefined;
  const presentation = nodeText(shortageNode, "presentation");
  const initialPosting = nodeText(shortageNode, "initial_posting_date");
  const allPaths = data?.impacts.flatMap((impact) => [impact.graphPaths.shortageToInventory, impact.graphPaths.facilityToReview]) ?? [];
  const nodeCount = new Set(allPaths.flatMap((path) => path.nodes?.map((node) => node.id) ?? [])).size;
  const edgeCount = new Set(allPaths.flatMap((path) => path.edges?.map((edge) => edge.id) ?? [])).size;
  const runway = primaryImpact?.syntheticInventory;
  const runwayDays = runway ? Math.max(0, Math.ceil(runway.estimatedRunwayDays)) : 0;
  const role = primaryImpact?.syntheticReview.role.name;

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="mark" /></span>
          <div>
            <strong>ShortageBridge</strong>
            <span>Drug-shortage impact, traced through FalkorDB</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="track-chip">Graph Hacks · Track 01</span>
          <span className={`status ${health?.ok ? "status-ok" : state === "loading" ? "" : "status-bad"}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {health?.ok ? "FalkorDB connected" : state === "loading" ? "Checking FalkorDB…" : "FalkorDB unavailable"}
          </span>
        </div>
      </header>

      <div className="safety-ribbon" role="note">
        <Icon name="shield" />
        <p>
          <strong>Prototype for human review.</strong> Not medical advice. No medication substitution. No real hospital stock.
          Hospital details are <span className="inline-synthetic">synthetic demo data</span>.
        </p>
      </div>

      <div className="legend" aria-label="Data origin legend">
        <span><i className="swatch swatch-public" /> Public FDA data</span>
        <span><i className="swatch swatch-bridge" /> Reviewed mapping</span>
        <span><i className="swatch swatch-synthetic" /> Synthetic demo data</span>
      </div>

      {state === "loading" && (
        <section className="panel loading" aria-live="polite" aria-busy="true">
          <div className="spinner" aria-hidden="true" />
          <div><h2>Loading the public shortage record</h2><p>Querying FalkorDB for the demo case…</p></div>
        </section>
      )}

      {(state === "unavailable" || state === "error") && (
        <section className="panel unavailable" role="alert">
          <Tag tone="neutral">Analysis unavailable</Tag>
          <h2>We could not load the graph-backed impact path.</h2>
          <p>{message}</p>
          <p className="muted">Start FalkorDB with <code>docker compose up -d falkordb</code>, seed it with <code>npm run seed</code>, then try again.</p>
          <button type="button" className="button button-primary" onClick={() => void loadAnalysis()}>Try again</button>
        </section>
      )}

      {state === "ready" && data && primaryImpact && runway && (
        <div className="story">
          {/* 1 — PUBLIC FDA ALERT */}
          <section className="panel panel-public" aria-labelledby="alert-heading">
            <StoryHeading step={1} kicker="The public alert" title="An FDA drug shortage record" tag={<Tag tone="public">Public FDA data</Tag>} />
            <div className="alert-grid">
              <div className="alert-main">
                <h3 id="alert-heading" className="drug-name">{data.shortage.genericName}</h3>
                {presentation && <p className="drug-presentation">{presentation}</p>}
                <dl className="facts">
                  <div><dt>FDA status</dt><dd>{data.shortage.status}</dd></div>
                  <div><dt>Availability field</dt><dd>{data.shortage.availability}</dd></div>
                  <div><dt>Record updated</dt><dd>{data.shortage.updateDate}</dd></div>
                  <div><dt>Package NDC</dt><dd className="mono">{data.shortage.sourceRecordId}</dd></div>
                  {initialPosting && <div><dt>First posted</dt><dd>{initialPosting}</dd></div>}
                </dl>
                <p className="source-line">
                  <a href={data.provenance.publicEvidence.sourceUrl} target="_blank" rel="noreferrer">
                    openFDA Drug Shortages API record <Icon name="external" />
                  </a>
                  <span>Snapshot retrieved {formatTimestamp(data.provenance.publicEvidence.retrievedAt)}</span>
                </p>
              </div>
              <aside className="why-matters">
                <h3>Why it matters</h3>
                <p>The FDA list tells a hospital <em>what</em> is short nationally. It cannot tell them which of their own services use the drug, how long their stock lasts, or who should review it.</p>
                <p className="muted">An FDA listing reflects manufacturer-reported status. It is not a stock feed for any hospital, pharmacy, or wholesaler.</p>
              </aside>
            </div>
          </section>

          {/* 2 — THE QUESTION */}
          <section className="panel question-panel" aria-labelledby="question-heading">
            <StoryHeading step={2} kicker="The question" title="The pharmacy lead asks one thing" />
            <div className="question-row">
              <p id="question-heading" className="big-question">“{MAIN_QUESTION}”</p>
              <button type="button" className="button button-primary button-large" onClick={() => void askQuestion()} disabled={tracing}>
                {tracing ? "Traversing the graph…" : asked ? "Run the traversal again" : "Ask the graph"}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
            <p className="muted question-note">
              Clicking runs one fixed, parameterized Cypher query in FalkorDB. It follows six relationships from the public record to the synthetic demo hospital.
            </p>
          </section>

          {!asked && (
            <p className="awaiting">The evidence path, synthetic impact and review brief appear here after you ask the question.</p>
          )}

          {asked && (
            <>
              {/* 3 — FALKORDB EVIDENCE PATH */}
              <section ref={graphSection} className="panel panel-graph" aria-labelledby="graph-heading">
                <StoryHeading step={3} kicker="The evidence path" title="How FalkorDB connects the alert to the hospital" />
                <p id="graph-heading" className="graph-stats">
                  <span><strong>{nodeCount}</strong> nodes</span>
                  <span><strong>{edgeCount}</strong> relationships</span>
                  <span><strong>{HOPS.length}</strong> hops</span>
                  <span><strong>{data.impacts.length}</strong> result rows</span>
                  {queryMs !== null && <span>answered in <strong>{queryMs} ms</strong> <small>(browser round trip)</small></span>}
                </p>
                <EvidenceGraph paths={allPaths} step={step} onStep={(next) => setStep(Math.max(0, Math.min(HOPS.length, next)))} />
                <details className="cypher">
                  <summary>Show the Cypher query FalkorDB runs</summary>
                  <pre><code>{IMPACT_QUERY.trim()}</code></pre>
                  <p className="muted">Only <code>$caseId</code> is a parameter. The query text never includes browser input, and it runs as read-only (<code>roQuery</code>).</p>
                </details>
              </section>

              {/* 4 — SYNTHETIC HOSPITAL IMPACT */}
              <section className="panel panel-synthetic" aria-labelledby="impact-heading">
                <div className="synthetic-band">Synthetic demo data · fictional hospital · not real stock</div>
                <StoryHeading step={4} kicker="The impact (synthetic)" title="What it would affect at the demo hospital" tag={<Tag tone="synthetic">Synthetic demo data</Tag>} />
                <div className="impact-grid">
                  <div className="runway">
                    <p className="kicker">Illustrative stock runway</p>
                    <p className="runway-value" id="impact-heading">
                      {runway.estimatedRunwayDays}<span> days</span>
                    </p>
                    <div className="runway-strip" aria-hidden="true">
                      {Array.from({ length: Math.max(runwayDays, 1) + 2 }, (_, index) => (
                        <span key={index} className={index < runwayDays ? "day day-covered" : "day day-empty"}>Day {index + 1}</span>
                      ))}
                    </div>
                    <p className="runway-formula">
                      <span className="mono">{runway.onHandQuantity}</span> units on hand ÷ <span className="mono">{runway.averageDailyUse}</span> units used per day = <strong>{runway.estimatedRunwayDays} days</strong>
                    </p>
                    <p className="muted small">Calculated inside the Cypher query from the synthetic snapshot dated {runway.asOf.slice(0, 10)}. {runway.label}</p>
                  </div>
                  <div className="services">
                    <p className="kicker">Affected services ({data.impacts.length})</p>
                    <ul className="service-list">
                      {data.impacts.map((impact) => (
                        <li key={impact.syntheticService.id} className="service">
                          <div className="service-name">
                            <strong>{impact.syntheticService.name}</strong>
                            <Tag tone="synthetic">Synthetic</Tag>
                          </div>
                          <p><span className="rel">FOLLOWS</span> {impact.syntheticReview.protocol.name}</p>
                          <p><span className="rel">ESCALATE_TO</span> {impact.syntheticReview.role.name}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* 5 — HUMAN REVIEW BRIEF */}
              <section className="panel panel-brief" aria-labelledby="brief-heading">
                <StoryHeading step={5} kicker="The human review" title="A brief for the person who decides" tag={<Tag tone="neutral">Explains only, never acts</Tag>} />
                <div className="brief-layout">
                  <div className="brief-main">
                    <label className="field-label" htmlFor="brief-question">Question for the review brief</label>
                    <textarea
                      id="brief-question"
                      className="question-box"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      maxLength={600}
                      rows={2}
                    />
                    <div className="brief-controls">
                      <span className="muted small">{question.length}/600 · the server re-queries FalkorDB before writing the brief</span>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void generateBrief()}
                        disabled={briefState === "loading" || question.trim().length < 3}
                      >
                        {briefState === "loading" ? "Writing brief…" : brief ? "Regenerate brief" : "Generate review brief"}
                      </button>
                    </div>

                    {briefState === "error" && <p className="brief-error" role="alert">{briefError}</p>}

                    {briefState === "ready" && brief && (
                      <article className="brief" aria-live="polite">
                        <header className="brief-header">
                          <Tag tone={brief.mode === "gemini" ? "success" : "neutral"}>
                            {brief.mode === "gemini" ? "Written by Gemini 3.8 Flash from graph facts" : "Deterministic fallback (no AI)"}
                          </Tag>
                          {brief.fallbackReason && <span className="muted small">{brief.fallbackReason}</span>}
                        </header>
                        <p className="brief-summary">{brief.summary}</p>
                        <div className="brief-columns">
                          <div>
                            <h3>Services to review</h3>
                            <ul>
                              {brief.servicesToReview.map((service) => (
                                <li key={service}>{service} <Tag tone="synthetic">Synthetic</Tag></li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h3>Assumptions and unknowns</h3>
                            <ul>
                              {brief.assumptionsUnknowns.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        </div>
                        <p className="evidence-ids">
                          <span>Cites graph evidence:</span>
                          {brief.evidenceIds.map((id) => <code key={id}>{id}</code>)}
                        </p>

                        {actionState !== "saved" && (
                          <div className="review-action">
                            <div>
                              <strong>Human review step</strong>
                              <p>{role ? `The ${role}` : "The reviewer"} reads the evidence and marks the operational review complete. This writes a synthetic record to FalkorDB. Nothing is ordered, prescribed, or sent.</p>
                            </div>
                            <button
                              type="button"
                              className="button button-success"
                              onClick={() => void saveReviewAction()}
                              disabled={actionState === "saving"}
                            >
                              {actionState === "saving" ? "Saving to FalkorDB…" : "Mark review complete"}
                            </button>
                          </div>
                        )}
                        {actionState === "error" && (
                          <p className="brief-error" role="alert">
                            {actionError} <button type="button" className="link-button" onClick={() => void saveReviewAction()}>Try again</button>
                          </p>
                        )}
                      </article>
                    )}
                  </div>

                  <aside className="limits">
                    <h3>What this brief will not do</h3>
                    <ul>
                      <li>Give medical advice or make clinical decisions</li>
                      <li>Recommend a substitute medication</li>
                      <li>Claim to know real hospital stock</li>
                      <li>Place orders or change any data</li>
                    </ul>
                    <h3>How Gemini is constrained</h3>
                    <ul>
                      <li>It never connects to FalkorDB or writes Cypher</li>
                      <li>It only sees facts the server just read from the graph</li>
                      <li>It may only name services and evidence IDs FalkorDB returned</li>
                      <li>If it is unavailable or breaks a rule, a deterministic brief is used instead</li>
                    </ul>
                  </aside>
                </div>
              </section>
            </>
          )}

          {/* 6 — THE GRAPH WRITE */}
          {actionState === "saved" && savedAction && (
            <section className="panel panel-action" aria-labelledby="action-heading" aria-live="polite">
              <div className="synthetic-band">Synthetic demo record · human-triggered · not a clinical decision</div>
              <StoryHeading step={6} kicker="The review record" title="Demo review action saved in FalkorDB" tag={<Tag tone="success">Written to the graph</Tag>} />
              <p className="action-intro">
                A person confirmed the review, so the server wrote one <code>ReviewAction</code> node back into the same graph and linked it to the evidence it was based on. The traversal is now a closed loop: public alert → synthetic impact → human decision.
              </p>
              <dl className="facts action-facts">
                <div><dt>Action ID</dt><dd className="mono">{savedAction.actionId}</dd></div>
                <div><dt>Status</dt><dd className="mono">{savedAction.status}</dd></div>
                <div><dt>Saved at</dt><dd>{formatTimestamp(savedAction.reviewedAt)}</dd></div>
              </dl>
              <ul className="action-links">
                <li><span className="rel">BASED_ON</span> <code>{savedAction.linkedTo.shortageRecordId}</code></li>
                <li><span className="rel">BASED_ON</span> <code>{savedAction.linkedTo.facilityProductId}</code></li>
                {savedAction.citedEvidenceIds.map((id) => (
                  <li key={id}><span className="rel">CITES</span> <code>{id}</code></li>
                ))}
              </ul>
              <p className="muted small">{savedAction.syntheticLabel}</p>
            </section>
          )}

          {/* PROVENANCE */}
          <footer className="provenance" aria-label="Provenance">
            <div>
              <Tag tone="public">Public source</Tag>
              <p><code>{data.provenance.publicEvidence.id}</code></p>
              <p>openFDA snapshot retrieved {formatTimestamp(data.provenance.publicEvidence.retrievedAt)}. Not for medical decisions.</p>
            </div>
            <div>
              <Tag tone="bridge">Reviewed mapping</Tag>
              <p><code>MATCHED_TO · {primaryImpact.productMatch.status}</code></p>
              <p>{primaryImpact.productMatch.rationale}</p>
            </div>
            <div>
              <Tag tone="synthetic">Synthetic context</Tag>
              <p><code>{data.provenance.syntheticEvidence.id}</code></p>
              <p>{data.provenance.syntheticEvidence.label}</p>
            </div>
          </footer>
        </div>
      )}
    </main>
  );
}
