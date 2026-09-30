import {
  MAX_PET_PHOTO_PIXELS,
  MAX_SOURCE_PHOTO_SIZE,
  MAX_STORED_PHOTO_SIZE
} from "./domain/pet-photo-limits.mjs";

const AVIF_TYPE = "image/avif";
const INPUT_TYPES = new Set(["jpeg", "png", "webp"]);
const sharpOptions = { failOn: "error", limitInputPixels: MAX_PET_PHOTO_PIXELS, sequentialRead: true };
const loadSharp = () => import(/* @vite-ignore */ "sharp").then(({ default: sharp }) => sharp);

export class PetPhotoError extends Error {
  constructor(message) {
    super(message);
    this.name = "PetPhotoError";
  }
}

export async function encodeAvif(input, { maxInputBytes = MAX_SOURCE_PHOTO_SIZE, maxOutputBytes = MAX_STORED_PHOTO_SIZE } = {}) {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new PetPhotoError("Не удалось прочитать фотографию. Выберите файл JPEG, PNG или WebP.");
  }
  if (input.length > maxInputBytes) {
    throw new PetPhotoError("Исходная фотография должна быть не больше 10 МБ.");
  }

  const sharp = await loadSharp();
  let metadata;
  try {
    metadata = await sharp(input, sharpOptions).metadata();
  } catch {
    throw new PetPhotoError("Файл не является корректной фотографией JPEG, PNG или WebP.");
  }
  if (!INPUT_TYPES.has(metadata.format)) {
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
      .avif({ quality: 55, effort: 9, chromaSubsampling: "4:2:0", bitdepth: 8 })
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
    encodedMetadata.width !== expectedWidth ||
    encodedMetadata.height !== expectedHeight ||
    (metadata.hasAlpha && !encodedMetadata.hasAlpha)
  ) {
    throw new PetPhotoError("AVIF изменил размеры или удалил прозрачность; исходное фото не изменено.");
  }

  return encoded;
}

export async function encodePetPhotoFile(file) {
  if (file.size > MAX_SOURCE_PHOTO_SIZE) {
    throw new PetPhotoError("Исходная фотография должна быть не больше 10 МБ.");
  }
  return encodeAvif(Buffer.from(await file.arrayBuffer()));
}

export { AVIF_TYPE };
