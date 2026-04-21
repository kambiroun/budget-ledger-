"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      }}
      style={{
        padding: "10px 18px", background: "transparent", color: "var(--ink)",
        border: "1px solid var(--rule)", cursor: "pointer",
        fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}
    >
      Sign out
    </button>
  );
}
