import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  // 1) Try cookie-based server client first (works when session is in cookies)
  const supabase = await supabaseServer();

  const { data: userData, error: getUserError } = await supabase.auth.getUser();
  const u = userData.user;

  if (u) {
    const { data: isAdminData, error: isAdminError } = await supabase.rpc("is_admin");

    return NextResponse.json({
      email: u.email ?? null,
      user_id: u.id,
      is_admin: isAdminData === true,
      auth_source: "cookies",
      getUser_error: getUserError?.message ?? null,
      isAdmin_error: isAdminError?.message ?? null,
    });
  }

  // 2) Fallback: accept a Bearer token (works when client session is only in localStorage)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    return NextResponse.json(
      {
        email: null,
        user_id: null,
        is_admin: false,
        auth_source: null,
        getUser_error: getUserError?.message ?? "Auth session missing (no cookies) and no Authorization header provided",
      },
      { status: 200 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Use a one-off client that sends the user's access token on every request
  const tokenClient = createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: tokenUserData, error: tokenUserError } = await tokenClient.auth.getUser();
  const tu = tokenUserData.user;

  if (!tu) {
    return NextResponse.json(
      {
        email: null,
        user_id: null,
        is_admin: false,
        auth_source: "bearer",
        getUser_error: tokenUserError?.message ?? "Invalid bearer token",
      },
      { status: 200 }
    );
  }

  const { data: isAdminData2, error: isAdminError2 } = await tokenClient.rpc("is_admin");

  return NextResponse.json({
    email: tu.email ?? null,
    user_id: tu.id,
    is_admin: isAdminData2 === true,
    auth_source: "bearer",
    getUser_error: null,
    isAdmin_error: isAdminError2?.message ?? null,
  });
}