"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadSection } from "@/components/cek-dokumen/UploadSection";
import { LoadingProgress } from "@/components/cek-dokumen/LoadingProgress";
import { storeAnalysis } from "@/components/cek-dokumen/analysisStore";
import type { AnalysisResponse } from "@/components/cek-dokumen/types";
import { isAuthenticated } from "@/lib/auth-session";

type PageState = "upload" | "analyzing";

export default function CekDokumenPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("upload");
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const fileRef = useRef<File | null>(null);

  useEffect(() => {
    setHasSession(isAuthenticated());
  }, []);

  const handleAnalyze = useCallback(async (file: File | null, text: string | null) => {
    setState("analyzing");
    setError(null);
    fileRef.current = file;

    try {
      const formData = new FormData();

      if (file) {
        formData.append("file", file);
      } else if (text) {
        // M-15: Send as plain text file, not fake PDF
        const blob = new Blob([text], { type: "text/plain" });
        formData.append("file", blob, "dokumen-teks.txt");
      }

      const res = await fetch("/api/analyze/", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(300000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Terjadi kesalahan server" }));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data: AnalysisResponse = await res.json();

      // Store in memory and navigate to results page
      if (file) {
        const hash = storeAnalysis(data, file);
        router.push(`/cek-dokumen/${hash}/`);
      } else {
        // Text mode — no PDF to display, store with a dummy file
        const hash = storeAnalysis(data, new File([text || ""], "dokumen-teks.txt", { type: "text/plain" }));
        router.push(`/cek-dokumen/${hash}/`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
      setState("upload");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-light-cream">
      {/* Header */}
      <header className="bg-dark-navy text-white py-3 sm:py-4 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/">
            <img src="/logo.svg" alt="TanyaHukum" className="h-8 sm:h-9" />
          </a>
          <div className="flex items-center gap-3">
            <a href="/cek-dokumen/" className="text-xs sm:text-sm text-gray-400 hover:text-gray-200 transition-colors hidden sm:block">
              AI Legal Document Analysis
            </a>
            {hasSession ? (
              <a
                href="/dashboard/"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Dashboard
              </a>
            ) : (
              <a
                href="/login/"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Masuk
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {state === "upload" && (
          <UploadSection onAnalyze={handleAnalyze} error={error} />
        )}

        {state === "analyzing" && (
          <LoadingProgress />
        )}
      </div>
    </main>
  );
}
