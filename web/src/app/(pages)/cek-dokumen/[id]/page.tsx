"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getAnalysis, clearAnalysis } from "@/components/cek-dokumen/analysisStore";
import { AnalysisResults } from "@/components/cek-dokumen/AnalysisResults";
import { ChatPanel } from "@/components/cek-dokumen/ChatPanel";
import type { AnalysisResponse } from "@/components/cek-dokumen/types";

const PdfViewer = dynamic(
  () => import("@/components/cek-dokumen/PdfViewer"),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full" /></div> }
);

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const analysisId = params.id as string;

  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlightText, setHighlightText] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState("rgba(251, 146, 60, 0.35)");
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // H-12: Clean up blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith("blob:")) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    // Try in-memory store first (instant after analysis)
    const memData = getAnalysis();
    if (memData) {
      setResult(memData.result);
      setPdfUrl(memData.pdfUrl);
      setLoading(false);
      return;
    }

    // Fallback: fetch from API (direct URL visit or page refresh)
    async function fetchFromApi() {
      try {
        const res = await fetch(`/api/analysis/${analysisId}/`);
        if (!res.ok) {
          router.replace("/cek-dokumen/");
          return;
        }
        const data: AnalysisResponse = await res.json();
        setResult(data);

        // Also fetch the PDF
        try {
          const pdfRes = await fetch(`/api/analysis/${analysisId}/pdf/`);
          if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            setPdfUrl(URL.createObjectURL(blob));
          }
        } catch {
          // PDF not available — non-fatal
        }
      } catch {
        router.replace("/cek-dokumen/");
      } finally {
        setLoading(false);
      }
    }

    fetchFromApi();
  }, [analysisId, router]);

  const handleClauseSelect = (text: string | null, clauseIndex: number) => {
    if (text) {
      setHighlightText(text);
      setActiveClauseIndex(clauseIndex);

      // Set highlight color based on clause risk level
      const clause = result?.clauses.find((c) => c.clause_index === clauseIndex);
      if (clause) {
        const colorMap: Record<string, string> = {
          high: "rgba(239, 68, 68, 0.3)",
          medium: "rgba(245, 158, 11, 0.3)",
          low: "rgba(59, 130, 246, 0.3)",
          safe: "rgba(34, 197, 94, 0.3)",
        };
        setHighlightColor(colorMap[clause.risk_level] || "rgba(251, 146, 60, 0.35)");
      }
    } else {
      setHighlightText(null);
      setActiveClauseIndex(null);
    }
  };

  const handleReset = () => {
    clearAnalysis();
    router.push("/cek-dokumen/");
  };

  if (loading || !result) {
    return (
      <main className="min-h-screen bg-light-cream flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-neutral-gray">Memuat hasil analisis...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-light-cream overflow-hidden">
      {/* Header */}
      <header className="bg-dark-navy text-white py-2.5 px-4 sm:py-3 sm:px-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <a href="/">
            <img src="/logo.svg" alt="TanyaHukum" className="h-7 sm:h-8" />
          </a>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[200px]">
              {result.filename}
            </span>
            <a
              href="/cek-dokumen/"
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Analisis Baru
            </a>
          </div>
        </div>
      </header>

      {/* Two-column layout (stacks on mobile) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left panel — Analysis results */}
        <div className="w-full md:w-[60%] overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200 min-h-0 flex-1 md:flex-none">
          <div className="p-3 sm:p-4 lg:p-6">
            <AnalysisResults
              result={result}
              onReset={handleReset}
              onClauseSelect={handleClauseSelect}
              activeClauseIndex={activeClauseIndex}
            />
          </div>
        </div>

        {/* Right panel — PDF viewer (hidden on mobile, shown on md+) */}
        {pdfUrl ? (
          <div className="hidden md:block md:w-[40%] overflow-hidden">
            <PdfViewer
              pdfUrl={pdfUrl}
              highlightText={highlightText}
              highlightColor={highlightColor}
            />
          </div>
        ) : (
          <div className="hidden md:flex md:w-[40%] items-center justify-center bg-gray-50">
            <p className="text-neutral-gray text-sm">PDF tidak tersedia</p>
          </div>
        )}
      </div>

      {/* Chat panel */}
      <ChatPanel
        analysisId={result.analysis_id}
        analysisResult={result}
        isOpen={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
      />
    </main>
  );
}
