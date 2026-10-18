"use client";

export type PathNode = { id: number; labels: string[]; properties: Record<string, unknown> };
export type PathEdge = {
  id: number;
  sourceId: number;
  destinationId: number;
  relationshipType: string;
  properties: Record<string, unknown>;
};
export type GraphPath = { nodes?: PathNode[]; edges?: PathEdge[] };

type Origin = "public" | "bridge" | "synthetic";

// The order FalkorDB walks the fixed impact query. Step 0 is the start node.
export const HOPS = ["REPORTS_ON", "MATCHED_TO", "HAS_SNAPSHOT", "USED_BY", "FOLLOWS", "ESCALATE_TO"] as const;

// Five columns keep the graph near 1:1 scale on a laptop screen. The inventory snapshot
// sits above its formulary item, and the response role sits below the protocol.
const LABEL_LAYOUT: Record<string, { column: number; revealAt: number }> = {
  ShortageRecord: { column: 0, revealAt: 0 },
  DrugPresentation: { column: 1, revealAt: 1 },
  FacilityProduct: { column: 2, revealAt: 2 },
  InventorySnapshot: { column: 2, revealAt: 3 },
  ServiceLine: { column: 3, revealAt: 4 },
  Protocol: { column: 4, revealAt: 5 },
  ResponseRole: { column: 4, revealAt: 6 },
};

// SVG units; the canvas scales to fit its container.
const NODE_W = 172;
const NODE_H = 116;
const COLUMN_STRIDE = 260;
const ROW_PITCH = NODE_H + 56;
const SERVICE_PITCH = NODE_H + 20;
const PAD = 10;
const TOP = 12;

function text(node: PathNode | undefined, key: string) {
  const value = node?.properties[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function labelOf(node: PathNode) {
  return node.labels.find((label) => label in LABEL_LAYOUT) ?? node.labels[0] ?? "Node";
}

function originOf(node: PathNode): Origin {
  return node.properties.data_origin === "openfda" ? "public" : "synthetic";
}

function edgeOrigin(edge: PathEdge): Origin {
  if (edge.relationshipType === "REPORTS_ON") return "public";
  if (edge.relationshipType === "MATCHED_TO") return "bridge";
  return "synthetic";
}

function displayName(node: PathNode) {
  switch (labelOf(node)) {
    case "ShortageRecord":
      return text(node, "generic_name");
    case "DrugPresentation":
      return `NDC ${text(node, "package_ndc")}`;
    case "FacilityProduct":
      return text(node, "name").replace(/^Demo formulary item:\s*/, "Formulary: ");
    case "InventorySnapshot":
      return `${text(node, "on_hand_quantity")} units on hand`;
    default:
      return text(node, "name");
  }
}

function detailLine(node: PathNode) {
  switch (labelOf(node)) {
    case "ShortageRecord":
      return `Status: ${text(node, "status")}`;
    case "DrugPresentation":
      return text(node, "name").match(/\d+\s*mg\/\d+\s*mL/)?.[0] ?? "Drug presentation";
    case "InventorySnapshot":
      return `${text(node, "average_daily_use")} used/day`;
    default:
      return "";
  }
}

function collect(paths: GraphPath[]) {
  const nodes = new Map<number, PathNode>();
  const edges = new Map<number, PathEdge>();
  for (const path of paths) {
    path.nodes?.forEach((node) => nodes.set(node.id, node));
    path.edges?.forEach((edge) => edges.set(edge.id, edge));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function layout(nodes: PathNode[]) {
  const spineY = TOP + ROW_PITCH + NODE_H / 2;
  const services = nodes.filter((node) => labelOf(node) === "ServiceLine");
  const counters = new Map<string, number>();
  const positions = new Map<number, { x: number; y: number; column: number }>();

  for (const node of nodes) {
    const label = labelOf(node);
    const column = LABEL_LAYOUT[label]?.column ?? 4;
    const index = counters.get(label) ?? 0;
    counters.set(label, index + 1);
    let y = spineY;
    if (label === "InventorySnapshot" || label === "Protocol") y = spineY - ROW_PITCH - index * ROW_PITCH;
    if (label === "ServiceLine") y = spineY + (services.indexOf(node) - (services.length - 1) / 2) * SERVICE_PITCH;
    if (label === "ResponseRole") y = spineY + index * ROW_PITCH;
    positions.set(node.id, { x: PAD + column * COLUMN_STRIDE, y: y - NODE_H / 2, column });
  }

  const ys = [...positions.values()].map((p) => p.y);
  const shift = TOP - Math.min(...ys);
  positions.forEach((p) => { p.y += shift; });
  const height = Math.max(...ys) + shift + NODE_H + TOP;
  const width = PAD * 2 + 4 * COLUMN_STRIDE + NODE_W;
  return { positions, width, height };
}

// Left-to-right edges join the node sides; edges within one column run vertically.
function edgeGeometry(from: { x: number; y: number; column: number }, to: { x: number; y: number; column: number }) {
  if (from.column !== to.column) {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x - 3;
    const y2 = to.y + NODE_H / 2;
    const dx = (x2 - x1) / 2;
    return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
  }
  const x = from.x + NODE_W / 2;
  const up = to.y < from.y;
  const y1 = up ? from.y : from.y + NODE_H;
  const y2 = up ? to.y + NODE_H + 3 : to.y - 3;
  return { d: `M${x},${y1} L${x},${y2}`, midX: x, midY: (y1 + y2) / 2 };
}

function hopCaption(step: number, nodes: PathNode[]) {
  const byLabel = (label: string) => nodes.filter((node) => labelOf(node) === label);
  const shortage = byLabel("ShortageRecord")[0];
  const presentation = byLabel("DrugPresentation")[0];
  const inventory = byLabel("InventorySnapshot")[0];
  const services = byLabel("ServiceLine").map((node) => text(node, "name"));
  const protocol = byLabel("Protocol")[0];
  const role = byLabel("ResponseRole")[0];

  const captions = [
    {
      title: "Start node: the public FDA ShortageRecord",
      body: `FalkorDB starts from the openFDA record for ${text(shortage, "generic_name")}, looked up by its ID as a query parameter.`,
      origin: "public" as Origin,
    },
    {
      title: "REPORTS_ON → the exact drug presentation",
      body: `The FDA record reports on one specific package: NDC ${text(presentation, "package_ndc")}. Still public FDA data.`,
      origin: "public" as Origin,
    },
    {
      title: "MATCHED_TO → the demo hospital's formulary item",
      body: "This is the bridge from public to synthetic data. A reviewed mapping links the FDA package to a synthetic formulary item. It does not claim any real hospital has stock.",
      origin: "bridge" as Origin,
    },
    {
      title: "HAS_SNAPSHOT → a synthetic inventory snapshot",
      body: `The synthetic item has ${text(inventory, "on_hand_quantity")} units on hand and uses ${text(inventory, "average_daily_use")} per day. These numbers are made up for the demo.`,
      origin: "synthetic" as Origin,
    },
    {
      title: `USED_BY → ${services.length} services that depend on it`,
      body: `${services.join(" and ")} use this item. This is the answer to “What does this affect?”, read from the graph, not written by hand.`,
      origin: "synthetic" as Origin,
    },
    {
      title: "FOLLOWS → the review protocol",
      body: `Each service follows “${text(protocol, "name")}”, an example operational protocol, not a clinical one.`,
      origin: "synthetic" as Origin,
    },
    {
      title: "ESCALATE_TO → the human who reviews it",
      body: `The protocol escalates to the ${text(role, "name")}. That person receives the review brief below and decides what happens next.`,
      origin: "synthetic" as Origin,
    },
  ];
  return captions[step];
}

const RAIL_ENDPOINTS: Record<(typeof HOPS)[number], [string, string]> = {
  REPORTS_ON: ["ShortageRecord", "DrugPresentation"],
  MATCHED_TO: ["DrugPresentation", "FacilityProduct"],
  HAS_SNAPSHOT: ["FacilityProduct", "InventorySnapshot"],
  USED_BY: ["FacilityProduct", "ServiceLine"],
  FOLLOWS: ["ServiceLine", "Protocol"],
  ESCALATE_TO: ["Protocol", "ResponseRole"],
};

export default function EvidenceGraph({
  paths,
  step,
  onStep,
}: {
  paths: GraphPath[];
  step: number;
  onStep: (step: number) => void;
}) {
  const { nodes, edges } = collect(paths);
  const { positions, width, height } = layout(nodes);
  const caption = hopCaption(step, nodes);
  const complete = step >= HOPS.length;

  return (
    <div className="graph-wrap">
      <div className="graph-canvas" role="img" aria-label={`FalkorDB evidence path with ${nodes.length} nodes and ${edges.length} relationships`}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            {(["public", "bridge", "synthetic"] as Origin[]).map((origin) => (
              <marker key={origin} id={`arrow-${origin}`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={`arrow arrow-${origin}`} />
              </marker>
            ))}
          </defs>

          {edges.map((edge) => {
            const from = positions.get(edge.sourceId);
            const to = positions.get(edge.destinationId);
            if (!from || !to) return null;
            const hop = HOPS.indexOf(edge.relationshipType as (typeof HOPS)[number]) + 1;
            const origin = edgeOrigin(edge);
            const { d, midX, midY } = edgeGeometry(from, to);
            const labelWidth = edge.relationshipType.length * 7 + 16;
            const state = hop > step ? "pending" : hop === step ? "active" : "done";
            return (
              <g key={edge.id} className={`edge edge-${origin} edge-${state}`}>
                <path d={d} markerEnd={`url(#arrow-${origin})`} />
                <rect x={midX - labelWidth / 2} y={midY - 11} width={labelWidth} height={22} rx={11} />
                <text x={midX} y={midY + 4} textAnchor="middle">{edge.relationshipType}</text>
              </g>
            );
          })}

          {nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const label = labelOf(node);
            const revealAt = LABEL_LAYOUT[label]?.revealAt ?? 0;
            const state = revealAt > step ? "pending" : revealAt === step ? "active" : "done";
            return (
              <foreignObject key={node.id} x={position.x} y={position.y} width={NODE_W} height={NODE_H}>
                <div className={`node node-${originOf(node)} node-${state}`}>
                  <span className="node-label">{label}</span>
                  <strong className="node-name">{displayName(node)}</strong>
                  <span className="node-bottom">
                    <span className="node-detail">{detailLine(node)}</span>
                    <span className="node-origin">{originOf(node) === "public" ? "FDA" : "Synthetic"}</span>
                  </span>
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      <div className={`hop-caption hop-caption-${caption.origin}`} aria-live="polite">
        <span className="hop-count">{step === 0 ? "Start" : `Hop ${step} of ${HOPS.length}`}</span>
        <div>
          <strong>{caption.title}</strong>
          <p>{caption.body}</p>
        </div>
      </div>

      <div className="graph-controls">
        <button type="button" className="button button-ghost" onClick={() => onStep(0)} disabled={step === 0}>
          Restart path
        </button>
        <button type="button" className="button button-ghost" onClick={() => onStep(HOPS.length)} disabled={complete}>
          Show full path
        </button>
        <button type="button" className="button button-primary" onClick={() => onStep(step + 1)} disabled={complete}>
          {complete ? "Path complete" : "Next connection"} <span aria-hidden="true">→</span>
        </button>
      </div>

      <ol className="hop-rail">
        {HOPS.map((hop, index) => {
          const number = index + 1;
          const [from, to] = RAIL_ENDPOINTS[hop];
          const origin: Origin = hop === "REPORTS_ON" ? "public" : hop === "MATCHED_TO" ? "bridge" : "synthetic";
          return (
            <li key={hop}>
              <button
                type="button"
                className={`hop hop-${origin} ${number === step ? "hop-active" : number < step ? "hop-done" : ""}`}
                onClick={() => onStep(number)}
                aria-current={number === step ? "step" : undefined}
              >
                <span className="hop-number">{number}</span>
                <span className="hop-text">
                  <code>{hop}</code>
                  <small>{from} → {to}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
