"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, TriangleAlert } from "lucide-react";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Connexion impossible. Vérifiez vos identifiants.",
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-zinc-300"
        >
          Adresse e-mail
        </label>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="prenom@alp-racing.fr"
            className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-alp-green/60 focus:ring-2 focus:ring-alp-green/10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-zinc-300"
        >
          Mot de passe
        </label>

        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Votre mot de passe"
            className="h-12 w-full rounded-xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-alp-green/60 focus:ring-2 focus:ring-alp-green/10"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !email.trim() || !password}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-alp-green px-4 text-sm font-bold text-alp-ink shadow-[0_8px_24px_rgba(61,220,132,0.16)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Connexion en cours..." : "Se connecter"}
        {!isLoading && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
