import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "";

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const authorization = req.headers.get("authorization");

    const res = await fetch("http://localhost:8000/api/analyze", {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: formData,
      signal: AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "Analisis gagal" }));
      return NextResponse.json(data, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
