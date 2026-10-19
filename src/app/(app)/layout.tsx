import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-[1264px] flex-1 px-4 pb-9 pt-2 sm:px-8">
        {children}
      </main>
    </div>
  );
}
