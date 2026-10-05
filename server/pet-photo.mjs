import {
  MAX_PET_PHOTO_PIXELS,
  MAX_SOURCE_PHOTO_SIZE,
  MAX_STORED_PHOTO_SIZE
} from "./domain/pet-photo-limits.mjs";

const AVIF_TYPE = "image/avif";
const INPUT_TYPES = new Set(["jpeg", "png", "webp"]);
const sharpOptions = { failOn: "error", limitInputPixels: MAX_PET_PHOTO_PIXELS, sequentialRead: true };
let sharpReady;
// Initialize once on first use; a real AV1 encode also checks the installed libvips.
const loadSharp = () => sharpReady ??= import(/* @vite-ignore */ "sharp")
  .then(async ({ default: sharp }) => {
    const probe = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } })
      .avif({ quality: 40, effort: 2, chromaSubsampling: "4:2:0" }).toBuffer();
    const metadata = await sharp(probe).metadata();
    if (metadata.format !== "heif" || metadata.compression !== "av1") throw new Error("AV1 unavailable");
    return sharp;
  })
  .catch(() => { throw new PetPhotoError("AVIF encoder недоступен. Проверьте установку Sharp и поддержку HEIF/AV1 в libvips.", 500); });

function avifQuality() {
  const value = process.env.IMAGE_AVIF_QUALITY ?? "40";
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) {
    throw new PetPhotoError("IMAGE_AVIF_QUALITY должна быть целым числом от 1 до 100.", 500);
  }
  return Number(value);
}

export class PetPhotoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PetPhotoError";
    this.status = status;
  }
}

export async function encodeAvif(input, { maxInputBytes = MAX_SOURCE_PHOTO_SIZE, maxOutputBytes = MAX_STORED_PHOTO_SIZE, allowAvif = false, effort = 2 } = {}) {
  const started = performance.now();
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new PetPhotoError("Не удалось прочитать фотографию. Выберите файл JPEG, PNG или WebP.");
  }
  if (input.length > maxInputBytes) {
    throw new PetPhotoError("Исходная фотография должна быть не больше 20 МБ.");
  }

  const quality = avifQuality();
  const sharp = await loadSharp();
  let metadata;
  try {
    metadata = await sharp(input, sharpOptions).metadata();
  } catch {
    throw new PetPhotoError("Файл не является корректной фотографией JPEG, PNG или WebP.");
  }
  if (!INPUT_TYPES.has(metadata.format) && !(allowAvif && metadata.format === "heif" && metadata.compression === "av1")) {
    throw new PetPhotoError("Поддерживаются фотографии JPEG, PNG и WebP.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new PetPhotoError("Анимированные изображения не поддерживаются.");
  }
  if (metadata.depth && metadata.depth !== "uchar") {
    throw new PetPhotoError("Поддерживаются 8-битные изображения; исходное фото не изменено.");
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PET_PHOTO_PIXELS) {
    throw new PetPhotoError("Размеры фотографии превышают допустимый предел.");
  }

  let encoded;
  try {
    let pipeline = sharp(input, sharpOptions).rotate().toColourspace("srgb");
    pipeline = metadata.hasAlpha ? pipeline.ensureAlpha() : pipeline.removeAlpha();
    encoded = await pipeline
      .avif({ quality, effort, chromaSubsampling: "4:2:0", bitdepth: 8 })
      .timeout({ seconds: 60 })
      .toBuffer();
  } catch {
    throw new PetPhotoError("Не удалось преобразовать фото в AVIF; исходное фото не изменено.");
  }
  if (encoded.length > maxOutputBytes) {
    throw new PetPhotoError("Фото в AVIF превышает установленный предел 1 МБ. Выберите изображение меньшего размера.");
  }

  let encodedMetadata;
  try {
    encodedMetadata = await sharp(encoded, sharpOptions).metadata();
  } catch {
    throw new PetPhotoError("Не удалось проверить результат AVIF; исходное фото не изменено.");
  }
  const swapsDimensions = metadata.orientation >= 5 && metadata.orientation <= 8;
  const expectedWidth = swapsDimensions ? metadata.height : metadata.width;
  const expectedHeight = swapsDimensions ? metadata.width : metadata.height;
  if (
    encodedMetadata.format !== "heif" ||
    encodedMetadata.compression !== "av1" ||
    encodedMetadata.width !== expectedWidth ||
    encodedMetadata.height !== expectedHeight ||
    (metadata.hasAlpha && !encodedMetadata.hasAlpha)
  ) {
    throw new PetPhotoError("AVIF изменил размеры или удалил прозрачность; исходное фото не изменено.");
  }

  console.info("Pet photo AVIF", {
    bytesBefore: input.length,
    bytesAfter: encoded.length,
    savingsPercent: Number(((1 - encoded.length / input.length) * 100).toFixed(2)),
    durationMs: Math.round(performance.now() - started)
  });
  return encoded;
}

export async function encodePetPhotoFile(file) {
  if (file.size > MAX_SOURCE_PHOTO_SIZE) {
    throw new PetPhotoError("Исходная фотография должна быть не больше 20 МБ.");
  }
  let input;
  try {
    input = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new PetPhotoError("Не удалось прочитать фотографию. Выберите файл JPEG, PNG или WebP.");
  }
  return encodeAvif(input);
}

export { AVIF_TYPE };
