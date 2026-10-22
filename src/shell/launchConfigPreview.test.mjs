import assert from "node:assert/strict";
import test from "node:test";
import { selectLaunchConfigPreviewBinding } from "./launchConfigPreview.ts";

const first = { chainId: 56, factoryAddress: `0x${"a".repeat(40)}`, tokenAddresses: [`0x${"1".repeat(40)}`] };
const second = { chainId: 97, factoryAddress: `0x${"b".repeat(40)}`, tokenAddresses: [`0x${"2".repeat(40)}`] };
const manifest = { match: { bindings: [first, second] } };
const select = (search, source = manifest) => selectLaunchConfigPreviewBinding(source, new URLSearchParams(search));

test("launch preview defaults only without runtime hints and selects the requested factory/chain", () => {
  assert.equal(select(""), first);
  assert.equal(select(`chainId=97&factoryAddress=${second.factoryAddress}&tokenAddress=${second.tokenAddresses[0]}`), second);
  assert.equal(select(`factory=${second.factoryAddress.toUpperCase().replace("0X", "0x")}`), second);
  assert.equal(select("chainId=97"), second);
});

test("launch preview fails closed on mismatched, malformed, empty and conflicting hints", () => {
  for (const search of [
    "chainId=1", "chainId=", "chainId=NaN", "chainId=-97", "chainId=97.5",
    `factoryAddress=${first.factoryAddress}&chainId=97`,
    `factoryAddress=${first.factoryAddress}&tokenAddress=${second.tokenAddresses[0]}`,
    `factoryAddress=${first.factoryAddress}&factory=${second.factoryAddress}`,
    "factoryAddress=", "factoryAddress=1000", `factoryAddress=0x${"0".repeat(40)}`,
    "tokenAddress=1000", "vaultAddress=1000", `vaultAddress=0x${"3".repeat(40)}`, `chainId=56&vaultAddress=0x${"3".repeat(40)}`,
  ]) assert.equal(select(search), null, search);
});

test("launch preview rejects ambiguous hints and never substitutes a token-only binding", () => {
  assert.equal(select("chainId=56", { match: { bindings: [first, { ...second, chainId: 56 }] } }), null);
  assert.equal(select(`factoryAddress=${second.factoryAddress}&tokenAddress=${second.tokenAddresses[0]}`, {
    match: { bindings: [first, { chainId: 97, tokenAddresses: second.tokenAddresses }] },
  }), null);
});
