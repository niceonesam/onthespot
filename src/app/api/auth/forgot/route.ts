import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Where the user should land AFTER clicking the email link.
  // This must be allowed in Supabase Auth settings (Redirect URLs).
  const h = await headers();
  const origin =
    h.get("origin") ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const redirectTo = `${origin}/auth/reset`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // For security, do NOT reveal whether the email exists.
  if (error) {
    // Still return 200 with generic text in prod; but returning error helps you while building.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}