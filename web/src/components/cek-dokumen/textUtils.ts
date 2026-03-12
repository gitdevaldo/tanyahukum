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
 * Parse markdown-like LLM output into structured blocks for rich rendering.
 * Returns an array of block objects: paragraph, bullet, numbered.
 */
export type ChatBlock =
  | { type: "paragraph"; content: string }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: string[] };

export function parseChatBlocks(text: string): ChatBlock[] {
  if (!text) return [];

  const blocks: ChatBlock[] = [];
  const lines = text.split("\n");

  let currentBullets: string[] = [];
  let currentNumbered: string[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const content = currentParagraph.join("\n").trim();
      if (content) blocks.push({ type: "paragraph", content });
      currentParagraph = [];
    }
  };
  const flushBullets = () => {
    if (currentBullets.length > 0) {
      blocks.push({ type: "bullet", items: currentBullets });
      currentBullets = [];
    }
  };
  const flushNumbered = () => {
    if (currentNumbered.length > 0) {
      blocks.push({ type: "numbered", items: currentNumbered });
      currentNumbered = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Bullet: "- ", "* ", "+ ", "• "
    const bulletMatch = line.match(/^\s*[-*+•]\s+(.+)/);
    if (bulletMatch) {
      flushParagraph();
      flushNumbered();
      currentBullets.push(bulletMatch[1].trim());
      continue;
    }

    // Numbered: "1. ", "2) "
    const numMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (numMatch) {
      flushParagraph();
      flushBullets();
      currentNumbered.push(numMatch[1].trim());
      continue;
    }

    // Empty line — flush everything
    if (line.trim() === "") {
      flushBullets();
      flushNumbered();
      flushParagraph();
      continue;
    }

    // Regular text
    flushBullets();
    flushNumbered();
    currentParagraph.push(line);
  }

  flushBullets();
  flushNumbered();
  flushParagraph();

  return blocks;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`
 * Returns an array of React-friendly segments.
 */
export function parseInlineMarkdown(text: string): { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] {
  const segments: { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] = [];
  // Pattern: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) segments.push({ text: match[2], bold: true });
    else if (match[3]) segments.push({ text: match[3], italic: true });
    else if (match[4]) segments.push({ text: match[4], code: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
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
