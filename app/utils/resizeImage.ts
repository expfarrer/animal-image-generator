// app/utils/resizeImage.ts
//
// Resizes an image file to fit within maxDim × maxDim, preserving aspect ratio.
// Output format is chosen automatically:
//   - JPEG for opaque images — smaller payload, faster upload
//     · quality 0.82 when downscaled (downscaling already removes HF artifacts)
//     · quality 0.85 when not downscaled (preserves detail on already-small images)
//   - PNG when actual transparency is detected (alpha < 255 on any pixel)
//
// Metadata (EXIF, XMP, ICC profiles) is stripped naturally by the canvas re-encode.
// Works with any browser-decoded format: JPEG, PNG, WebP, HEIC, AVIF, etc.

export async function resizeImageFile(
  file: File,
  maxDim = 768,
): Promise<Blob> {
  const imgUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = (e) => reject(e);
    i.src = imgUrl;
  });

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // Compute target dimensions with preserved aspect ratio
  let targetW = origW;
  let targetH = origH;
  if (origW > origH) {
    if (origW > maxDim) { targetW = maxDim; targetH = Math.round((origH * maxDim) / origW); }
  } else {
    if (origH > maxDim) { targetH = maxDim; targetW = Math.round((origW * maxDim) / origH); }
  }
  const wasDownscaled = targetW !== origW || targetH !== origH;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  // willReadFrequently: true tells the browser to keep pixel data CPU-accessible,
  // avoiding a GPU→CPU sync stall when we call getImageData for alpha detection.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2d not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);
  URL.revokeObjectURL(imgUrl);

  // Detect whether any pixel is non-opaque.
  // Canvas starts fully transparent; after drawImage opaque sources write alpha=255.
  // Only images with genuine transparency will have pixels with alpha < 255.
  let hasAlpha = false;
  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) { hasAlpha = true; break; }
  }

  const outputType = hasAlpha ? "image/png" : "image/jpeg";
  // Downscaled images tolerate slightly more compression; small images need more
  // headroom to avoid visible blocking on fine detail (fur, feathers, eyes).
  const quality = hasAlpha ? undefined : (wasDownscaled ? 0.82 : 0.85);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      outputType,
      quality,
    ),
  );

  console.log(
    `[resizeImage] ${origW}×${origH} ${(file.size / 1024).toFixed(0)}KB` +
    ` → ${targetW}×${targetH} ${(blob.size / 1024).toFixed(0)}KB` +
    ` ${outputType} q=${quality ?? "lossless"}${hasAlpha ? " (alpha)" : ""}`,
  );

  return blob;
}
