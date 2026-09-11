export interface MiniApp3DDecoderUrls {
  draco?: string;
  ktx2?: string;
}

function assertArtifactAssetUrl(assetUrl: string, moduleUrl: string) {
  const moduleLocation = new URL(moduleUrl);
  const asset = new URL(assetUrl, moduleLocation);
  const moduleDirectory = moduleLocation.pathname.slice(0, moduleLocation.pathname.lastIndexOf("/") + 1);
  if (asset.origin !== moduleLocation.origin || !asset.pathname.startsWith(`${moduleDirectory}assets/`)) {
    throw new Error("Mini App 3D assets must resolve from the current artifact assets/ manifest.");
  }
  return asset.href;
}

/** Resolve a statically imported 3D asset without permitting remote/CDN fallback. */
export function resolveMiniApp3DAssetUrl(assetUrl: string, moduleUrl: string) {
  return assertArtifactAssetUrl(assetUrl, moduleUrl);
}

/** Return artifact-relative decoder URLs for DRACO/KTX2 loader configuration. */
export function resolveMiniApp3DDecoderUrls(urls: MiniApp3DDecoderUrls, moduleUrl: string): MiniApp3DDecoderUrls {
  return {
    ...(urls.draco ? { draco: assertArtifactAssetUrl(urls.draco, moduleUrl) } : {}),
    ...(urls.ktx2 ? { ktx2: assertArtifactAssetUrl(urls.ktx2, moduleUrl) } : {}),
  };
}
