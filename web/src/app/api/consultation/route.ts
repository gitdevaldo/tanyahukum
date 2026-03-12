import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { name, email, whatsapp, analysis_id } = body;
    const sanitized = { name, email, whatsapp, analysis_id };

    const res = await fetch("http://localhost:8000/api/consultation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(sanitized),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({ detail: "Consultation request failed" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
