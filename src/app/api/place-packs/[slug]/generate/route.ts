import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));

    const { generateEntries } = await import(
      "../../../../../../tools/place-pack.mjs"
    );

    const result = await generateEntries({
      slug,
      place: body?.place,
      query: body?.query,
      limit: body?.limit,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate candidates";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}