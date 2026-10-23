import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node type stripping requires source extensions.
import { MAX_COPY_TEXT_LENGTH, isCopyableText, writeCopyText } from "./copyText.ts";
// @ts-expect-error Node type stripping requires source extensions.
import { getCopyButtonMessages } from "./copyButtonMessages.ts";

test("only bounded nonempty plain text is copyable", () => {
  for (const value of [undefined, null, 1, {}, "", " ", "x".repeat(MAX_COPY_TEXT_LENGTH + 1), "a\0b"]) assert.equal(isCopyableText(value), false);
  for (const value of ["0x123", "中文", "a\nb", "x".repeat(MAX_COPY_TEXT_LENGTH)]) assert.equal(isCopyableText(value), true);
});

test("long skills.md and Unicode use the same UTF-16 bound without truncation", () => {
  assert.equal(MAX_COPY_TEXT_LENGTH, 1_048_576);
  const markdown = "# skills.md\n\n中文说明 🦋\n```ts\nconst task = 'copy all';\n```\n".repeat(1_000);
  assert.ok(markdown.length > 4096);
  assert.equal(isCopyableText(markdown), true);
  assert.equal(isCopyableText("中文".repeat(MAX_COPY_TEXT_LENGTH / 2)), true);
  assert.equal(isCopyableText("🦋".repeat(MAX_COPY_TEXT_LENGTH / 2)), true);
  assert.equal(isCopyableText("🦋".repeat(MAX_COPY_TEXT_LENGTH / 2) + "x"), false);
  assert.equal(isCopyableText(" ".repeat(MAX_COPY_TEXT_LENGTH)), false);
  assert.equal(isCopyableText(markdown + "\0"), false);
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
