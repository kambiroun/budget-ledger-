import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ImportWizard } from "@/components/budget/ImportWizard";
import { ResetWidget } from "@/components/budget/ResetWidget";
import { Masthead } from "@/components/budget/Primitives";

export default async function ImportNewPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="app">
      <ResetWidget />
      <Masthead txCount={0} />
      <ImportWizard />
    </div>
  );
}
