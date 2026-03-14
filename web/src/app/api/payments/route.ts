import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization) {
      return NextResponse.json({ detail: "Bearer token diperlukan." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const res = await fetch("http://localhost:8000/api/payments/checkout", {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });

    const data = await res.json().catch(() => ({ detail: "Permintaan pembayaran gagal." }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
