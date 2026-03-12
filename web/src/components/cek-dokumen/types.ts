export interface RegulationRef {
  source: string;
  pasal_ref: string;
  content_snippet: string;
  similarity_score: number;
}

export interface ClauseAnalysis {
  clause_index: number;
  clause_text: string;
  risk_level: "high" | "medium" | "low" | "safe";
  risk_score: number;
  summary: string;
  issues: string[];
  recommendations: string[];
  matched_regulations: RegulationRef[];
}

export interface AnalysisResponse {
  analysis_id: string;
  filename: string;
  overall_risk: "high" | "medium" | "low" | "safe";
  overall_score: number;
  total_clauses: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  safe_count: number;
  summary: string;
  clauses: ClauseAnalysis[];
  disclaimer: string;
  analyzed_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const RISK_CONFIG = {
  high: {
    label: "BERISIKO TINGGI",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800",
    icon: "🔴",
  },
  medium: {
    label: "PERHATIAN",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-800",
    icon: "🟡",
  },
  low: {
    label: "RENDAH",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-800",
    icon: "🔵",
  },
  safe: {
    label: "AMAN",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-800",
    icon: "🟢",
  },
} as const;
