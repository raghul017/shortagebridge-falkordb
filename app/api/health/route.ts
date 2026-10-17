import { NextResponse } from "next/server";
import { checkGraphConnection } from "@/lib/falkordb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const graphConnected = await checkGraphConnection();
    return NextResponse.json({ ok: graphConnected, graphConnected });
  } catch {
    return NextResponse.json(
      { ok: false, graphConnected: false, error: "FalkorDB is unavailable. Check the server-side connection settings." },
      { status: 503 },
    );
  }
}
