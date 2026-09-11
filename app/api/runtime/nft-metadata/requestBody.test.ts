import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension here.
// @ts-expect-error allowImportingTsExtensions is intentionally not global.
import { RequestBodyTooLargeError, readBoundedRequestBody } from "./requestBody.ts";

function chunkedRequest(chunks: Uint8Array[]) {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: { headers: new Headers(), body } as Request,
    wasCancelled: () => cancelled,
  };
}

test("rejects a chunked request as soon as it exceeds the byte limit", async () => {
  const source = chunkedRequest([new TextEncoder().encode("1234"), new TextEncoder().encode("5678")]);
  await assert.rejects(readBoundedRequestBody(source.request, 7), RequestBodyTooLargeError);
  assert.equal(source.wasCancelled(), true);
});

test("reassembles a bounded UTF-8 request", async () => {
  const bytes = new TextEncoder().encode('{"name":"审计"}');
  const source = chunkedRequest([bytes.slice(0, 8), bytes.slice(8)]);
  assert.equal(await readBoundedRequestBody(source.request, bytes.byteLength), '{"name":"审计"}');
});
