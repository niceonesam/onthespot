import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  // IMPORTANT: use 303 so the browser turns the POST into a GET on /login
  // (prevents 405 Method Not Allowed on the login page).
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}