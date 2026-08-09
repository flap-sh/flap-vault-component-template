import { NextRequest, NextResponse } from "next/server";
import { loadNftMetadata } from "@/src/sdk/server";
import { RequestBodyTooLargeError, readBoundedRequestBody } from "./requestBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024 + 128 * 1024;

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "NFT metadata request is too large." }, { status: 413 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Expected JSON request body." }, { status: 400 });
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const chainId = Number(record?.chainId);
  const tokenUri = typeof record?.tokenUri === "string" ? record.tokenUri : undefined;
  const imageUri = typeof record?.imageUri === "string" ? record.imageUri : undefined;
  if (!Number.isInteger(chainId) || chainId <= 0 || Boolean(tokenUri) === Boolean(imageUri)) {
    return NextResponse.json({ error: "Expected chainId plus exactly one tokenUri or imageUri." }, { status: 400 });
  }

  try {
    const data = await loadNftMetadata({ chainId, tokenUri, imageUri });
    const responseBody = JSON.stringify({ data });
    if (new TextEncoder().encode(responseBody).byteLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json({ error: "Resolved NFT metadata media is too large." }, { status: 502 });
    }
    return new NextResponse(responseBody, {
      headers: {
        "cache-control": "private, max-age=60",
        "content-type": "application/json",
      },
    });
  } catch (error) {
    console.error("runtime NFT metadata proxy failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Failed to resolve NFT metadata media." }, { status: 502 });
  }
}
