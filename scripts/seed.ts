import { DEMO_CASE_ID, OPENFDA_RECORD_URL } from "../lib/constants";
import { getGraph } from "../lib/falkordb";

type Properties = Record<string, string | number | boolean>;

async function upsertNode(label: string, id: string, properties: Properties) {
  const graph = await getGraph();
  await graph.query(`MERGE (node:${label} {id: $id}) SET node += $properties`, {
    params: { id, properties: { id, ...properties } },
  });
}

async function upsertRelationship(
  fromLabel: string,
  fromId: string,
  relationship: string,
  toLabel: string,
  toId: string,
  properties: Properties = {},
) {
  const graph = await getGraph();
  await graph.query(
    `MATCH (from:${fromLabel} {id: $fromId}), (to:${toLabel} {id: $toId}) MERGE (from)-[edge:${relationship}]->(to) SET edge += $properties`,
    { params: { fromId, toId, properties } },
  );
}

async function main() {
  // These fields are a narrow public snapshot recorded from openFDA on the seed run.
  // The source record has package NDC 0409-4776-01 and openFDA reported last_updated 2026-10-16.
  const retrievedAt = new Date().toISOString();
  const publicEvidenceId = "EVIDENCE-OPENFDA-0409-4776-01";
  const syntheticEvidenceId = "EVIDENCE-SYNTHETIC-DEMO";

  await upsertNode("EvidenceSource", publicEvidenceId, {
    data_origin: "openfda",
    source_url: OPENFDA_RECORD_URL,
    retrieved_at: retrievedAt,
    source_last_updated: "2026-10-16",
    source_note: "Public openFDA Drug Shortages API snapshot. Do not use for medical decisions.",
  });
  await upsertNode("EvidenceSource", syntheticEvidenceId, {
    data_origin: "synthetic_demo",
    source_url: "https://example.invalid/shortagebridge-synthetic-demo",
    retrieved_at: retrievedAt,
    source_note: "Synthetic demo data. No patient, private hospital, or confidential data.",
  });
  await upsertNode("ShortageRecord", DEMO_CASE_ID, {
    data_origin: "openfda",
    evidence_id: publicEvidenceId,
    source_record_id: "0409-4776-01",
    generic_name: "Lidocaine Hydrochloride Injection",
    presentation: "Lidocaine Hydrochloride Preservative Free, Injection, 300 mg/20 mL (1.5%; 15 mg/mL)",
    dosage_form: "Injection",
    availability: "Available",
    status: "Current",
    update_date: "10/08/2026",
    initial_posting_date: "02/22/2012",
    source_label: "openFDA Drug Shortages API",
  });
  await upsertNode("DrugPresentation", "DRUG-LIDOCAINE-HCL-PF-300MG-20ML", {
    data_origin: "openfda",
    evidence_id: publicEvidenceId,
    package_ndc: "0409-4776-01",
    name: "Lidocaine Hydrochloride Preservative Free Injection 300 mg/20 mL",
  });
  await upsertNode("Facility", "FACILITY-RIVERGLEN-DEMO", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Riverglen Demonstration Hospital",
    synthetic_label: "Synthetic demo facility — not a real hospital",
  });
  await upsertNode("FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Demo formulary item: Lidocaine PF 300 mg/20 mL",
    synthetic_label: "Synthetic demo formulary item — not a real formulary entry",
  });
  await upsertNode("InventorySnapshot", "INV-LIDOCAINE-PF-2026-10-17", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    as_of: "2026-10-17T00:00:00Z",
    on_hand_quantity: 24,
    average_daily_use: 6,
    unit: "synthetic demo units",
    synthetic_label: "Synthetic demo inventory snapshot — not live stock",
  });
  await upsertNode("ServiceLine", "SERVICE-EXAMPLE-PROCEDURE-SUITE", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Example Procedure Suite",
    synthetic_label: "Synthetic demo service line",
  });
  await upsertNode("ServiceLine", "SERVICE-EXAMPLE-ACUTE-CARE", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Example Acute Care Unit",
    synthetic_label: "Synthetic demo service line",
  });
  await upsertNode("Protocol", "PROTOCOL-EXAMPLE-SHORTAGE-REVIEW", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Example shortage-review escalation",
    synthetic_label: "Synthetic demo protocol — not a clinical protocol",
  });
  await upsertNode("ResponseRole", "ROLE-EXAMPLE-PHARMACY-OPS", {
    data_origin: "synthetic_demo",
    evidence_id: syntheticEvidenceId,
    name: "Example pharmacy operations review role",
    synthetic_label: "Synthetic demo role — not a real person or job assignment",
  });

  await upsertRelationship("ShortageRecord", DEMO_CASE_ID, "REPORTS_ON", "DrugPresentation", "DRUG-LIDOCAINE-HCL-PF-300MG-20ML");
  await upsertRelationship("DrugPresentation", "DRUG-LIDOCAINE-HCL-PF-300MG-20ML", "MATCHED_TO", "FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML", {
    data_origin: "reviewed_mapping",
    status: "reviewed",
    rationale: "Demo-only reviewed mapping based on the matching package NDC and presentation text; it does not assert local availability.",
  });
  await upsertRelationship("Facility", "FACILITY-RIVERGLEN-DEMO", "HAS_ITEM", "FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML");
  await upsertRelationship("FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML", "HAS_SNAPSHOT", "InventorySnapshot", "INV-LIDOCAINE-PF-2026-10-17");
  for (const serviceId of ["SERVICE-EXAMPLE-PROCEDURE-SUITE", "SERVICE-EXAMPLE-ACUTE-CARE"]) {
    await upsertRelationship("FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML", "USED_BY", "ServiceLine", serviceId);
    await upsertRelationship("ServiceLine", serviceId, "FOLLOWS", "Protocol", "PROTOCOL-EXAMPLE-SHORTAGE-REVIEW");
  }
  await upsertRelationship("Protocol", "PROTOCOL-EXAMPLE-SHORTAGE-REVIEW", "ESCALATE_TO", "ResponseRole", "ROLE-EXAMPLE-PHARMACY-OPS");
  await upsertRelationship("EvidenceSource", publicEvidenceId, "SUPPORTS", "ShortageRecord", DEMO_CASE_ID);
  await upsertRelationship("EvidenceSource", publicEvidenceId, "SUPPORTS", "DrugPresentation", "DRUG-LIDOCAINE-HCL-PF-300MG-20ML");
  for (const [label, id] of [
    ["Facility", "FACILITY-RIVERGLEN-DEMO"],
    ["FacilityProduct", "FP-LIDOCAINE-PF-300MG-20ML"],
    ["InventorySnapshot", "INV-LIDOCAINE-PF-2026-10-17"],
    ["ServiceLine", "SERVICE-EXAMPLE-PROCEDURE-SUITE"],
    ["ServiceLine", "SERVICE-EXAMPLE-ACUTE-CARE"],
    ["Protocol", "PROTOCOL-EXAMPLE-SHORTAGE-REVIEW"],
    ["ResponseRole", "ROLE-EXAMPLE-PHARMACY-OPS"],
  ]) {
    await upsertRelationship("EvidenceSource", syntheticEvidenceId, "SUPPORTS", label, id);
  }

  console.log(`Seeded ${DEMO_CASE_ID} idempotently at ${retrievedAt}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
