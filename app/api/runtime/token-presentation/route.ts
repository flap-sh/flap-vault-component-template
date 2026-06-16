import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { loadFlapHostTokenPresentation, loadFlapHostTokenPresentationBatch } from "@/src/sdk/hostPresentation";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 20;

function parseChainId(value: string | null) {
  const chainId = Number(value);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : null;
}

function parseAddress(value: string | null) {
  return value && isAddress(value) ? (getAddress(value) as `0x${string}`) : null;
}

function flapHostOriginFromEnv() {
  const origin = process.env.FLAP_RUNTIME_HOST_ORIGIN?.trim();
  return origin ? origin.replace(/\/+$/, "") : undefined;
}

export async function GET(request: NextRequest) {
  const chainId = parseChainId(request.nextUrl.searchParams.get("chainId"));
  const tokenAddress = parseAddress(request.nextUrl.searchParams.get("tokenAddress"));

  if (!chainId || !tokenAddress) {
    return NextResponse.json(
      {
        error: "Expected valid chainId and tokenAddress query params.",
      },
      { status: 400 },
    );
  }

  try {
    const data = await loadFlapHostTokenPresentation({
      chainId,
      tokenAddress,
      flapHostOrigin: flapHostOriginFromEnv(),
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("runtime token presentation proxy failed:", error);
    return NextResponse.json(
      {
        error: "Failed to load host token presentation.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Expected JSON request body.",
      },
      { status: 400 },
    );
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const chainId = parseChainId(typeof record?.chainId === "number" || typeof record?.chainId === "string" ? String(record?.chainId) : null);
  const tokenAddresses = Array.isArray(record?.tokenAddresses) ? record?.tokenAddresses.map((value) => parseAddress(typeof value === "string" ? value : null)).filter((value): value is `0x${string}` => Boolean(value)) : [];

  if (!chainId || tokenAddresses.length === 0 || tokenAddresses.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      {
        error: `Expected chainId plus between 1 and ${MAX_BATCH_SIZE} valid token addresses.`,
      },
      { status: 400 },
    );
  }

  try {
    const data = await loadFlapHostTokenPresentationBatch({
      chainId,
      tokenAddresses,
      flapHostOrigin: flapHostOriginFromEnv(),
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("runtime token presentation batch proxy failed:", error);
    return NextResponse.json(
      {
        error: "Failed to load host token presentation batch.",
      },
      { status: 502 },
    );
  }
}
