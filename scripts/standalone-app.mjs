export function isStandaloneApp(manifest) {
  return manifest?.schemaVersion === 2 && manifest?.mode === "mini-app" && manifest?.appModel === "standalone" && typeof manifest?.slug === "string" && manifest.slug.length >= 3 && manifest.slug.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug) && !["api","apps","admin","www","app","launch","preview","login","settings"].includes(manifest.slug) && Array.isArray(manifest?.match?.bindings) && manifest.match.bindings.length === 0;
}
export const APP_SESSION_PHASES = ["guest", "connected"];
export function standaloneReportIssues(report, manifest) {
  const issues = [];
  if (report?.binding?.appModel !== "standalone" || report?.binding?.slug !== manifest.slug || Object.keys(report?.binding ?? {}).some((k) => !["appModel", "slug"].includes(k))) issues.push("app-identity");
  for (const viewport of ["pc", "ipad", "h5"]) for (const phase of APP_SESSION_PHASES) {
    const check = report?.checks?.find((entry) => entry.viewport === viewport && entry.phase === phase && entry.wrongNetwork === false);
    if (!check || check.passed !== true || !Array.isArray(check.issues) || check.issues.length !== 0 || check.session !== phase) issues.push(`${viewport}/${phase}`);
  }
  return issues;
}
