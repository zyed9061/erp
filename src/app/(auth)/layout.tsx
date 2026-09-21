import { ROLE_LABELS } from "@/lib/auth/permissions";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isDemoMode } from "@/lib/demo/mode";
import { DemoAccounts } from "./demo-accounts";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {isDemoMode() && (
        <DemoAccounts accounts={DEMO_ACCOUNTS.map((a) => ({ email: a.email, password: a.password, role: a.role, label: ROLE_LABELS[a.role] }))} />
      )}
    </>
  );
}
