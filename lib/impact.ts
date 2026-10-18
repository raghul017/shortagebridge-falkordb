import { z } from "zod";
import { DEMO_CASE_ID } from "@/lib/constants";
import { getGraph } from "@/lib/falkordb";
import { IMPACT_QUERY } from "@/lib/impact-query";

const caseIdSchema = z.literal(DEMO_CASE_ID);

type ImpactRow = {
  shortage_to_inventory_path: unknown;
  facility_to_review_path: unknown;
  shortage_id: string;
  source_record_id: string;
  generic_name: string;
  shortage_status: string;
  availability: string;
  shortage_update_date: string;
  public_source_url: string;
  public_retrieved_at: string;
  match_status: string;
  match_rationale: string;
  facility_product_id: string;
  facility_product_name: string;
  snapshot_as_of: string;
  on_hand_quantity: number;
  average_daily_use: number;
  estimated_runway_days: number;
  service_id: string;
  service_name: string;
  protocol_id: string;
  protocol_name: string;
  role_id: string;
  role_name: string;
  synthetic_evidence_id: string;
};

export { IMPACT_QUERY };

export async function getDemoImpact(rawCaseId: unknown) {
  const caseId = caseIdSchema.parse(rawCaseId ?? DEMO_CASE_ID);
  const graph = await getGraph();
  const result = await graph.roQuery<ImpactRow>(IMPACT_QUERY, { params: { caseId } });
  const rows = result.data ?? [];

  if (rows.length === 0) {
    throw new Error("The demo case has not been seeded yet. Run npm run seed first.");
  }

  const first = rows[0];
  return {
    caseId,
    notice: "Operational prototype only. The public FDA record does not prove local stock. All facility, inventory, service, protocol, and role details are synthetic demo data.",
    shortage: {
      id: first.shortage_id,
      sourceRecordId: first.source_record_id,
      genericName: first.generic_name,
      status: first.shortage_status,
      availability: first.availability,
      updateDate: first.shortage_update_date,
      dataOrigin: "openfda public record snapshot",
    },
    provenance: {
      publicEvidence: {
        id: `EVIDENCE-OPENFDA-${first.source_record_id}`,
        sourceUrl: first.public_source_url,
        retrievedAt: first.public_retrieved_at,
        dataOrigin: "openfda",
      },
      syntheticEvidence: {
        id: first.synthetic_evidence_id,
        dataOrigin: "synthetic_demo",
        label: "Synthetic demo data — not a real hospital, inventory feed, service, protocol, or role.",
      },
    },
    impacts: rows.map((row) => ({
      graphPaths: {
        shortageToInventory: row.shortage_to_inventory_path,
        facilityToReview: row.facility_to_review_path,
      },
      productMatch: { status: row.match_status, rationale: row.match_rationale },
      syntheticFacilityItem: { id: row.facility_product_id, name: row.facility_product_name },
      syntheticInventory: {
        asOf: row.snapshot_as_of,
        onHandQuantity: row.on_hand_quantity,
        averageDailyUse: row.average_daily_use,
        estimatedRunwayDays: row.estimated_runway_days,
        formula: "synthetic on-hand quantity ÷ synthetic average daily use",
        label: "Illustrative synthetic estimate; not clinical advice or a real inventory forecast.",
      },
      syntheticService: { id: row.service_id, name: row.service_name },
      syntheticReview: {
        protocol: { id: row.protocol_id, name: row.protocol_name },
        role: { id: row.role_id, name: row.role_name },
      },
    })),
  };
}
