import { NextRequest, NextResponse } from "next/server";

function getForwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};

  const authorization = req.headers.get("authorization");
  if (authorization) {
    headers.Authorization = authorization;
  }

  const passthroughHeaders: Array<[string, string]> = [
    ["x-mayar-webhook-token", "X-Mayar-Webhook-Token"],
    ["webhook-token", "Webhook-Token"],
    ["x-webhook-token", "X-Webhook-Token"],
    ["x-mayar-token", "X-Mayar-Token"],
  ];

  for (const [incoming, outgoing] of passthroughHeaders) {
    const value = req.headers.get(incoming);
    if (value) {
      headers[outgoing] = value;
    }
  }

  return headers;
}

async function proxyRequest(
  req: NextRequest,
  segments: string[],
  method: string,
) {
  const forwardHeaders = getForwardHeaders(req);
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  const backendUrl = `http://localhost:8000/api/${encodedSegments.join("/")}`;

  // Parse query string
  const queryString = req.nextUrl.searchParams.toString();
  const urlWithQuery = queryString ? `${backendUrl}?${queryString}` : backendUrl;

  try {
    const requestOptions: RequestInit = {
      method,
      headers: forwardHeaders,
      signal: AbortSignal.timeout(25000),
    };

    // Handle body for POST/PUT/PATCH
    if (method !== "GET" && method !== "HEAD") {
      const contentType = req.headers.get("content-type");
      forwardHeaders["Content-Type"] = contentType || "application/json";

      if (req.body) {
        const bodyText = await req.text();
        requestOptions.body = bodyText;
      }
    }

    const res = await fetch(urlWithQuery, requestOptions);
    const responseText = await res.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // If not JSON, return as is
      return new NextResponse(responseText, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("content-type") || "text/plain",
        },
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Proxy error";
    console.error(`[API Proxy Error] ${method} ${backendUrl}: ${message}`);
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  return proxyRequest(req, segments, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  return proxyRequest(req, segments, "POST");
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  return proxyRequest(req, segments, "PUT");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  return proxyRequest(req, segments, "PATCH");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  return proxyRequest(req, segments, "DELETE");
}
