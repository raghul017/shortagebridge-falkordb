import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { briefQuestionSchema, createEvidenceBrief } from "@/lib/evidence-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = briefQuestionSchema.parse(await request.json());
    return NextResponse.json(await createEvidenceBrief(body.question));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "A valid question is required." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "The graph-backed evidence brief is unavailable. Check FalkorDB and try again." },
      { status: 503 },
    );
  }
}
