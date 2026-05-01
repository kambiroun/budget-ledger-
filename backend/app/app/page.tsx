import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BudgetShell } from "@/components/budget/BudgetShell";

export default async function AppHome() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return <BudgetShell userEmail={user.email || ""} userId={user.id} />;
}
