"use client";

import { useState, useRef, useEffect } from "react";
import { Send, MessageCircle, X } from "lucide-react";
import type { ChatMessage, AnalysisResponse } from "./types";
import { cleanText } from "./textUtils";

interface ChatPanelProps {
  analysisId: string;
  analysisResult?: AnalysisResponse | null;
  isOpen: boolean;
  onToggle: () => void;
}

function buildAnalysisContext(result: AnalysisResponse): string {
  const lines: string[] = [];
  lines.push(`Dokumen: ${result.filename}`);
  lines.push(`Skor risiko keseluruhan: ${result.overall_score}/10`);
  lines.push(`Jumlah klausa: ${result.total_clauses}`);
  if (result.summary) lines.push(`Ringkasan: ${result.summary}`);
  lines.push("");
  for (const c of result.clauses) {
    lines.push(`--- Klausa ${c.clause_index} ---`);
    lines.push(`Tingkat risiko: ${c.risk_level} (skor ${c.risk_score}/10)`);
    lines.push(`Teks: ${c.clause_text.substring(0, 500)}`);
    if (c.summary) lines.push(`Analisis: ${c.summary}`);
    if (c.issues?.length) lines.push(`Masalah: ${c.issues.join("; ")}`);
    if (c.recommendations?.length) lines.push(`Rekomendasi: ${c.recommendations.join("; ")}`);
    if (c.matched_regulations?.length) {
      const refs = c.matched_regulations.map(r => `${r.source} ${r.pasal_ref}`).join(", ");
      lines.push(`Referensi hukum: ${refs}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function ChatPanel({ analysisId, analysisResult, isOpen, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingChats, setRemainingChats] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          analysis_id: analysisId,
          analysis_context: analysisResult ? buildAnalysisContext(analysisResult) : null,
          conversation_history: messages,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
        if (data.remaining_chats !== null && data.remaining_chats !== undefined) {
          setRemainingChats(data.remaining_chats);
          if (data.remaining_chats <= 0) {
            setLimitReached(true);
          }
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.detail || "Terjadi kesalahan"}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Gagal menghubungi server. Coba lagi." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 bg-primary-orange text-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-600 transition-colors z-50"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  return (
    <div className="fixed inset-4 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 sm:h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-dark-navy text-white rounded-t-2xl">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} />
          <span className="font-heading font-semibold text-sm">TanyaHukum Chat</span>
        </div>
        <button onClick={onToggle} className="hover:text-gray-300 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-gray">
              Tanyakan apa saja tentang hasil analisis dokumen Anda
            </p>
            <div className="mt-4 space-y-2">
              {[
                "Apa risiko terbesar di kontrak ini?",
                "Jelaskan pasal yang bermasalah",
                "Apa yang harus saya perhatikan?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="block w-full text-left text-xs px-3 py-2 bg-gray-50 rounded-lg text-neutral-gray hover:bg-orange-50 hover:text-primary-orange transition-colors"
                >
                  💬 {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                msg.role === "user"
                  ? "bg-primary-orange text-white rounded-br-md"
                  : "bg-gray-100 text-dark-navy rounded-bl-md"
              }`}
            >
              {msg.role === "user" ? msg.content : cleanText(msg.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100">
        {limitReached ? (
          <div className="text-center py-2">
            <p className="text-xs text-neutral-gray">Batas chat tercapai. Konsultasikan dengan konsultan hukum kami.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ketik pertanyaan..."
                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/30"
                aria-label="Pertanyaan chat"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-10 h-10 bg-primary-orange text-white rounded-xl flex items-center justify-center hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-neutral-gray text-center flex-1">
                Bukan nasihat hukum. Konsultasikan dengan pengacara.
              </p>
              {remainingChats !== null && (
                <p className={`text-[10px] flex-shrink-0 ml-2 ${remainingChats <= 3 ? "text-red-500" : "text-neutral-gray"}`}>
                  {remainingChats} chat tersisa
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
