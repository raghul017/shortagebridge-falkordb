import { z } from "zod";
import { getGraph } from "@/lib/falkordb";
import { getDemoImpact } from "@/lib/impact";

// The browser sends no graph values. It may only confirm the demo review of the fixed case;
// every ID written below is re-read from FalkorDB on the server first.
export const reviewActionRequestSchema = z.object({
  confirmed: z.literal(true),
}).strict();

// Fixed query text. Only $-parameters carry values, so browser input can never form Cypher.
export const REVIEW_ACTION_QUERY = `
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
  citedEvidenceCount AS cited_evidence_count`;

// Reads back the saved action with its links; also the query documented in the README.
export const LATEST_REVIEW_ACTION_QUERY = `
MATCH (action:ReviewAction)-[:BASED_ON]->(shortage:ShortageRecord)
MATCH (action)-[:BASED_ON]->(facilityProduct:FacilityProduct)
RETURN
  action.id AS action_id,
  action.status AS status,
  action.reviewed_at AS reviewed_at,
  shortage.id AS shortage_id,
  facilityProduct.id AS facility_product_id
ORDER BY action.reviewed_at DESC
LIMIT 1`;

type ReviewActionRow = {
  action_id: string;
  status: string;
  reviewed_at: string;
  synthetic_label: string;
  cited_evidence_count: number;
};

export type SavedReviewAction = {
  actionId: string;
  status: string;
  reviewedAt: string;
  syntheticLabel: string;
  linkedTo: { shortageRecordId: string; facilityProductId: string };
  citedEvidenceIds: string[];
  notice: string;
};

export async function saveDemoReviewAction(): Promise<SavedReviewAction> {
  // Re-read the graph so the saved action can only reference evidence FalkorDB actually returned.
  const impact = await getDemoImpact(undefined);
  const facilityProductId = impact.impacts[0].syntheticFacilityItem.id;
  const evidenceIds = [impact.provenance.publicEvidence.id, impact.provenance.syntheticEvidence.id];
  const reviewedAt = new Date().toISOString();
  const actionId = `REVIEW-DEMO-${reviewedAt.replace(/[:.]/g, "-")}`;

  const graph = await getGraph();
  const result = await graph.query<ReviewActionRow>(REVIEW_ACTION_QUERY, {
    params: {
      actionId,
      caseId: impact.caseId,
      facilityProductId,
      evidenceIds,
      reviewedAt,
      status: "reviewed_by_human_demo",
      // Records that the acknowledgement came from the demo UI, not from an automated process.
      reviewMode: "manual_demo_acknowledgement",
    },
  });

  const row = result.data?.[0];
  if (!row) {
    throw new Error("FalkorDB did not confirm the demo review action.");
  }

  return {
    actionId: row.action_id,
    status: row.status,
    reviewedAt: row.reviewed_at,
    syntheticLabel: row.synthetic_label,
    linkedTo: { shortageRecordId: impact.caseId, facilityProductId },
    citedEvidenceIds: evidenceIds,
    notice: "Synthetic demo record of a human review. No clinical decision, order, or real-world action was taken.",
  };
}
