/**
 * In-memory store for analysis results + PDF blob URL.
 * Persists across client-side navigations but NOT across page refresh.
 * On refresh, the results page fetches from the API instead.
 */
import type { AnalysisResponse } from "./types";

interface AnalysisData {
  result: AnalysisResponse;
  pdfUrl: string;
}

let _data: AnalysisData | null = null;

/** Store analysis result and PDF blob, return the analysis_id as the URL slug. */
export function storeAnalysis(result: AnalysisResponse, file: File): string {
  if (_data?.pdfUrl) {
    URL.revokeObjectURL(_data.pdfUrl);
  }
  const pdfUrl = URL.createObjectURL(file);
  _data = { result, pdfUrl };
  return result.analysis_id;
}

export function getAnalysis(): AnalysisData | null {
  return _data;
}

export function clearAnalysis(): void {
  if (_data?.pdfUrl) {
    URL.revokeObjectURL(_data.pdfUrl);
  }
  _data = null;
}
