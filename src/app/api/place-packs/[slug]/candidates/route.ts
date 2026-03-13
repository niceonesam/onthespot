import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { listCandidates } = await import(
      "../../../../../../tools/place-pack.mjs"
    );
    const result = listCandidates({ slug });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list candidates";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}