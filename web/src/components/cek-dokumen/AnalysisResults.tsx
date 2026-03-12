"use client";

import { useState } from "react";
import { RotateCcw, Shield, AlertTriangle, FileText, AlertOctagon, Info, CheckCircle } from "lucide-react";
import type { AnalysisResponse } from "./types";
import { RISK_CONFIG } from "./types";
import { ClauseCard } from "./ClauseCard";
import { cleanText } from "./textUtils";

interface AnalysisResultsProps {
  result: AnalysisResponse;
  onReset: () => void;
  onClauseSelect?: (clauseText: string | null, clauseIndex: number) => void;
  activeClauseIndex?: number | null;
}

function RiskIcon({ level, size = 18 }: { level: string; size?: number }) {
  switch (level) {
    case "high":
      return <AlertOctagon size={size} className="text-red-600" />;
    case "medium":
      return <AlertTriangle size={size} className="text-amber-600" />;
    case "low":
      return <Info size={size} className="text-blue-600" />;
    case "safe":
      return <CheckCircle size={size} className="text-green-600" />;
    default:
      return <Info size={size} className="text-neutral-gray" />;
  }
}

export function AnalysisResults({ result, onReset, onClauseSelect, activeClauseIndex }: AnalysisResultsProps) {
  const overallConfig = RISK_CONFIG[result.overall_risk];

  return (
    <div className="w-full max-w-none">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-neutral-gray flex-shrink-0" />
          <span className="text-sm text-neutral-gray font-medium truncate">
            {result.filename}
          </span>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-neutral-gray hover:text-dark-navy transition-colors flex-shrink-0"
        >
          <RotateCcw size={14} />
          Analisis Baru
        </button>
      </div>

      {/* Overall score card — score top-left, badge top-right */}
      <div className={`rounded-2xl p-3.5 sm:p-5 mb-4 ${overallConfig.bg} border ${overallConfig.border}`}>
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          {/* Score circle — top left */}
          <div
            className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full border-[3px] flex flex-col items-center justify-center ${overallConfig.border}`}
          >
            <span className="text-lg sm:text-xl font-heading font-bold text-dark-navy leading-none">
              {result.overall_score}
            </span>
            <span className="text-[9px] sm:text-[10px] text-neutral-gray">/10</span>
          </div>

          {/* Risk badge — top right */}
          <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg ${overallConfig.badge}`}>
            <RiskIcon level={result.overall_risk} size={14} />
            Risiko {overallConfig.label}
          </span>
        </div>

        {/* Summary text below */}
        <div className="text-xs sm:text-sm text-dark-navy leading-relaxed whitespace-pre-line">
          {cleanText(result.summary)}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200/50">
          <StatItem level="high" label="Tinggi" count={result.high_risk_count} total={result.total_clauses} />
          <StatItem level="medium" label="Sedang" count={result.medium_risk_count} total={result.total_clauses} />
          <StatItem level="low" label="Rendah" count={result.low_risk_count} total={result.total_clauses} />
          <StatItem level="safe" label="Aman" count={result.safe_count} total={result.total_clauses} />
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-center">
        <p className="text-[11px] text-amber-800 leading-relaxed">{cleanText(result.disclaimer).replace(/^⚠️\s*/, "")}</p>
      </div>

      {/* Clause cards */}
      <div className="mb-4">
        <h2 className="font-heading text-base font-bold text-dark-navy mb-3 flex items-center gap-2">
          Detail Per Klausa
          <span className="text-xs font-normal text-neutral-gray">({result.total_clauses} klausa)</span>
        </h2>
        <div className="space-y-2.5">
          {result.clauses
            .sort((a, b) => b.risk_score - a.risk_score)
            .map((clause) => (
              <ClauseCard
                key={clause.clause_index}
                clause={clause}
                isActive={activeClauseIndex === clause.clause_index}
                onSelect={(text) => onClauseSelect?.(text, clause.clause_index)}
              />
            ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-dark-navy rounded-2xl p-4 sm:p-5 text-center text-white mb-6">
        <h3 className="font-heading text-sm sm:text-base font-bold mb-1.5">
          Butuh Konsultasi Lebih Lanjut?
        </h3>
        <p className="text-[11px] sm:text-xs text-gray-400 mb-3">
          Hubungi pengacara mitra kami untuk review mendalam
        </p>
        <button
          className="bg-primary-orange text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors opacity-75 cursor-not-allowed"
          disabled
          title="Segera Hadir"
        >
          Konsultasi Pengacara — Segera Hadir
        </button>
      </div>
    </div>
  );
}

function StatItem({ level, label, count, total }: { level: string; label: string; count: number; total: number }) {
  return (
    <div className="bg-white/60 rounded-lg p-2 text-center">
      <RiskIcon level={level} size={14} />
      <p className="font-heading font-bold text-dark-navy text-base mt-0.5 leading-none">
        {count}
        <span className="text-[10px] text-neutral-gray font-normal">/{total}</span>
      </p>
      <p className="text-[10px] text-neutral-gray mt-0.5">{label}</p>
    </div>
  );
}
