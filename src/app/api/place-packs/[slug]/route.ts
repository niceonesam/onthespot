import { NextResponse } from "next/server";
import { getPackData } from "../../../../../tools/place-pack.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pack = getPackData(slug);
    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load place pack";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}