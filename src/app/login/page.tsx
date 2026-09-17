"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace(next);
      router.refresh();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Login failed");
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="glass w-full max-w-sm space-y-4 p-6"
      >
        <div className="mx-auto mb-3 flex w-44 flex-col items-center">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-12 w-12"
          />
          <h1 className="grad-text -mt-1.5 text-center text-lg font-semibold leading-none">
            ProjectPulse login
          </h1>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="input-glass w-full px-3 py-2"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="btn-primary w-full px-3 py-2"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
