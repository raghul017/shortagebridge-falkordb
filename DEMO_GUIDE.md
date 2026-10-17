# ShortageBridge — Demo Guide & Submission Playbook

> **WeMakeDevs Graph Hacks (Track 01: Agents That Act on Connected Data)**  
> This guide provides everything needed to record the hackathon demo video and present ShortageBridge to judges with confidence.

---

## Table of Contents
1. [Word-for-Word Spoken Demo Script (2–3 Minutes)](#1-word-for-word-spoken-demo-script-23-minutes)
2. [Click-by-Click Navigation Guide for the App](#2-click-by-click-navigation-guide-for-the-app)
3. [Terminal Guide: Exact Startup & Verification Commands](#3-terminal-guide-exact-startup--verification-commands)
4. [Inspecting Graph Nodes & Edges in FalkorDB](#4-inspecting-graph-nodes--edges-in-falkordb)
5. [What to Say If Judges Ask (Q&A Cheat Sheet)](#5-what-to-say-if-judges-ask-qa-cheat-sheet)

---

## 1. Word-for-Word Spoken Demo Script (2–3 Minutes)

*Read this script aloud during your screen recording. Follow the bracketed visual cues.*

---

### [0:00 – 0:30] Introduction & Problem Statement
- **[On Screen: Browser at `http://localhost:3000`, showing top header and "Graph connected" status]**
- **Spoken Narration:**
  > "Hello everyone. This is **ShortageBridge**, built for Track 01 of the WeMakeDevs Graph Hacks hackathon.
  >
  > Hospital pharmacy leadership faces a severe, recurring challenge: when an essential medication enters shortage, public notices only tell us what manufacturer reported a problem. According to the American Society of Health-System Pharmacists, over 84% of surveyed hospitals report operational disruptions from shortages—leading to delayed procedures and canceled treatments.
  >
  > But a public FDA shortage alert doesn't tell a hospital *what internal services, clinical protocols, or local stock* are impacted. ShortageBridge uses **FalkorDB** to bridge public shortage notices to hospital operational workflows."

---

### [0:30 – 1:00] Step 1: Public FDA Shortage Record
- **[On Screen: Scroll down to Step 1 card: Public FDA Shortage Record]**
- **Spoken Narration:**
  > "First, our safety boundary: all hospital inventory, service lines, and protocols shown here are synthetic demonstration data. FDA data does not reflect local inventory.
  >
  > In Step 1, ShortageBridge ingests a timestamped snapshot directly from the **openFDA Drug Shortages API** for Lidocaine Hydrochloride Injection, package NDC `0409-4776-01`. As you can see, the status is Current and Available. We provide the exact retrieval timestamp and a direct link back to the public openFDA record."

---

### [1:00 – 1:35] Step 2: FalkorDB Connected Evidence Path
- **[On Screen: Scroll down to Step 2 card: FalkorDB Connected Evidence Path]**
- **Spoken Narration:**
  > "Instead of a flat table or a decorative picture, **FalkorDB** executes a parameterized, multi-hop Cypher traversal.
  >
  > Look at how the path connects:
  > - From the **Public Shortage Record**,
  > - It follows `[:REPORTS_ON]` to the **Drug Presentation**,
  > - Crosses an explicitly reviewed product mapping via `[:MATCHED_TO]` to our synthetic **Facility Product**,
  > - Follows `[:HAS_SNAPSHOT]` to our **Inventory Snapshot**,
  > - And branches via `[:USED_BY]` into affected hospital **Service Lines**, their review **Protocols**, and the escalated **Response Roles**.
  >
  > Every step is grounded in connected graph evidence."

---

### [1:35 – 2:05] Step 3: Synthetic Hospital Impact & 4-Day Runway
- **[On Screen: Scroll to Step 3A Runway Card and Step 3B Connected Services Card]**
- **Spoken Narration:**
  > "In Step 3, FalkorDB calculates an illustrative stock runway right in Cypher: 24 synthetic units on hand divided by an average daily use of 6 units per day yields an estimated **4 days of runway**.
  >
  > Looking at the connected hospital units, FalkorDB identifies the two clinical services sharing this formulary item: the **Example Acute Care Unit** and the **Example Procedure Suite**. Both services follow our shortage-review escalation protocol, routing the review to the Pharmacy Operations Review Role."

---

### [2:05 – 2:40] Step 4: Constrained Gemini Explainer & Fallback
- **[On Screen: Scroll to Step 4 card. Click 'Generate review brief']**
- **Spoken Narration:**
  > "Now, how does an AI agent help? In Step 4, the pharmacy lead asks: *'What does this graph show and which synthetic services should a human review?'*
  >
  > When I click **Generate review brief**, the server re-queries FalkorDB—we never trust graph facts from the browser. The server feeds only the retrieved graph evidence into **Google Gemini 3.8 Flash** using the official `@google/genai` SDK and strict JSON schema output.
  >
  > Notice the result: Gemini is strictly constrained. It can cite only the exact graph evidence IDs returned by FalkorDB, cannot generate arbitrary Cypher, and cannot make clinical substitute recommendations. And if an API key is missing or quota is exhausted, our built-in deterministic fallback produces the exact same structured brief."

---

### [2:40 – 2:55] Conclusion & Human-in-the-Loop Review
- **[On Screen: Scroll back to the top safety badge: Human review required]**
- **Spoken Narration:**
  > "ShortageBridge keeps the human firmly in the loop. It provides transparent provenance, explicit multi-hop graph paths, and actionable facts so pharmacy leadership can make safe, informed operational reviews.
  >
  > Powered by FalkorDB, Next.js, and Google Gemini. Thank you!"

---

## 2. Click-by-Click Navigation Guide for the App

Follow these exact browser actions during your recording:

| Action # | Target UI Element | What to Show / Emphasize |
| :--- | :--- | :--- |
| **1** | **Hero & Header** | Point out the subtitle *"Trace shortage context. Keep the human in review."* and the dark green **"Human review required"** safety note. |
| **2** | **Control Bar** | Highlight the green **"Graph connected"** pulse dot confirming live connection to FalkorDB on port 6379. |
| **3** | **Step 1 Card** | Point to the blue badge **"openFDA public snapshot"**, the NDC code `0409-4776-01`, and the retrieval timestamp. Hover over *"Open public openFDA source ↗"*. |
| **4** | **Step 2 Card** | Trace through the numbered steps 1 through 5: from Public ShortageRecord $\to$ DrugPresentation $\to$ FacilityProduct $\to$ InventorySnapshot $\to$ ServiceLines & Escalation. |
| **5** | **Step 3A Card** | Highlight the large **"4 days"** typography and the formula block (`24 units ÷ 6 units/day = 4 days`). |
| **6** | **Step 3B Card** | Show the two cards: **Example Acute Care Unit** and **Example Procedure Suite**, highlighting their protocol and escalation roles. |
| **7** | **Step 4 Card** | Show the textarea question. Click the **"Generate review brief"** button. |
| **8** | **Brief Result** | When the brief appears, point to the green badge **"✓ Gemini 3.8 Flash evidence brief"** (or deterministic fallback badge), the bulleted services to review, and the code pills showing **Verified graph evidence IDs** (`EVIDENCE-OPENFDA-0409-4776-01`, `EVIDENCE-SYNTHETIC-DEMO`). |
| **9** | **Footer Card** | Conclude by showing the 3-column Data Origin Transparency footer showing public evidence vs. synthetic evidence. |

---

## 3. Terminal Guide: Exact Startup & Verification Commands

If you want to record a terminal demonstration or prepare before your video:

### Terminal 1: Start Docker and Verify FalkorDB
```bash
# 1. Start FalkorDB container in the background
docker compose up -d falkordb

# 2. Verify container is healthy
docker compose ps
# Expected output: wemakedevs-falkordb-1 ... Up (healthy) ... 0.0.0.0:6379->6379/tcp

# 3. Seed the graph idempotently
npm run seed
# Expected output: Seeded FDA-DRUGSHORTAGES-0409-4776-01 idempotently at <timestamp>
```

### Terminal 2: Start the Next.js Web App
```bash
# Start the dev server
npm run dev
# Expected output: Ready in ~2.5s on http://localhost:3000
```

### Terminal 3: Test the Three Endpoints (Fast Proof for Judges)
```bash
# 1. Check health
curl -s http://localhost:3000/api/health
# Expected: {"ok":true,"graphConnected":true}

# 2. Check impact traversal and runway
curl -s http://localhost:3000/api/impact
# Expected: Full JSON payload with graph paths, 4-day runway, and 2 service lines

# 3. Check Gemini / Fallback brief
curl -s -X POST http://localhost:3000/api/brief \
  -H "Content-Type: application/json" \
  -d '{"question":"What does this graph show?"}'
# Expected: JSON response with summary, servicesToReview, and evidenceIds
```

---

## 4. Inspecting Graph Nodes & Edges in FalkorDB

*The local Docker container runs the FalkorDB engine on port 6379. Use these exact terminal commands to prove to judges that real graph data lives inside FalkorDB:*

### 1. Count all nodes by label
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (n) RETURN labels(n)[0] AS Label, count(n) AS Count"
```
**Output:**
```text
1) 1) "Label"
   2) "Count"
2) 1) 1) "ResponseRole"
      2) (integer) 1
   2) 1) "ShortageRecord"
      2) (integer) 1
   3) 1) "EvidenceSource"
      2) (integer) 2
   4) 1) "DrugPresentation"
      2) (integer) 1
   5) 1) "Facility"
      2) (integer) 1
   6) 1) "ServiceLine"
      2) (integer) 2
   7) 1) "FacilityProduct"
      2) (integer) 1
   8) 1) "Protocol"
      2) (integer) 1
   9) 1) "InventorySnapshot"
      2) (integer) 1
```

### 2. Count all edges by relationship type
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge "MATCH (a)-[r]->(b) RETURN type(r) AS Edge, count(r) AS Count"
```
**Output:**
```text
1) 1) "Edge"
   2) "Count"
2) 1) 1) "HAS_SNAPSHOT"
      2) (integer) 1
   2) 1) "REPORTS_ON"
      2) (integer) 1
   3) 1) "USED_BY"
      2) (integer) 2
   4) 1) "ESCALATE_TO"
      2) (integer) 1
   5) 1) "MATCHED_TO"
      2) (integer) 1
   6) 1) "HAS_ITEM"
      2) (integer) 1
   7) 1) "SUPPORTS"
      2) (integer) 9
   8) 1) "FOLLOWS"
      2) (integer) 2
```

### 3. Trace the multi-hop shortage path in one Cypher query
```bash
docker compose exec falkordb redis-cli GRAPH.QUERY shortagebridge \
  "MATCH (s:ShortageRecord)-[:REPORTS_ON]->(d:DrugPresentation)-[m:MATCHED_TO]->(p:FacilityProduct)-[:HAS_SNAPSHOT]->(i:InventorySnapshot) \
   RETURN s.generic_name, d.name, p.name, i.on_hand_quantity, i.average_daily_use"
```
**Output:**
```text
1) 1) "s.generic_name"
   2) "d.name"
   3) "p.name"
   4) "i.on_hand_quantity"
   5) "i.average_daily_use"
2) 1) 1) "Lidocaine Hydrochloride Injection"
      2) "Lidocaine Hydrochloride Preservative Free Injection 300 mg/20 mL"
      3) "Demo formulary item: Lidocaine PF 300 mg/20 mL"
      4) (integer) 24
      5) (integer) 6
```

---

## 5. What to Say If Judges Ask (Q&A Cheat Sheet)

### Q1: Why is FalkorDB central? Couldn't you do this in Postgres or a vector store?
> **Answer:**  
> "A drug shortage is fundamentally a connected-data problem. In a relational database, answering *'which clinical units, procedures, and escalation roles are impacted by this public shortage?'* requires joining 7 different tables across disparate domains (public regulatory records, hospital formulary, inventory snapshots, department allocations, and clinical review policies). In a vector database, embedding similarity cannot guarantee exact multi-hop relationship traversals or enforce strict data boundaries.
>
> FalkorDB executes this as a single native multi-hop graph traversal in Cypher in under 6 milliseconds. FalkorDB allows us to return the exact path objects and evidence IDs that ground the downstream AI brief."

---

### Q2: What data is real public data, and what is synthetic?
> **Answer:**  
> "We maintain an uncompromising boundary:
> 1. **Public FDA Data:** The shortage record for Lidocaine Hydrochloride Injection (package NDC `0409-4776-01`) is a factual, timestamped snapshot directly from the official **openFDA Drug Shortages API**.
> 2. **Synthetic Hospital Data:** Real hospital stock, formulary contracts, patient volumes, and internal staff roles are strictly confidential healthcare operational data. Therefore, all hospital data (Riverglen Demo Hospital, 24 units on hand, 6 units/day consumption, Acute Care, and Procedure Suite) is synthetic and explicitly labeled `synthetic_demo`."

---

### Q3: Why doesn't the app suggest clinical drug substitutes or place automated orders?
> **Answer:**  
> "This is by design and represents our core safety principle: **ShortageBridge is an operational review tool, not a clinical prescriber.**
> 
> Suggesting a pharmacological substitute is a high-risk medical decision that requires patient-specific clinical context (allergies, organ function, disease state) and therapeutic equivalence protocols. Furthermore, FDA shortage listings reflect manufacturer reports, not distributor or local hospital stock. Attempting to automate orders or clinical swaps from a public API would be reckless. ShortageBridge organizes connected facts so a licensed human pharmacist can make informed operational decisions."

---

### Q4: How is Gemini constrained? How do you prevent hallucinations or rogue Cypher execution?
> **Answer:**  
> "Gemini is purely an explanatory layer with five strict safeguards:
> 1. **No direct database access:** Gemini has no connection to FalkorDB and cannot write, modify, or execute Cypher.
> 2. **Server-side re-query:** Browser clients cannot feed context to the model. The server always re-queries FalkorDB directly.
> 3. **Strict JSON Schema:** We use `@google/genai` structured outputs with a rigid JSON schema.
> 4. **Evidence ID validation:** Zod validates that every cited `evidenceId` in the AI output exists in the returned FalkorDB graph result. If the model hallucinates an outside source or service, it is rejected.
> 5. **Deterministic fallback:** If Gemini is offline, the API key is omitted, or free-tier quotas expire, our deterministic algorithm generates the exact same structured brief directly from the graph facts."

---

### Q5: What does the 'human review action' mean in your workflow?
> **Answer:**  
> "In hospital operations, a pharmacy operations lead must review shortage notices, assess remaining runway, alert affected departments (like Acute Care and Surgical Suites), and decide whether to activate alternative conservation protocols.
> 
> ShortageBridge synthesizes the evidence and presents a human review brief with an explicit checklist. The human lead reviews the graph evidence, verifies assumptions, and approves the internal response. The technology empowers the human rather than replacing them."
