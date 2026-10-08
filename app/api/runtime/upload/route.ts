import { createRuntimeUploadHandler } from "@/src/sdk/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = createRuntimeUploadHandler({
  pinataJwt: process.env.PINATA_JWT,
  upstreamOrigin: process.env.FLAP_RUNTIME_HOST_ORIGIN?.trim() || "https://flap.sh",
});
