import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizedSourceSha256(filePath: string) {
  const source = fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

export async function GET(request: NextRequest) {
  const folderName = request.nextUrl.searchParams.get("folderName") ?? "";
  if (!FOLDER_NAME_RE.test(folderName)) {
    return NextResponse.json({ error: "Invalid folderName." }, { status: 400 });
  }
  const componentPath = path.join(process.cwd(), "src", "vaults", folderName, "Component.tsx");
  if (!fs.existsSync(componentPath)) {
    return NextResponse.json({ error: "Vault component not found." }, { status: 404 });
  }
  return NextResponse.json({ folderName, componentSha256: normalizedSourceSha256(componentPath) });
}
