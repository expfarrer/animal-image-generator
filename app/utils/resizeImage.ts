// app/utils/resizeImage.ts
export async function resizeImageFile(
  file: File,
  maxDim = 768,
  outputType = "image/png",
  quality = 0.85,
): Promise<Blob> {
  // Create local object URL and load image
  const imgUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = (e) => reject(e);
    i.src = imgUrl;
  });

  // Compute target dimensions with preserved aspect ratio
  const { width, height } = img;
  let targetW = width;
  let targetH = height;
  if (width > height) {
    if (width > maxDim) {
      targetW = maxDim;
      targetH = Math.round((height * maxDim) / width);
    }
  } else {
    if (height > maxDim) {
      targetH = maxDim;
      targetW = Math.round((width * maxDim) / height);
    }
  }

  // Draw to canvas at target size
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Convert to Blob
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), outputType, quality),
  );

  // Cleanup
  URL.revokeObjectURL(imgUrl);
  return blob;
}
