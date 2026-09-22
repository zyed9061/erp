import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/", label: "Tableau de bord" },
  { href: "/clients", label: "Clients" },
  { href: "/produits", label: "Produits & Services" },
  { href: "/devis", label: "Devis" },
  { href: "/factures", label: "Factures" },
  { href: "/avoirs", label: "Avoirs" },
];

export async function AppNav() {
  const session = await auth();

  return (
    <header className="border-b border-neutral-200 bg-surface">
      <div className="h-1 bg-linear-to-r from-brand via-accent to-pop" />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="bg-linear-to-r from-brand to-accent bg-clip-text text-lg font-bold text-transparent">
            Facturation
          </span>
          <nav className="flex gap-5 text-sm text-neutral-600">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-brand">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          <ThemeToggle />
          {session?.user?.name && <span>{session.user.name}</span>}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-neutral-500 hover:text-accent">
              Deconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
