"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { isAuthenticated, setSession } from "@/lib/auth-session";

type AccountType = "personal" | "business";
type Plan = "free" | "starter" | "plus" | "business" | "enterprise";

const PLAN_OPTIONS: Record<AccountType, Array<{ value: Plan; label: string }>> = {
  personal: [
    { value: "free", label: "Free (Personal)" },
    { value: "starter", label: "Starter (Personal)" },
  ],
  business: [
    { value: "plus", label: "Plus (Bisnis)" },
    { value: "business", label: "Business (Bisnis)" },
    { value: "enterprise", label: "Enterprise (Bisnis)" },
  ],
};

type LoginResponse = {
  access_token: string;
  refresh_token: string;
};

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [plan, setPlan] = useState<Plan>("free");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentPlans = useMemo(() => PLAN_OPTIONS[accountType], [accountType]);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard/");
      return;
    }

    const defaultPlan = PLAN_OPTIONS[accountType][0]?.value;
    if (defaultPlan && !PLAN_OPTIONS[accountType].some((item) => item.value === plan)) {
      setPlan(defaultPlan);
    }
  }, [accountType, plan, router]);

  async function autoLogin(nextEmail: string, nextPassword: string) {
    const loginRes = await fetch("/api/auth/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
      signal: AbortSignal.timeout(20000),
    });

    const loginData = await loginRes.json().catch(() => ({ detail: "Login gagal." }));
    if (!loginRes.ok) {
      throw new Error(loginData.detail || "Akun berhasil dibuat, tetapi login otomatis gagal.");
    }

    const auth = loginData as LoginResponse;
    setSession(auth.access_token, auth.refresh_token);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const registerRes = await fetch("/api/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          account_type: accountType,
          plan,
        }),
        signal: AbortSignal.timeout(20000),
      });

      const registerData = await registerRes.json().catch(() => ({ detail: "Registrasi gagal." }));
      if (!registerRes.ok) {
        throw new Error(registerData.detail || "Registrasi gagal.");
      }

      await autoLogin(email, password);
      router.push("/dashboard/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat registrasi.");
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
              Buat akun TanyaHukum
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-text">
              Pilih tipe akun sesuai kebutuhan Anda lalu mulai kelola analisis
              kontrak dan tanda tangan digital dari dashboard.
            </p>

            <div className="mt-10 rounded-xl border border-white/15 bg-white/5 p-5">
              <h2 className="text-sm font-semibold">Ringkasan paket</h2>
              <ul className="mt-3 space-y-2 text-xs text-muted-text">
                <li>Personal: free dan starter</li>
                <li>Bisnis: plus, business, enterprise</li>
                <li>Semua akun bisa langsung dipakai setelah daftar</li>
              </ul>
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <Link href="/" className="inline-block lg:hidden">
              <img src="/logo.svg" alt="TanyaHukum" className="h-10" />
            </Link>

            <h2 className="mt-6 text-2xl font-bold text-dark-navy">Daftar</h2>
            <p className="mt-2 text-sm text-neutral-gray">
              Isi data di bawah untuk membuat akun baru.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-dark-navy"
                >
                  Nama
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  placeholder="Nama lengkap"
                />
              </div>

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
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  placeholder="Minimal 8 karakter"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="accountType"
                    className="mb-1 block text-sm font-medium text-dark-navy"
                  >
                    Tipe Akun
                  </label>
                  <select
                    id="accountType"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as AccountType)}
                    className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  >
                    <option value="personal">Personal</option>
                    <option value="business">Bisnis</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="plan"
                    className="mb-1 block text-sm font-medium text-dark-navy"
                  >
                    Paket
                  </label>
                  <select
                    id="plan"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as Plan)}
                    className="w-full rounded-lg border border-border-light px-4 py-3 text-sm text-dark-navy outline-none transition-colors focus:border-primary-orange"
                  >
                    {currentPlans.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
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
                {isSubmitting ? "Memproses..." : "Buat Akun"}
              </button>
            </form>

            <p className="mt-6 text-sm text-neutral-gray">
              Sudah punya akun?{" "}
              <Link href="/login/" className="font-semibold text-primary-orange">
                Masuk
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
