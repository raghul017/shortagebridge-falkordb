# ShortageBridge

> **WeMakeDevs Graph Hacks (Track 01: Agents That Act on Connected Data)**  
> A graph-backed operational prototype that connects a **public drug-shortage record** to a **synthetic hospital data graph** in FalkorDB, calculating an illustrative stock runway and preparing an evidence-grounded brief for human pharmacy review.

---

## 1. What ShortageBridge does in plain English

When a critical drug appears on the FDA drug shortages list, hospital pharmacy leadership faces an urgent question: *“Could this shortage affect our hospital, which clinical services use it, and what internal protocol should we review?”*

Public shortage notices only list pharmaceutical manufacturer reports—they do not know any hospital’s live stock, service lines, or clinical workflows.

**ShortageBridge** bridges that gap using **FalkorDB**:
1. It ingests a timestamped snapshot of a public shortage record from the **openFDA Drug Shortages API**.
2. It executes a multi-hop traversal through a connected graph in **FalkorDB** to trace that shortage to an explicitly reviewed product match, a synthetic formulary item, an inventory snapshot, affected clinical service lines, and internal escalation protocols.
3. It computes an **illustrative stock runway** (synthetic on-hand quantity $\div$ synthetic average daily use = 4 days).
4. It feeds the verified graph evidence into **Google Gemini 3.8 Flash** (or a built-in deterministic fallback) to generate a structured, factual review brief for a human pharmacy operations lead.
5. When a human confirms the review, the server writes a clearly labeled synthetic **`ReviewAction`** node back into FalkorDB, linked to the exact records the review was based on. The graph is read *and* written by the workflow.

> **Safety boundary:** ShortageBridge is an operational demonstration, **not** a clinical decision tool. It does not recommend drug substitutions, make medical decisions, or place supplier orders. All hospital facilities, formulary items, inventory numbers, service lines, roles, and review records are explicitly labeled `synthetic_demo`.

---

## 2. Prerequisites & What Docker Desktop does

### Prerequisites
- **Node.js**: v20 or v22+
- **FalkorDB**: either **Docker Desktop** (for the local setup described in section 3) or a **hosted FalkorDB instance** (see [section 5](#5-deploying-with-a-hosted-falkordb-instance)). Sections 2–4 describe the local Docker route.

### Why Docker Desktop is required
**FalkorDB** is a high-performance graph database built on top of the Redis module ecosystem. Installing FalkorDB directly on macOS or Windows would require compiling native binaries and managing local services.

**Docker Desktop** solves this by running FalkorDB inside a lightweight, pre-configured Linux container:
- It downloads the official `falkordb/falkordb:latest` image.
- It runs the database engine in an isolated environment mapped to your computer's port `6379`.
- It saves graph data in a persistent Docker volume (`falkordb-data`) so your data survives container restarts.

You do **not** need to install Redis or FalkorDB on your host machine—Docker handles everything.

---

## 3. Step-by-step local startup commands

Open your terminal in the project directory (`/Users/raghular/Desktop/WeMakeDevs`):

### Step 1: Install Node.js dependencies
```bash
npm install
```

### Step 2: Configure environment variables
Copy the example environment file:
```bash
cp .env.example .env.local
```
> **Note:** `.env.example` contains default connection settings for local FalkorDB (`127.0.0.1:6379`). To use a hosted instance instead, set `FALKORDB_URL` as described in [section 5](#5-deploying-with-a-hosted-falkordb-instance).
>
> **Note on GEMINI_API_KEY:** adding a key from Google AI Studio is optional. If left blank or if quota is reached, the app automatically uses its built-in deterministic fallback brief.
>
> `.env.local` is gitignored and must never be committed.

### Step 3: Start the local FalkorDB graph database
```bash
docker compose up -d falkordb
```

### Step 4: Confirm FalkorDB is running and healthy
```bash
docker compose ps
```
You should see `wemakedevs-falkordb-1` with status `Up ... (healthy)` on port `0.0.0.0:6379->6379/tcp`.

### Step 5: Seed the demo graph
```bash
npm run seed
```
This runs `scripts/seed.ts`, populating FalkorDB with the public openFDA record snapshot, reviewed drug mapping, synthetic formulary item, synthetic inventory snapshot, and connected service review paths.

*Seeding is safe to run repeatedly:* It uses Cypher `MERGE`, meaning it creates or updates records without duplicating nodes or relationships.

### Step 6: Start the Next.js web application
```bash
npm run dev
```

### Step 7: Open the dashboard
Open your browser and navigate to:  
👉 **<http://localhost:3000>**

The page tells one story from top to bottom. See [section 4](#4-demo-flow-what-to-click) for the click-by-click flow.

---

## 4. Demo flow (what to click)

The home page follows one story. Blue, solid-bordered elements are **public FDA data**; violet, dashed-bordered elements are **synthetic demo data**; the slate dashed edge is the **reviewed mapping** between them.

1. **The public alert:** the openFDA shortage record for Lidocaine Hydrochloride Injection (package NDC `0409-4776-01`) with status, dates, source link, and retrieval timestamp, plus why a national notice can't answer local questions.
2. **The question:** *“What does this affect?”* Clicking **Ask the graph** runs the fixed Cypher query in FalkorDB.
3. **The evidence path:** a graph drawn from the node and edge objects FalkorDB returns. **Next connection** walks through the six hops one at a time (`REPORTS_ON → MATCHED_TO → HAS_SNAPSHOT → USED_BY → FOLLOWS → ESCALATE_TO`); **Show the Cypher query** reveals the exact query text.
4. **The synthetic impact:** a clearly labeled fictional hospital: an illustrative **4-day runway** (24 synthetic units ÷ 6 synthetic units/day, computed in Cypher) and the two affected synthetic services with their protocol and review role.
5. **The human review brief:** **Generate review brief** re-queries FalkorDB and produces a structured brief (Gemini, or the deterministic fallback), the evidence IDs it cites, and its limits.
6. **The review record:** **Mark review complete** posts to `/api/review-action`. The server writes one synthetic `ReviewAction` node into FalkorDB, linked by `BASED_ON` to the `ShortageRecord` and `FacilityProduct` and by `CITES` to the two `EvidenceSource` nodes, then the page shows the saved action ID and its links. It records that a person reviewed the evidence; it is not a clinical decision, an order, or any real-world action. If the write fails, the page says so and the brief above is unaffected.

**Proof that the graph does the work:** change one synthetic value in FalkorDB and re-run the question. The runway changes with no code change:

```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge \
  "MATCH (i:InventorySnapshot) SET i.on_hand_quantity = 12 RETURN i.on_hand_quantity"
# click "Run the traversal again": runway shows 2 days
npm run seed   # restores the original demo values (4 days)
```

**Proof that the review action is really stored.** After clicking **Mark review complete**, read it back:

```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge \
  "MATCH (a:ReviewAction)-[:BASED_ON]->(s:ShortageRecord) \
   MATCH (a)-[:BASED_ON]->(p:FacilityProduct) \
   RETURN a.id, a.status, a.reviewed_at, s.id, p.id \
   ORDER BY a.reviewed_at DESC LIMIT 1"
```

---

## 5. Deploying with a hosted FalkorDB instance

The same code runs locally or deployed. Only the connection settings change: instead of `FALKORDB_HOST`/`FALKORDB_PORT` pointing at local Docker, set `FALKORDB_URL` to a hosted FalkorDB instance.

### Environment variables

Set these in your hosting platform's environment settings (in Vercel: **Project → Settings → Environment Variables**). **Never commit real values**; `.env.local` and every other `.env*` file are gitignored, and only `.env.example` is tracked.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `FALKORDB_URL` | Yes (hosted) | Connection URL for the hosted instance, including host and port. Use the `falkors://` scheme if your instance requires TLS. |
| `FALKORDB_USERNAME` | If your instance requires auth | Database username. May be supplied separately rather than embedded in the URL. |
| `FALKORDB_PASSWORD` | If your instance requires auth | Database password. |
| `FALKORDB_GRAPH` | Recommended | Graph name. Defaults to `shortagebridge`. |
| `FALKORDB_TLS` | Optional | `true` or `false`. Defaults to `false`. |
| `GEMINI_API_KEY` | Optional | Enables the Gemini review brief. If omitted, the deterministic fallback is used and the UI labels which mode ran. |

`FALKORDB_HOST` and `FALKORDB_PORT` are the local-Docker alternative to `FALKORDB_URL`; they default to `127.0.0.1:6379` and can be left unset when `FALKORDB_URL` is provided. Blank values are treated as unset, so an empty optional variable will not break startup.

### Seeding the hosted graph

A deployment reads whatever is already in the hosted graph; it does not seed on boot. Seed once from your machine with `.env.local` pointing at the hosted instance:

```bash
npm run seed
```

`scripts/seed.ts` loads `.env.local` the same way Next.js does, so it targets whichever database those variables describe. Seeding uses `MERGE`, so it is safe to run again.

Verify the deployment once it is live:

```bash
curl -s https://<your-deployment-url>/api/health     # {"ok":true,"graphConnected":true}
```

> **Note on `output: "standalone"`:** [`next.config.ts`](./next.config.ts) sets this for the Docker image. It is kept because the Docker setup depends on it.

---

## 6. How to stop the project safely

When you are finished demonstrating or working:

1. **Stop Next.js:** Press `Ctrl + C` in the terminal where `npm run dev` is running.
2. **Stop FalkorDB:**
   ```bash
   docker compose stop falkordb
   ```
   *(Or run `docker compose down` to remove the container while keeping your data).*

### ⚠️ Warning: Do NOT run `docker compose down -v`
The `-v` flag stands for **volumes**. Running `docker compose down -v` permanently deletes the Docker volume (`falkordb-data`), wiping out your graph data. To preserve your seeded graph across restarts, always use `docker compose stop` or `docker compose down` without `-v`.

---

## 7. Verifying the API endpoints

You can verify all backend services directly using `curl` from a terminal:

### 1. Health check: `GET /api/health`
Confirms the Next.js server can execute a read-only Cypher query against FalkorDB.
```bash
curl -s http://localhost:3000/api/health
```
**Expected response:**
```json
{"ok":true,"graphConnected":true}
```

### 2. Multi-hop impact traversal: `GET /api/impact`
Runs the fixed parameterized Cypher query and returns the complete graph path objects, provenance, and illustrative runway calculation.
```bash
curl -s http://localhost:3000/api/impact
```
**Expected response:** HTTP 200 with JSON containing `caseId: "FDA-DRUGSHORTAGES-0409-4776-01"`, `shortage`, `provenance`, and `impacts` with graph paths and an illustrative 4-day runway.

### 3. Constrained review brief: `POST /api/brief`
Re-queries FalkorDB on the server, validates inputs with Zod, and generates a structured brief using Gemini 3.8 Flash (or deterministic fallback).
```bash
curl -s -X POST http://localhost:3000/api/brief \
  -H "Content-Type: application/json" \
  -d '{"question":"What does this graph show and which synthetic services should a human review?"}'
```
**Expected response:** HTTP 200 with JSON containing `summary`, `servicesToReview`, `assumptionsUnknowns`, `evidenceIds`, and `mode` (`"gemini"` or `"deterministic_fallback"`).

### 4. Human review action (graph write): `POST /api/review-action`
Writes a synthetic `ReviewAction` node to FalkorDB. The browser sends only a confirmation flag; the server re-reads the impact from the graph and writes only server-derived IDs.
```bash
curl -s -X POST http://localhost:3000/api/review-action \
  -H "Content-Type: application/json" \
  -d '{"confirmed":true}'
```
**Expected response:** HTTP 200 with JSON containing `actionId`, `status` (`"reviewed_by_human_demo"`), `reviewedAt`, `linkedTo`, and `citedEvidenceIds`. Any other request body is rejected with HTTP 400.

---

## 8. Inspecting the local FalkorDB graph in the terminal

The standard FalkorDB Docker container operates as a Redis-protocol database service on port 6379 (it does not run an HTTP browser interface). You can safely inspect all nodes, edges, and paths in your live database using `docker compose exec`:

### View node counts by label
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (n) RETURN labels(n)[0] AS Label, count(n) AS Count"
```

### View edge counts by relationship type
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (a)-[r]->(b) RETURN type(r) AS Edge, count(r) AS Count"
```

### Trace the exact shortage-to-inventory path
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge \
  "MATCH (s:ShortageRecord)-[:REPORTS_ON]->(d:DrugPresentation)-[m:MATCHED_TO]->(p:FacilityProduct)-[:HAS_SNAPSHOT]->(i:InventorySnapshot) \
   RETURN s.generic_name, d.name, p.name, i.on_hand_quantity, i.average_daily_use"
```

---

## 9. Graph model and schema

```text
EvidenceSource ──SUPPORTS─→ ShortageRecord ──REPORTS_ON─→ DrugPresentation
                                                              │
                                                   (reviewed) MATCHED_TO
                                                              │
                                                              ▼
Facility ───────────HAS_ITEM────────────────────────→ FacilityProduct ──HAS_SNAPSHOT─→ InventorySnapshot
                                                              │
                                                           USED_BY
                                                              │
                                                              ▼
                                                         ServiceLine ──FOLLOWS─→ Protocol ──ESCALATE_TO─→ ResponseRole

ReviewAction ──BASED_ON─→ ShortageRecord          (written when a human confirms the review)
ReviewAction ──BASED_ON─→ FacilityProduct
ReviewAction ──CITES───→ EvidenceSource
```

### Node labels & data origin

| Node Label | What it represents | Data Origin |
| :--- | :--- | :--- |
| `ShortageRecord` | Public shortage notice and status/dates | openFDA Drug Shortages API |
| `DrugPresentation` | Specific presentation, strength, and package NDC | openFDA Drug Shortages API |
| `Facility` | Fictional demonstration hospital (*Riverglen Demonstration Hospital*) | Synthetic demo data |
| `FacilityProduct` | Fictional hospital formulary item | Synthetic demo data |
| `InventorySnapshot` | Illustrative stock on hand (24 units) and consumption (6 units/day) | Synthetic demo data |
| `ServiceLine` | Fictional hospital units (*Example Acute Care Unit*, *Example Procedure Suite*) | Synthetic demo data |
| `Protocol` | Sample operational review escalation procedure | Synthetic demo data |
| `ResponseRole` | Sample review role (*Example pharmacy operations review role*) | Synthetic demo data |
| `ReviewAction` | A human's demo acknowledgement that the evidence was reviewed, with timestamp and status | Synthetic demo data (written at runtime) |
| `EvidenceSource` | Provenance metadata for public source and synthetic demo declarations | Source-traced / Synthetic label |

### What the impact query traverses

The impact query walks **six relationships**: `REPORTS_ON → MATCHED_TO → HAS_SNAPSHOT` and `USED_BY → FOLLOWS → ESCALATE_TO`. With the seed data that is 8 nodes and 8 distinct relationships, returned as 2 rows (one per affected service). `Facility -[:HAS_ITEM]->` and `EvidenceSource -[:SUPPORTS]->` record context and provenance; the query reads the two `EvidenceSource` nodes by ID to attach source URLs and timestamps.

Every node carries a `data_origin` property (`openfda` or `synthetic_demo`) and an `evidence_id`; the `MATCHED_TO` edge carries `data_origin: reviewed_mapping`, `status`, and `rationale`.

`ReviewAction` is the only node written while the app is running. It is created by the fixed query in [`lib/review-action.ts`](./lib/review-action.ts) and stores only an ID, `data_origin: synthetic_demo`, a status, an ISO timestamp, a review mode, the cited evidence IDs, and a synthetic label. It holds no personal information, no clinical content, and no real-world instruction.

---

## 10. Important Cypher queries

The central multi-hop Cypher query lives in [`lib/impact-query.ts`](./lib/impact-query.ts) and is executed by [`lib/impact.ts`](./lib/impact.ts) with FalkorDB's read-only `roQuery`. The query text is fixed application code; the only input is the `$caseId` parameter, which is validated against the single demo case before the query runs. Browser input never becomes Cypher. The UI shows this same text under **Show the Cypher query FalkorDB runs**.

It returns two path objects per affected service (`shortage_to_inventory_path`, `facility_to_review_path`). The UI draws the graph from those paths' nodes and edges, and the runway is computed inside the query:

```cypher
MATCH shortageToInventoryPath =
  (shortage:ShortageRecord {id: $caseId})-[:REPORTS_ON]->(presentation:DrugPresentation)-[match:MATCHED_TO]->(facilityProduct:FacilityProduct)-[:HAS_SNAPSHOT]->(snapshot:InventorySnapshot)
MATCH facilityToReviewPath =
  (facilityProduct)-[:USED_BY]->(service:ServiceLine)-[:FOLLOWS]->(protocol:Protocol)-[:ESCALATE_TO]->(role:ResponseRole)
MATCH (publicEvidence:EvidenceSource {id: shortage.evidence_id})
MATCH (syntheticEvidence:EvidenceSource {id: facilityProduct.evidence_id})
RETURN
  shortageToInventoryPath AS shortage_to_inventory_path,
  facilityToReviewPath AS facility_to_review_path,
  shortage.id AS shortage_id,
  shortage.source_record_id AS source_record_id,
  shortage.generic_name AS generic_name,
  shortage.status AS shortage_status,
  shortage.availability AS availability,
  shortage.update_date AS shortage_update_date,
  publicEvidence.source_url AS public_source_url,
  publicEvidence.retrieved_at AS public_retrieved_at,
  match.status AS match_status,
  match.rationale AS match_rationale,
  facilityProduct.id AS facility_product_id,
  facilityProduct.name AS facility_product_name,
  snapshot.as_of AS snapshot_as_of,
  snapshot.on_hand_quantity AS on_hand_quantity,
  snapshot.average_daily_use AS average_daily_use,
  round(snapshot.on_hand_quantity / snapshot.average_daily_use * 10) / 10 AS estimated_runway_days,
  service.id AS service_id,
  service.name AS service_name,
  protocol.id AS protocol_id,
  protocol.name AS protocol_name,
  role.id AS role_id,
  role.name AS role_name,
  syntheticEvidence.id AS synthetic_evidence_id
ORDER BY service.name
```

---

### The human review write query

When a person clicks **Mark review complete**, the server runs this fixed query from [`lib/review-action.ts`](./lib/review-action.ts). The browser sends only `{"confirmed": true}`; every value below arrives as a `$`-parameter derived on the server from a fresh read of the graph.

```cypher
MATCH (shortage:ShortageRecord {id: $caseId})
MATCH (facilityProduct:FacilityProduct {id: $facilityProductId})
MERGE (action:ReviewAction {id: $actionId})
SET action += {
  data_origin: 'synthetic_demo',
  status: $status,
  reviewed_at: $reviewedAt,
  review_mode: $reviewMode,
  synthetic_label: 'Synthetic demo review record — a human acknowledgement in this demo only. Not a clinical decision, order, or real-world action.',
  evidence_ids: $evidenceIds
}
MERGE (action)-[:BASED_ON]->(shortage)
MERGE (action)-[:BASED_ON]->(facilityProduct)
WITH action
MATCH (evidence:EvidenceSource) WHERE evidence.id IN $evidenceIds
MERGE (action)-[:CITES]->(evidence)
WITH action, count(evidence) AS citedEvidenceCount
RETURN
  action.id AS action_id,
  action.status AS status,
  action.reviewed_at AS reviewed_at,
  action.synthetic_label AS synthetic_label,
  citedEvidenceCount AS cited_evidence_count
```

Read the saved action back, with its links:

```cypher
MATCH (action:ReviewAction)-[:BASED_ON]->(shortage:ShortageRecord)
MATCH (action)-[:BASED_ON]->(facilityProduct:FacilityProduct)
RETURN
  action.id AS action_id,
  action.status AS status,
  action.reviewed_at AS reviewed_at,
  shortage.id AS shortage_id,
  facilityProduct.id AS facility_product_id
ORDER BY action.reviewed_at DESC
LIMIT 1
```

---

## 11. Public vs. synthetic data boundary

- **Public Record:** Sourced from the [openFDA Drug Shortages API](https://api.fda.gov/drug/shortages.json?search=package_ndc%3A%220409-4776-01%22&limit=1) for package NDC `0409-4776-01` (`Lidocaine Hydrochloride Injection`). The seed records the exact retrieval timestamp, source update date, and source URL.
- **Reviewed Mapping:** The link between the public FDA presentation and the synthetic hospital item is explicitly tagged `reviewed_mapping` with a documented rationale. It does not imply that local stock exists.
- **Synthetic Hospital Data:** All facilities, quantities, burn rates, services, protocols, and roles are synthetic. Real hospital operational data is confidential and cannot be published. Every synthetic entity links to `EVIDENCE-SYNTHETIC-DEMO`.

---

## 12. Gemini explainer & deterministic fallback boundary

- **Server-Side Only:** Model interaction is handled strictly in server route handlers using the official `@google/genai` TypeScript SDK (`^2.30.0`) with `gemini-3.8-flash`.
- **Zero Client Trust:** Browser requests cannot submit facts to Gemini. The server re-runs the parameterized Cypher query in FalkorDB and passes only the returned evidence IDs and names.
- **Strict Grounding:** Structured output is enforced with a JSON schema. The model is forbidden from inventing service lines or citing evidence IDs not returned by the graph query.
- **Deterministic Fallback:** If `GEMINI_API_KEY` is omitted, or if network or free-tier quota limits occur, the endpoint automatically returns an identical schema populated directly from the graph facts with `mode: "deterministic_fallback"`. The app never crashes.

---

## 13. Limitations

- **One demo case.** The app serves a single seeded shortage case (`FDA-DRUGSHORTAGES-0409-4776-01`); other case IDs are rejected with HTTP 400.
- **Snapshot, not live.** The openFDA fields are a seeded snapshot. `npm run seed` refreshes the retrieval timestamp but does not re-download the record.
- **Synthetic hospital.** The facility, inventory, usage rate, services, protocol, and role are fictional. The 4-day runway is an illustration, not a forecast.
- **Not a clinical tool.** No medical advice, no medication substitution, no ordering, no claim about any real hospital's stock.
- **The review record is a demo record.** **Mark review complete** writes a synthetic `ReviewAction` node to your local FalkorDB. It records only that a person acknowledged the evidence in this demo. It notifies nobody, changes no protocol, and places no order. Re-running `npm run seed` does not remove these nodes; clear them with `MATCH (a:ReviewAction) DETACH DELETE a` if you want a clean graph before recording.
- **Gemini is optional.** Without a key, or if the model fails validation, the brief uses the deterministic fallback.
- **Two supported setups.** The project runs against local FalkorDB in Docker, or against a hosted FalkorDB instance. Both use the same code; only the connection environment variables differ.

---

## 14. Hackathon disclosures & track fit

- **Track Alignment:** **Track 01: Agents That Act on Connected Data**. FalkorDB is central to the project, performing multi-hop traversals connecting external public shortage facts to internal operational workflows.
- **AI Coding Disclosure:**
  - **Google Antigravity IDE and Gemini** were used as pair-programming assistants to scaffold TypeScript boilerplate, schema definitions, and UI styles.
  - **Claude Code (Anthropic)** was used on submission day to redesign the dashboard UI (the story layout and the step-by-step graph view drawn from FalkorDB path objects), move the impact query into `lib/impact-query.ts` so the UI can display it, implement the `ReviewAction` graph write (`lib/review-action.ts` and `app/api/review-action/route.ts`), fix environment loading in `scripts/seed.ts`, and draft README and demo-guide updates.
  - The architecture, graph schema, Cypher queries, Zod safety validations, and provenance boundaries were designed by the author, who reviewed and tested all AI-assisted changes.
- **Runtime AI (separate from coding help):** the app optionally calls Gemini at runtime to word the review brief from graph facts (see section 12).
- **Deployment:** The project supports both a reproducible local Docker setup and deployment to a hosting platform such as Vercel. The live deployment connects to a **hosted FalkorDB instance** rather than a local container; see [section 5](#5-deploying-with-a-hosted-falkordb-instance). Either setup is sufficient to evaluate the submission.

---

## 15. Quick command cheat sheet

The `docker compose` commands below apply to the local setup. With a hosted instance, run graph queries from that provider's console instead; `npm run seed`, `npm run dev`, `npm run build`, and `npm run lint` work the same either way.

| Action | Command |
| :--- | :--- |
| **Start FalkorDB** | `docker compose up -d falkordb` |
| **Check Database Status** | `docker compose ps` |
| **Seed Graph** | `npm run seed` |
| **Start Web App** | `npm run dev` |
| **Build Production Bundle** | `npm run build` |
| **Lint Code** | `npm run lint` |
| **Stop Database Safely** | `docker compose stop falkordb` |
| **Inspect Graph** | `docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (n) RETURN labels(n)[0], count(n)"` |
| **Clear Demo Review Records** | `docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (a:ReviewAction) DETACH DELETE a"` |
