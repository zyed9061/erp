import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { MotionProvider } from "@/components/ui/MotionProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <MotionProvider>
      <AppShell
        userName={session?.user?.name ?? "Utilisateur"}
        userEmail={session?.user?.email ?? ""}
        onSignOut={handleSignOut}
      >
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </AppShell>
    </MotionProvider>
  );
}
