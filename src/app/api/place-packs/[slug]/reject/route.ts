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
    const { rejectCandidate } = await import(
      "../../../../../../tools/place-pack.mjs"
    );

    const result = rejectCandidate({
      slug,
      id: body?.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reject candidate";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}