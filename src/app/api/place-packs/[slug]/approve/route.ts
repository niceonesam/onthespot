import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { approveCandidate } = await import(
      "../../../../../../tools/place-pack.mjs"
    );

    const result = approveCandidate({
      slug,
      id: body?.id,
      title: body?.title,
      date_start: body?.date_start,
      date_end: body?.date_end,
      category: body?.category,
      era: body?.era,
      significance: body?.significance,
      area_note: body?.area_note,
      confidence: body?.confidence,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to approve candidate";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}