export interface ClauseAnalysis {
  clause_text: string;
  risk_level: "high" | "medium" | "low";
  issue: string;
  explanation: string;
  relevant_regulations: RegulationRef[];
  recommendation: string;
}

export interface RegulationRef {
  doc_id: string;
  source: string;
  pasal_ref: string;
  relevance_score: number;
}

export interface AnalysisResult {
  document_title: string;
  overall_risk: "high" | "medium" | "low";
  summary: string;
  clauses: ClauseAnalysis[];
  total_clauses: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
