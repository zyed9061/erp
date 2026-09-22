import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([getT(), auth()]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      userName={session?.user?.name ?? t("common.user")}
      userEmail={session?.user?.email ?? ""}
      onSignOut={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
