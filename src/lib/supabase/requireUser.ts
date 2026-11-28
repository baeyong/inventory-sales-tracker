import { redirect } from "next/navigation";
import { createClient } from "./server";

/** The signed-in user and a Supabase client acting as them; sends anyone
 * signed out to /login. For use inside server actions and pages. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export type Db = Awaited<ReturnType<typeof createClient>>;
