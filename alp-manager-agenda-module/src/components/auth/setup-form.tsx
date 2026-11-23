"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  KeyRound,
  LockKeyhole,
  Mail,
  TriangleAlert,
} from "lucide-react";

export function SetupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }

    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    if (setupToken.length < 32) {
      setError("Le jeton d'initialisation semble incomplet.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          setupToken,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Initialisation impossible.",
        );
        setIsLoading(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
      setIsLoading(false);
    }
  }

  const inputClass =
    "h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-alp-green/60 focus:ring-2 focus:ring-alp-green/10";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="setup-email" className="block text-sm font-medium text-zinc-300">
          Adresse e-mail Direction
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="setup-email"
            type="email"
            autoComplete="username"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Adresse e-mail autorisée"
            className={`${inputClass} pl-11`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="setup-token" className="block text-sm font-medium text-zinc-300">
          Jeton d'initialisation
        </label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="setup-token"
            type="password"
            autoComplete="off"
            required
            minLength={32}
            maxLength={512}
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            placeholder="Jeton présent dans votre configuration .env"
            className={`${inputClass} pl-11`}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Ce jeton autorise la création du premier compte Direction.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="setup-password" className="block text-sm font-medium text-zinc-300">
          Nouveau mot de passe
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="setup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="12 caractères minimum"
            className={`${inputClass} pl-11`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="setup-confirmation" className="block text-sm font-medium text-zinc-300">
          Confirmer le mot de passe
        </label>
        <input
          id="setup-confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={1024}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Saisissez à nouveau le mot de passe"
          className={inputClass}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !email.trim() || !setupToken || !password || !confirmation}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-alp-green px-4 text-sm font-bold text-alp-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Initialisation en cours..." : "Créer le compte Direction"}
        {!isLoading && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
