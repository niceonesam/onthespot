import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  // Require signed-in caller (prevents public email probing)
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = String(searchParams.get("ids") ?? "").trim();
  const email = String(searchParams.get("email") ?? "").trim().toLowerCase();

  if (!idsParam) {
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Provide either ids=... or email=..." },
        { status: 400 }
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local (service role key)." },
      { status: 500 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const idsCapped = Array.from(new Set(ids)).slice(0, 50);

    const map: Record<string, string> = {};
    const users: Array<{ id: string; email: string | null; display_name: string | null; label: string }> = [];

    // 1) Fetch auth emails (admin API)
    const authById = new Map<string, { id: string; email: string | null }>();

    for (const id of idsCapped) {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) {
        authById.set(id, { id, email: null });
      } else {
        authById.set(id, { id: data.user.id, email: (data.user.email ?? null) });
      }
    }

    // 2) Fetch display_name from profiles in one query
    const { data: profRows, error: profErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", idsCapped);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    const nameById = new Map<string, string>();
    for (const r of profRows ?? []) {
      if (r?.id && r?.display_name) nameById.set(r.id, r.display_name);
    }

    // 3) Build label map: display_name ?? email ?? id
    for (const id of idsCapped) {
      const auth = authById.get(id);
      const displayName: string | null = nameById.get(id) ?? null;
      const emailLabel: string | null = auth?.email ?? null;

      const label: string = (displayName ?? emailLabel ?? id);
      map[id] = label;

      // return a structured list too (handy for UIs)
      users.push({ id, email: emailLabel, display_name: displayName, label });
    }

    return NextResponse.json({ map, users }, { status: 200 });
  }

  // Supabase JS versions differ; some don't expose getUserByEmail().
  // Use listUsers() and match by email instead.
  const perPage = 200;
  let page = 1;
  let foundId: string | null = null;

  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit?.id) {
      foundId = hit.id;
      break;
    }

    // If fewer than perPage returned, no more pages.
    if (users.length < perPage) break;
    page += 1;
  }

  let display_name: string | null = null;
  if (foundId) {
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", foundId)
      .maybeSingle();

    if (!profErr) {
      display_name = (prof?.display_name as string | null) ?? null;
    }
  }

  // label priority: display_name ?? email ?? id
  const label: string | null = (display_name ?? null) || (email ? email : null) || foundId;

  return NextResponse.json(
    { user_id: foundId, display_name, label },
    { status: 200 }
  );
}