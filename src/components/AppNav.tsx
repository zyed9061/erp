import { auth, signOut } from "@/auth";
import { NavLinks } from "./NavLinks";

export async function AppNav() {
  const session = await auth();
  const nom = session?.user?.name;
  const initiales = nom
    ? nom
        .split(" ")
        .map((m) => m[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex items-center gap-6">
          <span className="shrink-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
            Facturation
          </span>
          <NavLinks />
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          {nom && (
            <span className="flex items-center gap-2 text-neutral-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-semibold text-white shadow-sm">
                {initiales}
              </span>
              <span className="hidden sm:inline">{nom}</span>
            </span>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg px-2.5 py-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Deconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
