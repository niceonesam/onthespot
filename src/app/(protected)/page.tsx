import { redirect } from "next/navigation";
import HomeClient from "../HomeClient";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return <HomeClient />;
}