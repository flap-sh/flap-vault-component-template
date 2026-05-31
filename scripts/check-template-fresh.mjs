#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { failAgent } from "./agent-error.mjs";
import { readNpmLatestPackageMetadata } from "./npm-registry.mjs";

const ROOT = process.cwd();
const DEFAULT_OFFICIAL_REF = "origin/main";
const OFFICIAL_REF = process.env.FLAP_TEMPLATE_FRESHNESS_REF?.trim() || DEFAULT_OFFICIAL_REF;
const DEFAULT_NPM_PACKAGE_NAME = "@flapsdk/vault-runtime";
const NPM_PACKAGE_NAME = process.env.FLAP_TEMPLATE_NPM_PACKAGE?.trim() || DEFAULT_NPM_PACKAGE_NAME;

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

async function npmLatestMetadata(folderName) {
  try {
    const metadata = await readNpmLatestPackageMetadata(NPM_PACKAGE_NAME);
    return { version: metadata.version ?? "", gitHead: metadata.gitHead };
  } catch (error) {
    failFreshness({
      code: "template-freshness/npm-fetch-failed",
      message: `Cannot confirm template freshness because npm latest lookup failed for ${NPM_PACKAGE_NAME}.`,
      fixHint: "Fix npm registry/network access, update to the latest template package, then rerun the command.",
      folderName,
      extra: {
        detail: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function assertLatestGitHeadContained({ folderName, latestGitHead, latestVersion }) {
  if (!latestGitHead) {
    return { checked: false, reason: "npm package did not expose gitHead" };
  }
  if (!gitSucceeds(["rev-parse", "--is-inside-work-tree"])) {
    failFreshness({
      code: "template-freshness/git-head-unverified",
      message: `Cannot confirm that this source checkout contains npm latest ${NPM_PACKAGE_NAME}@${latestVersion} commit ${latestGitHead}.`,
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
      message: "Cannot read the local git HEAD while checking npm latest source provenance.",
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
    message: `This checkout does not contain the npm latest ${NPM_PACKAGE_NAME}@${latestVersion} source commit ${latestGitHead}.`,
    fixHint: "Pull or switch to a source checkout that contains the npm latest published commit, then rerun local checks, builds, or packaging.",
    folderName,
    extra: {
      latestVersion,
      latestGitHead,
      head,
    },
  });
}

export async function assertNpmPackageFresh({ folderName } = {}) {
  const rootPackage = readRootPackageJson(folderName);
  const localVersion = rootPackage.version;
  const latestMetadata = await npmLatestMetadata(folderName);
  const latestVersion = latestMetadata.version;
  const comparison = typeof localVersion === "string" && typeof latestVersion === "string" ? compareSemver(localVersion, latestVersion) : null;

  if (comparison === null) {
    failFreshness({
      code: "template-freshness/invalid-version",
      message: `Cannot compare local template version ${JSON.stringify(localVersion)} with npm latest ${JSON.stringify(latestVersion)}.`,
      fixHint: "Use valid semver versions in package.json and the published npm runtime package, then rerun the command.",
      folderName,
      extra: {
        localVersion,
        latestVersion,
      },
    });
  }

  if (comparison < 0) {
    failFreshness({
      code: "template-freshness/npm-outdated",
      message: `This checkout uses ${rootPackage.name}@${localVersion}, but npm latest ${NPM_PACKAGE_NAME} is ${latestVersion}.`,
      fixHint: `Update this checkout to ${latestVersion} or newer before running local checks, builds, or packaging.`,
      folderName,
      extra: {
        localPackageName: rootPackage.name,
        localVersion,
        latestVersion,
        latestGitHead: latestMetadata.gitHead,
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
    localPackageName: rootPackage.name,
    localVersion,
    latestVersion,
    latestGitHead: latestMetadata.gitHead,
    gitHead,
    status: comparison === 0 ? "up-to-date" : "ahead-of-npm",
  };
}

export function assertTemplateGitFresh({ folderName } = {}) {
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

export async function assertTemplateFresh({ folderName, includeGit = true, includeNpm = true } = {}) {
  const checks = {};
  if (includeGit) checks.git = assertTemplateGitFresh({ folderName });
  if (includeNpm) checks.npm = await assertNpmPackageFresh({ folderName });
  return { ok: true, checks };
}

function cliOptions(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const folderName = argv.find((arg) => !arg.startsWith("--"));
  return {
    folderName,
    includeGit: !flags.has("--npm-only") && !flags.has("--no-git"),
    includeNpm: !flags.has("--git-only") && !flags.has("--no-npm"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await assertTemplateFresh(cliOptions(process.argv.slice(2))), null, 2));
}
