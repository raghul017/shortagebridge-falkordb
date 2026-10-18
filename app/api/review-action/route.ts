import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { reviewActionRequestSchema, saveDemoReviewAction } from "@/lib/review-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    reviewActionRequestSchema.parse(await request.json());
    return NextResponse.json(await saveDemoReviewAction());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "A confirmed human review is required to save the demo review action." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "The demo review action could not be saved to FalkorDB. The review brief above is unaffected." },
      { status: 503 },
    );
  }
}
