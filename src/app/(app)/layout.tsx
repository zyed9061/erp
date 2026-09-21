import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      userName={session?.user?.name ?? "Utilisateur"}
      userEmail={session?.user?.email ?? ""}
      onSignOut={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
