import sharp from 'sharp';
import { encodeAvif, PetPhotoError } from './pet-photo.mjs';
import { MAX_SOURCE_PHOTO_SIZE, MAX_PET_PHOTO_PIXELS } from './domain/pet-photo-limits.mjs';

export const PHOTO_ALGORITHM = 'pet-photo-1600-webp85-avif40-v1';
export const migrationSharpOptions = { failOn: 'error', limitInputPixels: MAX_PET_PHOTO_PIXELS, sequentialRead: true };

export async function prepareMigrationPhoto(input) {
  if (!input.length || input.length > MAX_SOURCE_PHOTO_SIZE) throw new PetPhotoError('Недопустимый размер исходного файла.');
  const metadata = await sharp(input, migrationSharpOptions).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) && !(metadata.format === 'heif' && metadata.compression === 'av1')) {
    throw new PetPhotoError('Неподдерживаемый формат; HEIC/HEVC не принимается.');
  }
  if ((metadata.pages ?? 1) > 1) throw new PetPhotoError('Анимации не принимаются.');
  if (metadata.depth !== 'uchar') throw new PetPhotoError('Принимаются только 8-битные фото.');
  const swap = metadata.orientation >= 5 && metadata.orientation <= 8;
  const width = swap ? metadata.height : metadata.width;
  const height = swap ? metadata.width : metadata.height;
  if (!width || !height || width * height > MAX_PET_PHOTO_PIXELS) throw new PetPhotoError('Превышен предел пикселей.');
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const prepared = scale < 1
    ? await sharp(input, migrationSharpOptions).rotate().resize(targetWidth, targetHeight).toColourspace('srgb')
      .webp({ quality: 85 }).timeout({ seconds: 60 }).toBuffer()
    : input;
  const output = await encodeAvif(prepared, { allowAvif: true, effort: 7 });
  const result = await sharp(output, migrationSharpOptions).metadata();
  if (result.width !== targetWidth || result.height !== targetHeight || (metadata.hasAlpha && !result.hasAlpha)
    || result.exif || result.xmp || result.icc || result.orientation) throw new PetPhotoError('Проверка размеров, alpha или метаданных не пройдена.');
  await sharp(output, migrationSharpOptions).raw().toBuffer();
  return { output, source: { width, height, format: metadata.format, compression: metadata.compression, hasAlpha: metadata.hasAlpha },
    target: { width: result.width, height: result.height, hasAlpha: result.hasAlpha } };
}
