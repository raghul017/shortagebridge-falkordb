// Kept free of server imports so the UI can display the exact query text.
// This query text never incorporates browser input. Only $caseId is a parameter.
export const IMPACT_QUERY = `
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
ORDER BY service.name`;
