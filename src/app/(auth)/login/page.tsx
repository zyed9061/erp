"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={action} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Facturation</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Connectez-vous pour continuer.</p>
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
          <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{state.error}</p>
        )}

        <button className="btn w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
