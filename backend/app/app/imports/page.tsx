import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ImportsHistory } from "@/components/budget/ImportsHistory";
import { ResetWidget } from "@/components/budget/ResetWidget";
import { Masthead } from "@/components/budget/Primitives";

export default async function ImportsListPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="app">
      <ResetWidget />
      <Masthead txCount={0} />
      <ImportsHistory />
    </div>
  );
}
