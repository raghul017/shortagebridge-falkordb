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

> **Safety boundary:** ShortageBridge is an operational demonstration, **not** a clinical decision tool. It does not recommend drug substitutions, make medical decisions, or place supplier orders. All hospital facilities, formulary items, inventory numbers, service lines, and roles are explicitly labeled `synthetic_demo`.

---

## 2. Prerequisites & What Docker Desktop does

### Prerequisites
- **Node.js**: v20 or v22+
- **Docker Desktop**: Installed and running on your computer.

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
> **Note on GEMINI_API_KEY:** `.env.local` contains default connection settings for local FalkorDB (`127.0.0.1:6379`). Adding a `GEMINI_API_KEY` from Google AI Studio is optional. If left blank or if quota is reached, the app automatically uses its built-in deterministic fallback brief.

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

You will see the interactive dashboard showing the public shortage record, the FalkorDB evidence path, the 4-day illustrative runway, connected services, and the AI review brief.

---

## 4. How to stop the project safely

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

## 5. Verifying the API endpoints

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

---

## 6. Inspecting the local FalkorDB graph in the terminal

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

## 7. Graph model and schema

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
```

### Node labels & data origin

| Node Label | What it represents | Data Origin |
| :--- | :--- | :--- |
| `ShortageRecord` | Public shortage notice and status/dates | openFDA Drug Shortages API |
| `DrugPresentation` | Specific presentation, strength, and package NDC | openFDA Drug Shortages API |
| `Facility` | Fictional demonstration hospital (*Riverglen Demo Hospital*) | Synthetic demo data |
| `FacilityProduct` | Fictional hospital formulary item | Synthetic demo data |
| `InventorySnapshot` | Illustrative stock on hand (24 units) and consumption (6 units/day) | Synthetic demo data |
| `ServiceLine` | Fictional hospital units (*Example Acute Care*, *Example Procedure Suite*) | Synthetic demo data |
| `Protocol` | Sample operational review escalation procedure | Synthetic demo data |
| `ResponseRole` | Sample review role (*Example Pharmacy Operations Lead*) | Synthetic demo data |
| `EvidenceSource` | Provenance metadata for public source and synthetic demo declarations | Source-traced / Synthetic label |

---

## 8. Important Cypher query pattern

The central multi-hop Cypher query lives in [`lib/impact.ts`](./lib/impact.ts). It is fixed application code executed with parameters (`$caseId`), completely immune to Cypher injection:

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

## 9. Public vs. synthetic data boundary

- **Public Record:** Sourced from the [openFDA Drug Shortages API](https://api.fda.gov/drug/shortages.json?search=package_ndc%3A%220409-4776-01%22&limit=1) for package NDC `0409-4776-01` (`Lidocaine Hydrochloride Injection`). The seed records the exact retrieval timestamp, source update date, and source URL.
- **Reviewed Mapping:** The link between the public FDA presentation and the synthetic hospital item is explicitly tagged `reviewed_mapping` with a documented rationale. It does not imply that local stock exists.
- **Synthetic Hospital Data:** All facilities, quantities, burn rates, services, protocols, and roles are synthetic. Real hospital operational data is confidential and cannot be published. Every synthetic entity links to `EVIDENCE-SYNTHETIC-DEMO`.

---

## 10. Gemini explainer & deterministic fallback boundary

- **Server-Side Only:** Model interaction is handled strictly in server route handlers using the official `@google/genai` TypeScript SDK (`^2.30.0`) with `gemini-3.8-flash`.
- **Zero Client Trust:** Browser requests cannot submit facts to Gemini. The server re-runs the parameterized Cypher query in FalkorDB and passes only the returned evidence IDs and names.
- **Strict Grounding:** Structured output is enforced with a JSON schema. The model is forbidden from inventing service lines or citing evidence IDs not returned by the graph query.
- **Deterministic Fallback:** If `GEMINI_API_KEY` is omitted, or if network or free-tier quota limits occur, the endpoint automatically returns an identical schema populated directly from the graph facts with `mode: "deterministic_fallback"`. The app never crashes.

---

## 11. Hackathon disclosures & track fit

- **Track Alignment:** **Track 01: Agents That Act on Connected Data**. FalkorDB is central to the project, performing multi-hop traversals connecting external public shortage facts to internal operational workflows.
- **AI Coding Disclosure:** Google Antigravity IDE and Gemini were used as pair-programming assistants to scaffold TypeScript boilerplate, schema definitions, and UI styles. All architecture, graph schemas, Cypher queries, Zod safety validations, and provenance boundaries were designed and verified by the author.
- **Cloud / Vercel Note:** This project is submitted as a verified, reproducible local Docker application. Cloud hosting (e.g., Vercel) is optional and is not required for evaluating this submission.

---

## 12. Quick command cheat sheet

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
