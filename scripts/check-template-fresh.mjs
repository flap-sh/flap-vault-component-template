#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { failAgent } from "./agent-error.mjs";
import { readNpmPackageTagMetadata } from "./npm-registry.mjs";

import { templateReleasePolicy, assertOfficialPreviewRemote, assertPreviewTemplate } from "./template-release-channel.mjs";

const ROOT = process.cwd();
let CHANNEL_POLICY;
try { CHANNEL_POLICY = templateReleasePolicy(); }
catch (error) { failAgent({ code: "template-freshness/invalid-channel", message: error.message, fixHint: "Use the documented stable or App next commands." }); }
const OFFICIAL_REF = CHANNEL_POLICY.officialRef;
const NPM_PACKAGE_NAME = CHANNEL_POLICY.packageName;
const NPM_TAG = CHANNEL_POLICY.npmTag;
const DEFAULT_NPM_SYNC_ATTEMPTS = 3;
const DEFAULT_NPM_SYNC_DELAY_MS = 1_000;

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
      npmPackageName: NPM_PACKAGE_NAME,
      ...extra,
    },
  });
}

function remoteFromRef(ref) {
  const [remote] = ref.split("/");
  return remote || "origin";
}

function readRootPackageJson(folderName) {
  const packagePath = path.join(ROOT, "package.json");
  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch (error) {
    failFreshness({
      code: "template-freshness/package-json-unreadable",
      message: "Cannot confirm template freshness because package.json cannot be read.",
      fixHint: "Run the command from the flap-vault-ui-template repository root, then retry.",
      folderName,
      extra: {
        packagePath,
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrereleaseIdentifier(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);
  if (!left || !right) return null;

  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }

  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const compared = comparePrereleaseIdentifier(leftPart, rightPart);
    if (compared !== 0) return compared;
  }
  return 0;
}

async function npmLatestMetadata(folderName, readLatestMetadata = readNpmPackageTagMetadata) {
  try {
    const metadata = await readLatestMetadata(NPM_PACKAGE_NAME, NPM_TAG);
    return { version: metadata.version ?? "", gitHead: metadata.gitHead };
  } catch (error) {
    failFreshness({
      code: "template-freshness/npm-fetch-failed",
      message: `Cannot confirm template freshness because npm ${NPM_TAG} lookup failed for ${NPM_PACKAGE_NAME}.`,
      fixHint: "Fix npm registry/network access, update to the latest template package, then rerun the command.",
      folderName,
      extra: {
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function compareLocalPackageWithLatest(folderName, latestVersion) {
  const rootPackage = readRootPackageJson(folderName);
  const localVersion = rootPackage.version;
  const comparison = typeof localVersion === "string" && typeof latestVersion === "string" ? compareSemver(localVersion, latestVersion) : null;
  return { rootPackage, localVersion, comparison };
}

async function syncCheckoutToPublishedVersion({ folderName, latestVersion, attempts, delayMs }) {
  let localState = compareLocalPackageWithLatest(folderName, latestVersion);
  let gitSync;

  for (let attempt = 0; localState.comparison !== null && localState.comparison < 0 && attempt < attempts; attempt += 1) {
    if (attempt > 0 && delayMs > 0) await wait(delayMs);
    const currentGitSync = assertTemplateGitFresh({ folderName, autoUpdate: true });
    if (!gitSync || currentGitSync.status === "updated") gitSync = currentGitSync;
    localState = compareLocalPackageWithLatest(folderName, latestVersion);
  }

  return { ...localState, gitSync };
}

function assertLatestGitHeadContained({ folderName, latestGitHead, latestVersion }) {
  if (!latestGitHead) {
    return { checked: false, reason: "npm package did not expose gitHead" };
  }
  if (!gitSucceeds(["rev-parse", "--is-inside-work-tree"])) {
    failFreshness({
      code: "template-freshness/git-head-unverified",
      message: `Cannot confirm that this source checkout contains npm ${NPM_TAG} ${NPM_PACKAGE_NAME}@${latestVersion} commit ${latestGitHead}.`,
      fixHint: "Run from the official flap-vault-ui-template git checkout, update it to the latest source, then rerun the command.",
      folderName,
      extra: {
        latestVersion,
        latestGitHead,
      },
    });
  }

  let head;
  try {
    head = git(["rev-parse", "HEAD"]);
  } catch (error) {
    failFreshness({
      code: "template-freshness/git-head-unverified",
      message: `Cannot read the local git HEAD while checking npm ${NPM_TAG} source provenance.`,
      fixHint: "Fix the local git checkout, update it to the latest source, then rerun the command.",
      folderName,
      extra: {
        latestVersion,
        latestGitHead,
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (head === latestGitHead || gitSucceeds(["merge-base", "--is-ancestor", latestGitHead, "HEAD"])) {
    return { checked: true, status: head === latestGitHead ? "exact-published-commit" : "contains-published-commit", latestGitHead, head };
  }

  failFreshness({
    code: "template-freshness/npm-git-head-mismatch",
    message: `This checkout does not contain the npm ${NPM_TAG} ${NPM_PACKAGE_NAME}@${latestVersion} source commit ${latestGitHead}.`,
    fixHint: `Pull or switch to a source checkout that contains the npm ${NPM_TAG} published commit, then rerun local checks, builds, or packaging.`,
    folderName,
    extra: {
      latestVersion,
      latestGitHead,
      head,
    },
  });
}

export async function assertNpmPackageFresh({
  folderName,
  autoUpdate = false,
  readLatestMetadata = readNpmPackageTagMetadata,
  syncAttempts = DEFAULT_NPM_SYNC_ATTEMPTS,
  syncDelayMs = DEFAULT_NPM_SYNC_DELAY_MS,
} = {}) {
  if (NPM_TAG === "next") {
    try { assertPreviewTemplate(ROOT, folderName); }
    catch (error) { failFreshness({ code: "template-freshness/preview-target", message: error.message, fixHint: "Use App v2 next commands only with the committed preview template and standalone manifest.", folderName }); }
  }
  // Each release channel validates its own published version and source commit.
  const latestMetadata = await npmLatestMetadata(folderName, readLatestMetadata);
  const latestVersion = latestMetadata.version;
  let { rootPackage, localVersion, comparison } = compareLocalPackageWithLatest(folderName, latestVersion);
  let gitSync;

  if (comparison === null) {
    failFreshness({
      code: "template-freshness/invalid-version",
      message: `Cannot compare local template version ${JSON.stringify(localVersion)} with npm ${NPM_TAG} ${JSON.stringify(latestVersion)}.`,
      fixHint: "Use valid semver versions in package.json and the published npm runtime package, then rerun the command.",
      folderName,
      extra: {
        localVersion,
        latestVersion,
      },
    });
  }

  if (comparison < 0 && autoUpdate) {
    ({ rootPackage, localVersion, comparison, gitSync } = await syncCheckoutToPublishedVersion({
      folderName,
      latestVersion,
      attempts: Math.max(1, syncAttempts),
      delayMs: Math.max(0, syncDelayMs),
    }));
  }

  if (comparison < 0) {
    const officialContainsLatestGitHead = Boolean(
      latestMetadata.gitHead && gitSucceeds(["merge-base", "--is-ancestor", latestMetadata.gitHead, OFFICIAL_REF]),
    );
    const releaseSyncPending = Boolean(latestMetadata.gitHead && !officialContainsLatestGitHead);
    failFreshness({
      code: "template-freshness/npm-outdated",
      message: releaseSyncPending
        ? `npm ${NPM_TAG} ${NPM_PACKAGE_NAME}@${latestVersion} was published before its source commit ${latestMetadata.gitHead} became available on ${OFFICIAL_REF}.`
        : `This checkout uses ${rootPackage.name}@${localVersion}, but npm ${NPM_TAG} ${NPM_PACKAGE_NAME} is ${latestVersion}.`,
      fixHint: releaseSyncPending
        ? `This is an upstream release synchronization issue. Retry after a maintainer pushes ${latestMetadata.gitHead} and version ${latestVersion} to ${OFFICIAL_REF}; do not edit the local version string.`
        : `Update this checkout to ${latestVersion} or newer before running local checks, builds, or packaging.`,
      folderName,
      extra: {
        localPackageName: rootPackage.name,
        localVersion,
        latestVersion,
        latestGitHead: latestMetadata.gitHead,
        releaseSyncPending,
        officialContainsLatestGitHead,
      },
    });
  }

  const gitHead = assertLatestGitHeadContained({
    folderName,
    latestGitHead: latestMetadata.gitHead,
    latestVersion,
  });

  return {
    ok: true,
    npmPackageName: NPM_PACKAGE_NAME,
    npmTag: NPM_TAG,
    localPackageName: rootPackage.name,
    localVersion,
    latestVersion,
    latestGitHead: latestMetadata.gitHead,
    gitHead,
    ...(gitSync ? { gitSync } : {}),
    status: comparison === 0 ? "up-to-date" : "ahead-of-npm",
  };
}

export function assertTemplateGitFresh({ folderName, autoUpdate = false } = {}) {
  if (!gitSucceeds(["rev-parse", "--is-inside-work-tree"])) {
    failFreshness({
      code: "template-freshness/not-git-repo",
      message: "Cannot confirm template freshness because this directory is not a git repository.",
      fixHint: "Run yarn vault:package from the official flap-vault-ui-template git checkout.",
      folderName,
    });
  }

  const remote = remoteFromRef(OFFICIAL_REF);
  if (NPM_TAG === "next") {
    try {
      assertPreviewTemplate(ROOT, folderName);
      assertOfficialPreviewRemote(git(["remote", "get-url", remote]));
    } catch (error) {
      failFreshness({ code: "template-freshness/preview-source", message: error.message, fixHint: "Clone the official flap-sh template and use its feat/mini-app-v2 branch; maintainers may release the same commit from official next.", folderName });
    }
  }
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

  if (head === official) return { ok: true, officialRef: OFFICIAL_REF, status: "up-to-date", head, official };

  const isAhead = gitSucceeds(["merge-base", "--is-ancestor", official, head]);
  const isBehind = gitSucceeds(["merge-base", "--is-ancestor", head, official]);
  const status = isBehind ? "behind" : isAhead ? "ahead" : "diverged";

  if (status === "behind" && autoUpdate) {
    try {
      git(["merge", "--ff-only", OFFICIAL_REF]);
    } catch (error) {
      failFreshness({
        code: "template-freshness/auto-update-failed",
        message: `This flap-vault-ui-template checkout is behind ${OFFICIAL_REF}, but it could not be updated automatically without overwriting local work.`,
        fixHint: "Resolve or temporarily move the conflicting local changes, then rerun yarn vault:package <folder-name>. Do not discard Vault source work.",
        folderName,
        extra: {
          head,
          official,
          status,
          detail: error instanceof Error ? error.message : String(error),
        },
      });
    }

    const updatedHead = git(["rev-parse", "HEAD"]);
    if (updatedHead !== official) {
      failFreshness({
        code: "template-freshness/auto-update-incomplete",
        message: `The automatic update did not move this checkout exactly to ${OFFICIAL_REF}.`,
        fixHint: `Inspect the checkout state, update it to the latest ${OFFICIAL_REF} without discarding Vault source work, then rerun the package command.`,
        folderName,
        extra: {
          previousHead: head,
          head: updatedHead,
          official,
          status,
        },
      });
    }

    return {
      ok: true,
      officialRef: OFFICIAL_REF,
      status: "updated",
      previousHead: head,
      head: updatedHead,
      official,
    };
  }

  const code = `template-freshness/${status}`;
  const message =
    status === "behind"
      ? `This flap-vault-ui-template checkout is behind ${OFFICIAL_REF}.`
      : status === "ahead"
        ? `This flap-vault-ui-template checkout is ahead of ${OFFICIAL_REF}; validation and packaging must run from the official template head.`
        : `This flap-vault-ui-template checkout does not contain the latest ${OFFICIAL_REF} commits.`;
  const fixHint =
    status === "ahead"
      ? `Push and merge the template changes to ${OFFICIAL_REF}, or reset/switch this checkout to latest ${OFFICIAL_REF} before running validation, build, or package commands.`
      : "Run git pull --ff-only, then rerun validation, build, or package commands.";

  failFreshness({
    code,
    message,
    fixHint,
    folderName,
    extra: {
      head,
      official,
      status,
    },
  });
}

export async function assertTemplateFresh({ folderName, includeGit = true, includeNpm = true, autoUpdate = false } = {}) {
  const checks = {};
  if (includeGit) checks.git = assertTemplateGitFresh({ folderName, autoUpdate });
  if (includeNpm) checks.npm = await assertNpmPackageFresh({ folderName, autoUpdate });
  if (checks.npm?.gitSync?.status === "updated") checks.git = checks.npm.gitSync;
  return { ok: true, checks };
}

function cliOptions(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const folderName = argv.find((arg) => !arg.startsWith("--"));
  return {
    folderName,
    includeGit: !flags.has("--npm-only") && !flags.has("--no-git"),
    includeNpm: !flags.has("--git-only") && !flags.has("--no-npm"),
    autoUpdate: flags.has("--sync"),
    quiet: flags.has("--quiet"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = cliOptions(process.argv.slice(2));
  const result = await assertTemplateFresh(options);
  if (!options.quiet) console.log(JSON.stringify(result, null, 2));
}
