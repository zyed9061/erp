import Link from "next/link";
import { auth, signOut } from "@/auth";

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
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold text-neutral-900">Facturation</span>
          <nav className="flex gap-5 text-sm text-neutral-600">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-neutral-900">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          {session?.user?.name && <span>{session.user.name}</span>}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-neutral-500 hover:text-neutral-900">
              Deconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
