import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const packPath = path.resolve(
      process.cwd(),
      `data/place-packs/${slug}.json`
    );

    if (!fs.existsSync(packPath)) {
      return NextResponse.json(
        { ok: false, error: "Place pack not found" },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(packPath, "utf8");
    const pack = JSON.parse(raw);

    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load place pack";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}