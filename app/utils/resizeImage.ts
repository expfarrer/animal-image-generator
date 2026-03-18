// app/utils/resizeImage.ts
//
// Resizes an image file to fit within maxDim × maxDim, preserving aspect ratio.
// Output format is chosen automatically:
//   - JPEG (quality 0.82) for opaque images — smaller payload, faster upload
//   - PNG                 for images with actual transparency (alpha < 255 detected)
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

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
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
  const quality    = hasAlpha ? undefined    : 0.82;

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
    ` ${outputType}${hasAlpha ? " (alpha preserved)" : ""}`,
  );

  return blob;
}
