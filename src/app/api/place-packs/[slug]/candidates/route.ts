import { NextResponse } from "next/server";
import { listCandidates } from "../../../../../../tools/place-pack.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const result = listCandidates({ slug });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list candidates";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}