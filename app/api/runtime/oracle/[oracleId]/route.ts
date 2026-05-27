import { NextRequest, NextResponse } from "next/server";
import { loadDefaultRuntimeOracle, loadRuntimeOracle, parseRuntimeOracleRegistry } from "@/src/sdk/server";

export const dynamic = "force-dynamic";

const oracleRegistry = (() => {
  try {
    return parseRuntimeOracleRegistry(process.env.FLAP_RUNTIME_ORACLE_REGISTRY);
  } catch (error) {
    console.error("runtime oracle registry config failed:", error);
    return {};
  }
})();

function readOracleParams(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: NextRequest, { params }: { params: { oracleId: string } }) {
  const oracleId = params.oracleId?.trim();
  if (!oracleId) {
    return NextResponse.json(
      {
        error: "Expected oracleId route param.",
      },
      { status: 400 },
    );
  }

  try {
    const defaultData = loadDefaultRuntimeOracle(oracleId);
    if (defaultData !== null) {
      return NextResponse.json(defaultData);
    }

    const data = await loadRuntimeOracle({
      oracleId,
      params: readOracleParams(request.nextUrl.searchParams),
      registry: oracleRegistry,
    });

    if (data === null) {
      return NextResponse.json(
        {
          error: `Oracle ${oracleId} is not provisioned by the runtime default registry.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(`runtime oracle proxy failed for ${oracleId}:`, error);
    return NextResponse.json(
      {
        error: `Failed to load oracle ${oracleId}.`,
      },
      { status: 502 },
    );
  }
}
