"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MessageCircle, X } from "lucide-react";
import type { ChatMessage, AnalysisResponse } from "./types";
import { parseChatBlocks, parseInlineMarkdown } from "./textUtils";

interface ChatPanelProps {
  analysisId: string;
  analysisResult?: AnalysisResponse | null;
  isOpen: boolean;
  onToggle: () => void;
  initialRemainingChats?: number | null;
}

// Agent flow states for post-limit consultation booking
type AgentState =
  | "chat"           // normal AI chat
  | "offered"        // bot offered consultation, waiting for interest
  | "collect_name"   // collecting name
  | "collect_email"  // collecting email
  | "collect_wa"     // collecting WhatsApp
  | "done";          // flow complete

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

function InlineText({ text }: { text: string }) {
  const segments = parseInlineMarkdown(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.bold) return <strong key={i} className="font-semibold">{seg.text}</strong>;
        if (seg.italic) return <em key={i}>{seg.text}</em>;
        if (seg.code) return <code key={i} className="bg-black/10 px-1 py-0.5 rounded text-xs font-mono">{seg.text}</code>;
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}

function RichMessage({ content }: { content: string }) {
  const blocks = parseChatBlocks(content);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "bullet") {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-primary-orange mt-0.5 flex-shrink-0">•</span>
                  <span><InlineText text={item} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered") {
          return (
            <ol key={i} className="space-y-1.5 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-primary-orange font-semibold flex-shrink-0">{j + 1}.</span>
                  <span><InlineText text={item} /></span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i}><InlineText text={block.content} /></p>;
      })}
    </div>
  );
}

const OFFER_MESSAGE = `Batas chat gratis Anda telah tercapai untuk analisis ini. 🙏

Namun jangan khawatir — tim konsultan hukum kami siap membantu Anda memahami kontrak ini lebih dalam, termasuk:

• **Review mendalam** seluruh klausa bermasalah
• **Rekomendasi revisi** yang bisa Anda ajukan
• **Pendampingan negosiasi** dengan pihak lawan

Konsultasi awal **gratis** dan tanpa kewajiban. Tertarik untuk dijadwalkan?`;

const THANKS_MESSAGE = "Terima kasih! Semoga analisis ini membantu Anda. Jika berubah pikiran, Anda bisa kembali kapan saja. 😊";
const ASK_NAME = "Baik, senang sekali! 😊 Untuk menjadwalkan konsultasi, boleh saya tahu **nama lengkap** Anda?";
const ASK_EMAIL = "Terima kasih, {name}! Sekarang, boleh saya minta **alamat email** Anda untuk mengirimkan detail jadwal?";
const ASK_WA = "Satu lagi — boleh minta **nomor WhatsApp** Anda? Tim kami akan menghubungi Anda via WhatsApp untuk konfirmasi jadwal.";
const DONE_MESSAGE = `Sempurna! Data Anda sudah kami catat:

• **Nama:** {name}
• **Email:** {email}
• **WhatsApp:** {wa}

Tim konsultan hukum kami akan menghubungi Anda dalam **1x24 jam** untuk menjadwalkan konsultasi. Terima kasih telah mempercayakan TanyaHukum! 🙏`;

export function ChatPanel({ analysisId, analysisResult, isOpen, onToggle, initialRemainingChats }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingChats, setRemainingChats] = useState<number | null>(initialRemainingChats ?? null);
  const [limitReached, setLimitReached] = useState(initialRemainingChats !== null && initialRemainingChats !== undefined && initialRemainingChats <= 0);
  const [agentState, setAgentState] = useState<AgentState>(
    initialRemainingChats !== null && initialRemainingChats !== undefined && initialRemainingChats <= 0 ? "offered" : "chat"
  );
  const [contactInfo, setContactInfo] = useState({ name: "", email: "", wa: "" });
  const offerShown = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When limit is reached, show the offer message
  useEffect(() => {
    if (limitReached && !offerShown.current) {
      offerShown.current = true;
      setAgentState("offered");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: OFFER_MESSAGE },
      ]);
    }
  }, [limitReached]);

  const addBotMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
  }, []);

  // Handle agent flow button clicks and text input during agent flow
  const handleAgentInput = useCallback((userText: string) => {
    addUserMessage(userText);

    if (agentState === "offered") {
      const interested = userText.toLowerCase().includes("tertarik") && !userText.toLowerCase().includes("tidak");
      if (interested) {
        setAgentState("collect_name");
        setTimeout(() => addBotMessage(ASK_NAME), 400);
      } else {
        setAgentState("done");
        setTimeout(() => addBotMessage(THANKS_MESSAGE), 400);
      }
    } else if (agentState === "collect_name") {
      setContactInfo((prev) => ({ ...prev, name: userText }));
      setAgentState("collect_email");
      setTimeout(() => addBotMessage(ASK_EMAIL.replace("{name}", userText)), 400);
    } else if (agentState === "collect_email") {
      setContactInfo((prev) => ({ ...prev, email: userText }));
      setAgentState("collect_wa");
      setTimeout(() => addBotMessage(ASK_WA), 400);
    } else if (agentState === "collect_wa") {
      const info = { ...contactInfo, wa: userText };
      setContactInfo(info);
      setAgentState("done");
      setTimeout(() => addBotMessage(
        DONE_MESSAGE.replace("{name}", info.name).replace("{email}", info.email).replace("{wa}", info.wa)
      ), 400);
      // TODO: In the future, send contact info to backend for scheduling
    }
  }, [agentState, contactInfo, addBotMessage, addUserMessage]);

  // Send message — either to API (normal chat) or agent flow (post-limit)
  const sendMessage = async (directText?: string) => {
    const text = directText || input.trim();
    if (!text || loading) return;
    if (!directText) setInput("");

    // If in agent flow (post-limit), handle locally
    if (agentState !== "chat") {
      handleAgentInput(text);
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
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
          { role: "assistant", content: `Error: ${typeof data.detail === "string" ? data.detail : "Terjadi kesalahan"}` },
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

  // Placeholder for agent input field
  const getInputPlaceholder = () => {
    switch (agentState) {
      case "collect_name": return "Ketik nama lengkap Anda...";
      case "collect_email": return "Ketik alamat email Anda...";
      case "collect_wa": return "Ketik nomor WhatsApp Anda...";
      default: return "Ketik pertanyaan...";
    }
  };

  const isInputDisabled = agentState === "done" || (agentState === "offered");

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
        {messages.length === 0 && agentState === "chat" && (
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
                  onClick={() => sendMessage(suggestion)}
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
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary-orange text-white rounded-br-md whitespace-pre-line"
                  : "bg-gray-100 text-dark-navy rounded-bl-md"
              }`}
            >
              {msg.role === "user" ? msg.content : <RichMessage content={msg.content} />}
            </div>
          </div>
        ))}

        {/* Quick action buttons for agent offer state */}
        {agentState === "offered" && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
          <div className="flex gap-2 justify-start pl-2">
            <button
              onClick={() => handleAgentInput("Saya tertarik")}
              className="text-xs px-4 py-2 bg-primary-orange text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors"
            >
              ✅ Saya Tertarik
            </button>
            <button
              onClick={() => handleAgentInput("Saya tidak tertarik")}
              className="text-xs px-4 py-2 bg-gray-200 text-dark-navy rounded-xl font-semibold hover:bg-gray-300 transition-colors"
            >
              Tidak, Terima Kasih
            </button>
          </div>
        )}

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
        {isInputDisabled ? (
          <div className="text-center py-2">
            <p className="text-xs text-neutral-gray">
              {agentState === "done"
                ? "Terima kasih! Tim kami akan segera menghubungi Anda."
                : "Pilih salah satu opsi di atas."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => { if (e.target.value.length <= 2000) setInput(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
                placeholder={getInputPlaceholder()}
                rows={1}
                maxLength={2000}
                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/30 resize-none overflow-y-auto"
                style={{ maxHeight: "120px" }}
                aria-label="Pertanyaan chat"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-10 h-10 flex-shrink-0 bg-primary-orange text-white rounded-xl flex items-center justify-center hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-neutral-gray text-left flex-1">
                Bukan nasihat hukum. Konsultasikan dengan pengacara.
              </p>
              {remainingChats !== null && agentState === "chat" && (
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
