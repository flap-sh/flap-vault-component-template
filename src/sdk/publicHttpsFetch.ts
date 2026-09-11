import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export function isBlockedPublicResourceIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isBlockedIpv4(normalized.slice("::ffff:".length));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function assertPublicHttpsUrl(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("NFT metadata resources must use credential-free HTTPS.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("NFT metadata resource host is not allowed.");
  }
  if (isIP(hostname) && isBlockedPublicResourceIp(hostname)) {
    throw new Error("NFT metadata resource host is not public.");
  }
  return hostname;
}

async function resolvePublicAddress(hostname: string) {
  if (isIP(hostname)) return { address: hostname, family: isIP(hostname) as 4 | 6 };
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedPublicResourceIp(entry.address))) {
    throw new Error("NFT metadata resource host did not resolve to public addresses.");
  }
  return addresses.find((entry) => entry.family === 4) ?? addresses[0];
}

/**
 * HTTPS-only fetch whose socket lookup returns the already validated address.
 * The TLS server name and Host header remain the original hostname, while a
 * second DNS lookup cannot redirect the connection to a private address.
 */
export async function fetchPublicHttps(input: URL | RequestInfo, init: RequestInit = {}): Promise<Response> {
  const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
  const hostname = assertPublicHttpsUrl(url);
  const resolved = await resolvePublicAddress(hostname);
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" || init.body) throw new Error("NFT metadata resource fetch supports GET only.");

  return await new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      signal: init.signal ?? undefined,
      lookup: (_lookupHostname, options, callback) => {
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: resolved.address, family: resolved.family }]);
          return;
        }
        callback(null, resolved.address, resolved.family);
      },
    }, (response) => {
      const status = response.statusCode ?? 502;
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      const body = status === 204 || status === 205 || status === 304
        ? null
        : (Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>);
      resolve(new Response(body, { status, headers }));
    });
    request.on("error", reject);
    request.end();
  });
}
