const MAX_COMPRESSED_PHOTO_SIZE = 700 * 1024;
const MAX_PHOTO_DIMENSION = 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось обработать фотографию."));
    }, type, quality);
  });
}

export async function compressPetPhoto(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.decoding = "async";
  image.src = sourceUrl;

  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Не удалось определить размер фотографии.");
    }

    if (
      file.type === "image/webp"
      && file.size <= MAX_COMPRESSED_PHOTO_SIZE
      && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_PHOTO_DIMENSION
    ) {
      return file;
    }

    const initialScale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let smallestBlob: Blob | null = null;
    const canvas = document.createElement("canvas");

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог обработать фотографию.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.82, 0.74, 0.66, 0.58]) {
        let blob = await canvasToBlob(canvas, "image/webp", quality);
        if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= MAX_COMPRESSED_PHOTO_SIZE) {
          const extension = blob.type === "image/webp" ? "webp" : "jpg";
          return new File([blob], `pet-photo.${extension}`, { type: blob.type, lastModified: Date.now() });
        }
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    if (!smallestBlob || smallestBlob.size > MAX_COMPRESSED_PHOTO_SIZE) {
      throw new Error("Не удалось достаточно сжать фотографию. Выберите другое изображение.");
    }
    const extension = smallestBlob.type === "image/webp" ? "webp" : "jpg";
    return new File([smallestBlob], `pet-photo.${extension}`, { type: smallestBlob.type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
