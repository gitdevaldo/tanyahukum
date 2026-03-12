"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, AlertTriangle, AlertOctagon, Info, CheckCircle, Lightbulb } from "lucide-react";
import type { ClauseAnalysis } from "./types";
import { RISK_CONFIG } from "./types";
import { cleanText, formatClauseText } from "./textUtils";

function ClauseRiskIcon({ level, size = 18 }: { level: string; size?: number }) {
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

interface ClauseCardProps {
  clause: ClauseAnalysis;
  isActive?: boolean;
  onSelect?: (clauseText: string | null) => void;
}

export function ClauseCard({ clause, isActive, onSelect }: ClauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = RISK_CONFIG[clause.risk_level];

  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    onSelect?.(willExpand ? clause.clause_text : null);
  };

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${config.border} ${config.bg} ${
        isActive ? "ring-2 ring-primary-orange ring-offset-1" : ""
      }`}
    >
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 text-left hover:opacity-90 transition-opacity"
      >
        {/* Risk icon */}
        <div className="flex-shrink-0">
          <ClauseRiskIcon level={clause.risk_level} size={20} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${config.badge}`}>
              {config.label}
            </span>
            <span className="text-[11px] text-neutral-gray">
              {clause.risk_score}/10
            </span>
          </div>
          <p className={`font-medium text-xs sm:text-sm ${config.color} line-clamp-1 leading-snug`}>
            Klausa {clause.clause_index}: {cleanText(clause.summary).split(/[.!?]/)[0]}
          </p>
        </div>

        {/* Expand */}
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronUp size={18} className="text-neutral-gray" />
          ) : (
            <ChevronDown size={18} className="text-neutral-gray" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2.5 sm:px-3.5 pb-2.5 sm:pb-3.5 space-y-3 border-t border-gray-200/50 pt-2.5 sm:pt-3">
          {/* Clause text */}
          <div>
            <h4 className="text-[11px] font-semibold text-neutral-gray uppercase mb-1.5">
              Teks Klausa
            </h4>
            <div className="text-xs text-dark-navy bg-white/60 rounded-lg p-2.5 leading-relaxed whitespace-pre-line">
              {formatClauseText(clause.clause_text)}
            </div>
          </div>

          {/* Issues */}
          {clause.issues.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-neutral-gray uppercase mb-1.5 flex items-center gap-1">
                <AlertTriangle size={12} />
                Masalah Ditemukan
              </h4>
              <ul className="space-y-1">
                {clause.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-dark-navy flex items-start gap-2 leading-relaxed">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{cleanText(issue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {clause.recommendations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-neutral-gray uppercase mb-1.5 flex items-center gap-1">
                <Lightbulb size={12} />
                Rekomendasi
              </h4>
              <ul className="space-y-1">
                {clause.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-dark-navy flex items-start gap-2 leading-relaxed">
                    <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{cleanText(rec)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Matched regulations */}
          {clause.matched_regulations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-neutral-gray uppercase mb-1.5 flex items-center gap-1">
                <BookOpen size={12} />
                Regulasi Terkait
              </h4>
              <div className="space-y-1.5">
                {clause.matched_regulations
                  .filter((r) => r.similarity_score > 0.5)
                  .slice(0, 5)
                  .map((reg, i) => (
                    <div key={i} className="bg-white/60 rounded-lg p-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="font-medium text-dark-navy">
                          {cleanText(reg.source)}
                        </span>
                        <span className="text-[10px] text-neutral-gray flex-shrink-0">
                          {(reg.similarity_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      {reg.pasal_ref && (
                        <p className="text-[11px] text-primary-orange font-medium mb-0.5">
                          {cleanText(reg.pasal_ref)}
                        </p>
                      )}
                      {reg.content_snippet && (
                        <p className="text-[11px] text-neutral-gray line-clamp-2 leading-relaxed">
                          {cleanText(reg.content_snippet)}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
