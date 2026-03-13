import { NextRequest, NextResponse } from "next/server";

const DOCUMENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

function getAuthorization(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "Bearer token diperlukan." }, { status: 401 });
  }
  return authorization;
}

function isPdfRoute(segments: string[]) {
  return (
    (segments.length === 3 && segments[1] === "certificate" && segments[2] === "pdf") ||
    (segments.length === 2 && segments[1] === "signed-pdf") ||
    (segments.length === 2 && segments[1] === "pdf")
  );
}

function isAllowedGetRoute(segments: string[]) {
  if (segments.length === 2 && DOCUMENT_ID_RE.test(segments[0])) {
    return ["signers", "events", "analysis", "certificate", "signed-pdf", "pdf"].includes(segments[1]);
  }
  return segments.length === 3
    && DOCUMENT_ID_RE.test(segments[0])
    && segments[1] === "certificate"
    && segments[2] === "pdf";
}

function isAllowedPostRoute(segments: string[]) {
  if (segments.length === 1) {
    return segments[0] === "share";
  }
  return (
    segments.length === 2
    && DOCUMENT_ID_RE.test(segments[0])
    && ["sign", "reject"].includes(segments[1])
  );
}

function backendUrlFor(segments: string[]) {
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `http://localhost:8000/api/documents/${encodedSegments.join("/")}`;
}

async function proxyGet(req: NextRequest, segments: string[]) {
  const authorization = getAuthorization(req);
  if (authorization instanceof NextResponse) return authorization;

  if (!isAllowedGetRoute(segments)) {
    return NextResponse.json({ detail: "Route dokumen tidak valid." }, { status: 400 });
  }

  const res = await fetch(backendUrlFor(segments), {
    method: "GET",
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(25000),
  });

  if (isPdfRoute(segments) && res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/pdf")) {
      const fileBuffer = await res.arrayBuffer();
      return new NextResponse(fileBuffer, {
        status: res.status,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            res.headers.get("content-disposition") ?? "attachment; filename=document.pdf",
        },
      });
    }
  }

  const data = await res.json().catch(() => ({ detail: "Permintaan dokumen gagal." }));
  return NextResponse.json(data, { status: res.status });
}

async function proxyPost(req: NextRequest, segments: string[]) {
  const authorization = getAuthorization(req);
  if (authorization instanceof NextResponse) return authorization;

  if (!isAllowedPostRoute(segments)) {
    return NextResponse.json({ detail: "Route dokumen tidak valid." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const res = await fetch(backendUrlFor(segments), {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json().catch(() => ({ detail: "Permintaan dokumen gagal." }));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  try {
    const { segments } = await params;
    return await proxyGet(req, segments);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  try {
    const { segments } = await params;
    return await proxyPost(req, segments);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
