#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import { failAgent } from "./agent-error.mjs";

const ROOT = process.cwd();
const DEFAULT_OFFICIAL_REF = "origin/main";
const OFFICIAL_REF = process.env.FLAP_TEMPLATE_FRESHNESS_REF?.trim() || DEFAULT_OFFICIAL_REF;

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function gitSucceeds(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    stdio: "ignore",
  });
  return result.status === 0;
}

function failFreshness({ code, message, fixHint, folderName, extra = {} }) {
  failAgent({
    code,
    message,
    fixHint,
    nextActions: [
      {
        ruleId: code,
        severity: "blocking",
        fixHint,
      },
    ],
    extra: {
      folderName,
      officialRef: OFFICIAL_REF,
      ...extra,
    },
  });
}

function remoteFromRef(ref) {
  const [remote] = ref.split("/");
  return remote || "origin";
}

export function assertTemplateFresh({ folderName } = {}) {
  if (!gitSucceeds(["rev-parse", "--is-inside-work-tree"])) {
    failFreshness({
      code: "template-freshness/not-git-repo",
      message: "Cannot confirm template freshness because this directory is not a git repository.",
      fixHint: "Run yarn vault:package from the official flap-vault-ui-template git checkout.",
      folderName,
    });
  }

  const remote = remoteFromRef(OFFICIAL_REF);
  try {
    git(["fetch", "--quiet", remote]);
  } catch (error) {
    failFreshness({
      code: "template-freshness/fetch-failed",
      message: `Cannot confirm template freshness because git fetch ${remote} failed.`,
      fixHint: "Fix git/network access, run git pull --ff-only, then rerun yarn vault:package <folder-name>.",
      folderName,
      extra: {
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }

  let head;
  let official;
  try {
    head = git(["rev-parse", "HEAD"]);
    official = git(["rev-parse", "--verify", OFFICIAL_REF]);
  } catch (error) {
    failFreshness({
      code: "template-freshness/ref-missing",
      message: `Cannot resolve official template ref ${OFFICIAL_REF}.`,
      fixHint: "Set the official upstream ref or run from a checkout that tracks origin/main.",
      folderName,
      extra: {
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (head === official) return { ok: true, officialRef: OFFICIAL_REF, status: "up-to-date" };

  if (gitSucceeds(["merge-base", "--is-ancestor", official, head])) {
    return { ok: true, officialRef: OFFICIAL_REF, status: "ahead-of-official" };
  }

  const isBehind = gitSucceeds(["merge-base", "--is-ancestor", head, official]);
  failFreshness({
    code: isBehind ? "template-freshness/behind" : "template-freshness/diverged",
    message: isBehind
      ? `This flap-vault-ui-template checkout is behind ${OFFICIAL_REF}.`
      : `This flap-vault-ui-template checkout does not contain the latest ${OFFICIAL_REF} commits.`,
    fixHint: "Run git pull --ff-only, then rerun yarn vault:package <folder-name>.",
    folderName,
    extra: {
      head,
      official,
      status: isBehind ? "behind" : "diverged",
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(assertTemplateFresh({ folderName: process.argv[2] }), null, 2));
}
