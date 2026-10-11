import type { ExerciseImage } from '../domain';

const MAX_IMAGE_EDGE = 1280;
const THUMBNAIL_EDGE = 96;

export async function prepareExerciseImage(file: File): Promise<ExerciseImage> {
  if (!file.type.startsWith('image/'))
    throw new Error('Bitte wähle eine Bilddatei.');
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  return {
    dataUrl: resize(image, MAX_IMAGE_EDGE, 0.82),
    thumbnailDataUrl: resize(image, THUMBNAIL_EDGE, 0.74, true),
    updatedAt: new Date().toISOString(),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Das Bild konnte nicht gelesen werden.')),
    );
    reader.addEventListener('error', () =>
      reject(new Error('Das Bild konnte nicht gelesen werden.')),
    );
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () =>
      reject(new Error('Dieses Bildformat wird nicht unterstützt.')),
    );
    image.src = source;
  });
}

function resize(
  image: HTMLImageElement,
  maximumEdge: number,
  quality: number,
  square = false,
): string {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const scale = square
    ? Math.min(1, maximumEdge / sourceSize)
    : Math.min(
        1,
        maximumEdge / Math.max(image.naturalWidth, image.naturalHeight),
      );
  const width = square
    ? Math.round(sourceSize * scale)
    : Math.round(image.naturalWidth * scale);
  const height = square
    ? Math.round(sourceSize * scale)
    : Math.round(image.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Das Bild kann auf diesem Gerät nicht verarbeitet werden.');
  const sourceX = square ? (image.naturalWidth - sourceSize) / 2 : 0;
  const sourceY = square ? (image.naturalHeight - sourceSize) / 2 : 0;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    square ? sourceSize : image.naturalWidth,
    square ? sourceSize : image.naturalHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/jpeg', quality);
}
