import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // M-11: Whitelist expected fields before forwarding
    const { message, analysis_id, analysis_context, conversation_history } = body;
    const sanitized = { message, analysis_id, analysis_context, conversation_history };

    const res = await fetch("http://localhost:8000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(sanitized),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "Chat gagal" }));
      return NextResponse.json(data, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
