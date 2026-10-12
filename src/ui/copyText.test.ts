import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node type stripping requires source extensions.
import { isCopyableText, writeCopyText } from "./copyText.ts";
// @ts-expect-error Node type stripping requires source extensions.
import { getCopyButtonMessages } from "./copyButtonMessages.ts";

test("only bounded nonempty plain text is copyable", () => {
  for (const value of [undefined, null, 1, {}, "", " ", "x".repeat(4097), "a\0b"]) assert.equal(isCopyableText(value), false);
  for (const value of ["0x123", "中文", "a\nb", "x".repeat(4096)]) assert.equal(isCopyableText(value), true);
});

test("copy is harmless during server rendering", async () => {
  assert.equal(await writeCopyText("0x123"), false);
  assert.equal(await writeCopyText(""), false);
});

test("English, Chinese and Korean defaults have aligned keys", () => {
  const en = getCopyButtonMessages("en");
  for (const locale of ["zh-CN", "ko-KR"]) assert.deepEqual(Object.keys(getCopyButtonMessages(locale)), Object.keys(en));
  assert.equal(getCopyButtonMessages("zh_CN").copy, "复制");
  assert.equal(getCopyButtonMessages("ko").copy, "복사");
  assert.equal(getCopyButtonMessages("fr").copy, "Copy");
});
