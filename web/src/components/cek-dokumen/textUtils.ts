/**
 * Strip markdown formatting from LLM output for clean display.
 */
export function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")   // ***bold italic***
    .replace(/\*\*(.*?)\*\*/g, "$1")         // **bold**
    .replace(/\*(.*?)\*/g, "$1")             // *italic*
    .replace(/__(.*?)__/g, "$1")             // __underline__
    .replace(/~~(.*?)~~/g, "$1")             // ~~strikethrough~~
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")   // `code` or ```code```
    .replace(/^#{1,6}\s+/gm, "")            // # headings
    .replace(/^\s*[-*+]\s+/gm, "• ")        // - list items → bullet
    .replace(/^\s*\d+\.\s+/gm, "• ")        // 1. numbered → bullet
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url) → link
    .replace(/\n{3,}/g, "\n\n")             // collapse excess newlines
    .trim();
}

/**
 * Split text into paragraphs for rendering.
 * Handles both \n\n paragraph breaks and single \n with bullet points.
 */
export function textToParagraphs(text: string): string[] {
  const cleaned = cleanText(text);
  return cleaned
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Structure raw clause text extracted from PDF.
 * Detects PASAL headings, numbered sub-clauses (1.1, 1.2),
 * and label:value pairs (Jabatan : X) to add proper line breaks.
 */
export function formatClauseText(text: string): string {
  if (!text) return "";

  let formatted = text;

  // Add line break BEFORE "PASAL" or "Pasal" headings (with — or -)
  formatted = formatted.replace(/\s+(PASAL\s+\d+)/g, "\n\n$1");
  formatted = formatted.replace(/\s+(Pasal\s+\d+)/g, "\n\n$1");

  // Add line break BEFORE numbered sub-clauses: "1.1 ", "2.3 ", "12.1 "
  // but not decimals like "150.000" (followed by digits or dot)
  formatted = formatted.replace(/\s+(\d{1,2}\.\d{1,2})\s+(?=[A-Z])/g, "\n$1 ");

  // Add line break BEFORE common label patterns: "Jabatan :", "Lokasi Kerja :", etc.
  formatted = formatted.replace(/\s+((?:Jabatan|Departemen|Lokasi\s+Kerja|Atasan\s+Langsung|Nama|Alamat|NIK|Gaji|Periode|Tanggal|Tempat)\s*:)/gi, "\n$1");

  // Add line break BEFORE letter-based sub-items: "a. ", "b) ", "(a) "
  formatted = formatted.replace(/\s+(\([a-z]\)\s)/g, "\n$1");
  formatted = formatted.replace(/\s+([a-z]\.\s)(?=[A-Z])/g, "\n$1");

  // Clean up excessive line breaks
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return formatted.trim();
}
