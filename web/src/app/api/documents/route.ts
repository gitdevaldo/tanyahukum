import { NextRequest, NextResponse } from "next/server";

function getAuthorization(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "Bearer token diperlukan." }, { status: 401 });
  }
  return authorization;
}

export async function GET(req: NextRequest) {
  try {
    const authorization = getAuthorization(req);
    if (authorization instanceof NextResponse) return authorization;

    const backendUrl = new URL("http://localhost:8000/api/documents");
    const limit = req.nextUrl.searchParams.get("limit");
    if (limit) {
      backendUrl.searchParams.set("limit", limit);
    }

    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json().catch(() => ({ detail: "Gagal mengambil daftar dokumen." }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
