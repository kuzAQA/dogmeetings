const MAX_PHOTO_EDGE = 1600;

export async function preparePetPhoto(file: File): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    const longestEdge = Math.max(image.width, image.height);
    if (longestEdge <= MAX_PHOTO_EDGE) return file;
    const scale = MAX_PHOTO_EDGE / longestEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось уменьшить фотографию. Попробуйте другой браузер.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob) throw new Error("Не удалось уменьшить фотографию. Выберите другое фото.");
    const extension = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type });
  } finally {
    image.close();
  }
}
