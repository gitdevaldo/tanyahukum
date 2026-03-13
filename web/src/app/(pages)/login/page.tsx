"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { isAuthenticated, setSession } from "@/lib/auth-session";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard/");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json().catch(() => ({ detail: "Login gagal." }));
      if (!res.ok) {
        throw new Error(data.detail || "Login gagal.");
      }

      const auth = data as LoginResponse;
      setSession(auth.access_token, auth.refresh_token);
      router.push("/dashboard/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat login.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-light-cream px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border-light bg-white shadow-lg">
        <div className="grid lg:grid-cols-2">
          <section className="hidden bg-dark-navy p-10 text-white lg:block">
            <Link href="/" className="inline-block">
              <img src="/logo.svg" alt="TanyaHukum" className="h-11" />
            </Link>
            <h1 className="mt-8 text-3xl font-bold leading-tight">
              Masuk ke TanyaHukum
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-text">
              Kelola kuota analisis dan e-sign Anda dari satu dashboard yang
              rapi, cepat, dan mudah dipakai.
            </p>

            <div className="mt-10 space-y-4">
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-semibold">Akses akun personal</p>
                <p className="mt-1 text-xs text-muted-text">
                  Untuk pengguna individu dengan paket free dan starter.
                </p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-semibold">Akses akun bisnis</p>
                <p className="mt-1 text-xs text-muted-text">
                  Untuk tim dengan paket plus, business, dan enterprise.
                </p>
              </div>
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <Link href="/" className="inline-block lg:hidden">
              <img src="/logo.svg" alt="TanyaHukum" className="h-10" />
            </Link>

            <h2 className="mt-6 text-2xl font-bold text-dark-navy">Masuk</h2>
            <p className="mt-2 text-sm text-neutral-gray">
              Masukkan email dan password akun Anda.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-dark-navy"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  placeholder="nama@email.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-dark-navy"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  placeholder="Minimal 8 karakter"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-primary-orange px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Memproses..." : "Masuk"}
              </button>
            </form>

            <p className="mt-6 text-sm text-neutral-gray">
              Belum punya akun?{" "}
              <Link href="/signup/" className="font-semibold text-primary-orange">
                Daftar sekarang
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
