"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="grid place-items-center px-4 pt-16 pb-6">
      <form action={action} className="card w-full max-w-sm p-7 space-y-5">
        <div className="flex items-center gap-3">
          <span className="brand-mark" style={{ width: "2.6rem", height: "2.6rem", fontSize: "1.2rem" }} aria-hidden="true">F</span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Facturation</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>Connectez-vous pour continuer.</p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-sm">E-mail</span>
          <input className="input" name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Mot de passe</span>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>

        {state.error && (
          <p role="alert" className="text-sm rounded-md px-3 py-2" style={{ color: "var(--danger)", background: "var(--bad-bg)" }}>{state.error}</p>
        )}

        <button className="btn w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
