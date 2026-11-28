import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { collectCardImageMediaUsage } from "./card-image-media-policy.mjs";

const FILE = "src/vaults/fixture/Component.tsx";
const CARD = "https://8nothtoc5ds7a0x3.public.blob.vercel-storage.com/graded-cards-renders/card.webp";
const IMPORTS = 'import { CardImage as CardArt, useCardImageBitmap as useCardBitmap } from "@/src/ui";';

function scan(source, options = { allowBitmap: true }) {
  const file = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return collectCardImageMediaUsage(file, FILE, options);
}

test("Card image policy recognizes trusted aliases and exempts only directly supplied URL literals", () => {
  const source = [
    IMPORTS,
    "// 中文 card fixture",
    "const Thumbnail = <CardArt src=" + JSON.stringify(CARD) + ' alt={i18n.t("card.alt")} />;',
    "const textureImage = useCardBitmap((" + JSON.stringify(CARD) + " as string));",
    "const raw = useTexture(" + JSON.stringify(CARD) + ");",
  ].join("\r\n");
  const result = scan(source);
  assert.deepEqual(result.issues, []);
  assert.equal(result.hasApprovedUsage, true);
  assert.deepEqual(result.imageTagStarts, [source.indexOf("<CardArt")]);
  const literalStarts = [...source.matchAll(/"https:/g)].map((match) => match.index);
  assert.deepEqual(result.allowedUrlRanges, literalStarts.slice(0, 2).map(
    (start) => [start, start + JSON.stringify(CARD).length],
  ));
});

test("Card image policy accepts dynamic result fields without approving other URLs or their expressions", () => {
  const source = [
    IMPORTS,
    "const Card = <CardArt src={result?.imageUrl} alt={label} fallback={placeholder} className={cardClass} />;",
    "const data = useCardBitmap(result?.imageUrl);",
    "const fallback = <CardArt src={maybeLoad(" + JSON.stringify(CARD) + ')} alt={label} />;',
    "const constant = " + JSON.stringify(CARD) + ";",
    "const reused = <CardArt src={constant} alt={label} />;",
    "const raw = useTexture(constant);",
  ].join("\n");
  const result = scan(source);
  assert.deepEqual(result.issues, []);
  assert.equal(result.hasApprovedUsage, true);
  assert.deepEqual(result.allowedUrlRanges, []);
});

test("Card image policy rejects untrusted bindings and shadowed imports", () => {
  for (const source of [
    'import type { CardImage } from "@/src/ui"; const element = <CardImage src={url} alt={label} />;',
    'import * as Ui from "@/src/ui"; const element = <Ui.CardImage src={url} alt={label} />;',
    'import { CardImage as CardArt } from "./lookalike"; const element = <CardArt src={url} alt={label} />;',
    IMPORTS + " function preview(CardArt) { return <CardArt src={url} alt={label} />; }",
    IMPORTS + " function preview(useCardBitmap) { return useCardBitmap(url); }",
    'import * as Ui from "@/src/ui"; const bitmap = Ui["useCardImageBitmap"](url);',
  ]) {
    const result = scan(source);
    assert.equal(result.issues.length, 1, source);
    assert.equal(result.hasApprovedUsage, false, source);
    assert.deepEqual(result.allowedUrlRanges, [], source);
  }
});

test("Card image policy rejects unrestricted image props and literal unapproved URLs", () => {
  for (const use of [
    "<CardArt src={url} alt />",
    "<CardArt src={url} />",
    "<CardArt src={url} alt={label} src={other} />",
    "<CardArt src={url} alt={label} {...other} />",
    "<CardArt src={url} alt={label} srcSet={other} />",
    "<CardArt src={url} alt={label}>text</CardArt>",
    '<CardArt src="https://example.com/graded-cards-renders/card.webp" alt={label} />',
    '<CardArt src="https://8nothtoc5ds7a0x3.public.blob.vercel-storage.com/other/card.webp" alt={label} />',
    '<CardArt src={src} alt={label} />; const src = "/relative.webp"',
  ]) {
    const result = scan(IMPORTS + " const card = " + use + ";");
    assert.equal(result.issues[0]?.ruleId, "media-policy/invalid-card-image", use);
    assert.equal(result.hasApprovedUsage, false, use);
    assert.deepEqual(result.allowedUrlRanges, [], use);
  }
});

test("Card bitmap accepts one explicit URL in the 3D capability", () => {
  const good = IMPORTS + " const bitmap = useCardBitmap(url);";
  assert.equal(scan(good, { allowBitmap: false }).issues[0]?.ruleId, "media-policy/invalid-card-bitmap");
  assert.equal(scan(good).hasApprovedUsage, true);

  for (const call of [
    "useCardBitmap()",
    "useCardBitmap(url, options)",
    "useCardBitmap(...urls)",
    'useCardBitmap("https://example.com/card.png")',
  ]) {
    const result = scan(IMPORTS + " const bitmap = " + call + ";");
    assert.equal(result.issues[0]?.ruleId, "media-policy/invalid-card-bitmap", call);
    assert.equal(result.hasApprovedUsage, false, call);
  }
});

test("Card image policy does not approve raw loaders or unused imports", () => {
  const source = IMPORTS + " const raw = useTexture(" + JSON.stringify(CARD) + ");";
  assert.deepEqual(scan(source), { issues: [], allowedUrlRanges: [], imageTagStarts: [], hasApprovedUsage: false });
});
