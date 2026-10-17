import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { DEMO_CASE_ID } from "@/lib/constants";
import { getDemoImpact } from "@/lib/impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caseId = request.nextUrl.searchParams.get("caseId") ?? DEMO_CASE_ID;
    return NextResponse.json(await getDemoImpact(caseId));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: `Only the fixed demo case (${DEMO_CASE_ID}) is available in this first slice.` },
        { status: 400 },
      );
    }

    const message = error instanceof Error && error.message.includes("seeded")
      ? error.message
      : "Impact data is unavailable. Check the FalkorDB service and run the seed command.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
