# Controlled card images

Render an approved artwork URL as a regular image or use it as a 3D texture. Load only images needed by the visible page.

```tsx
import { CardImage } from "@/src/ui";

<CardImage
  src={imageUrl}
  alt={imageLabel}
  className="h-auto w-full"
  fallback={<span>{imageLabel}</span>}
/>
```

The runtime accepts HTTPS URLs in the approved image directory. It downloads size-limited JPEG, PNG, WebP, or AVIF responses without credentials, referrers, or redirects.

For a package with `three-r3f-v1`, `useCardImageBitmap(imageUrl)` returns a decoded bitmap or `null`. Use the bitmap as the image for a Three `Texture`, set its color space to `SRGBColorSpace`, and mark the texture for update. Show a placeholder while the hook returns `null`. Dispose the Three texture after use. The runtime closes the underlying bitmap when its input changes or its caller unmounts. The bitmap already has the vertical orientation expected by Three.

Both imports are shared runtime UI exports. The template, Workbench, and Flap host must use versions that expose this capability before a new artifact can use it.
