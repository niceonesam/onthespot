import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  // Supabase uses "code" for PKCE flows; it may also include error info
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error_description ?? error)}`, origin)
    );
  }

  if (code) {
    const supabase = await supabaseServer();
    // This sets the auth cookies on your domain
    await supabase.auth.exchangeCodeForSession(code);
  }

  // After consuming the token/session, send user to a page that lets them set a new password
  return NextResponse.redirect(new URL("/reset-password", origin));
}