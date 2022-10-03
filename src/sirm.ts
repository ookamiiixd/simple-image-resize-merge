import EventEmitter from 'events';
import { WriteStream } from 'fs';
import { readdir } from 'fs/promises';
import { extname } from 'path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png'];

export const DIMENSIONS = {
  '2x3': [61, 79],
  '3x4': [79, 108],
  '4x6': [108, 158],
} as const;

export const PAPERS = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  B5: [498.9, 708.66],
  EXECUTIVE: [521.86, 756.0],
  FOLIO: [612.0, 936.0],
  LEGAL: [612.0, 1008.0],
  LETTER: [612.0, 792.0],
  TABLOID: [792.0, 1224.0],
} as const;

type Events = {
  'image-resized': Buffer[];
  done: null;
};

type JobsEventEmitter = {
  on<T extends keyof Events>(event: T, listener: (arg: Events[T]) => void): void;
  once<T extends keyof Events>(event: T, listener: (arg: Events[T]) => void): void;
  emit<T extends keyof Events>(event: T, arg: Events[T]): boolean;
};

/**
 * Resize images
 */
async function resizeImages(
  events: JobsEventEmitter,
  images: string[],
  width: number,
  height: number
) {
  let jobs: Promise<Buffer>[] = [];

  for (const image of images) {
    jobs.push(
      sharp(image)
        .resize(width, height, { fit: 'fill' })
        .sharpen()
        .jpeg({ quality: 100 })
        .toBuffer()
    );

    if (jobs.length >= 10 || images.findIndex((img) => img === image) === images.length - 1) {
      events.emit('image-resized', await Promise.all(jobs));
      jobs = [];
    }
  }

  events.emit('done', null);
}

/**
 * Generate pdf
 */
async function generatePdf(
  events: JobsEventEmitter,
  stream: WriteStream,
  paperSize: CreateFnOptions['paper'],
  imageWidth: number,
  imageHeight: number,
  imageMargins: number
) {
  const doc = new PDFDocument({ size: paperSize });
  doc.pipe(stream);

  let paperWidth = 0;
  let paperHeight = 0;

  if (typeof paperSize === 'string') {
    paperWidth = PAPERS[paperSize][0];
    paperHeight = PAPERS[paperSize][1];
  } else if (Array.isArray(paperSize)) {
    paperWidth = paperSize[0];
    paperHeight = paperSize[1];
  }

  let iterationX = 0;
  let iterationY = 0;

  events.on('image-resized', (images) => {
    for (const image of images) {
      // Reset X iteration if X is overflowing the page
      if (
        (iterationX + 1) * imageWidth +
          (iterationX === 0 ? imageMargins : (iterationX + 1) * imageMargins) >=
        paperWidth
      ) {
        iterationX = 0;
        iterationY += 1;
      }

      // Add new page and reset X and Y iteration if Y is overflowing the page
      if (
        (iterationY + 1) * imageHeight +
          (iterationY === 0 ? imageMargins : (iterationY + 1) * imageMargins) >=
        paperHeight
      ) {
        doc.addPage({ size: paperSize });
        iterationX = 0;
        iterationY = 0;
      }

      const offsetX =
        iterationX === 0 ? imageMargins : iterationX * imageWidth + (iterationX + 1) * imageMargins;

      const offsetY =
        iterationY === 0
          ? imageMargins
          : iterationY * imageHeight + (iterationY + 1) * imageMargins;

      doc.image(image, offsetX, offsetY, { width: imageWidth, height: imageHeight });
      iterationX += 1;
    }
  });

  events.once('done', () => doc.end());
}

export type CreateFnOptions = {
  /** Writeable stream */
  stream: WriteStream;
  /** Target directory containing the images */
  target: string;
  /** PDF paper size */
  paper: keyof typeof PAPERS | number[];
  /** Resized image dimensions */
  dimensions: keyof typeof DIMENSIONS | [number, number];
  /** Image margins */
  margins?: number;
};

/**
 * Resize images and merge them in single pdf file
 */
export async function create(options: CreateFnOptions) {
  const defaultOptions = {
    imageMargins: 10,
  };

  const {
    stream,
    target: targetDirectory,
    paper: paperSize,
    dimensions: imageDimensions,
    imageMargins,
  } = {
    ...defaultOptions,
    ...options,
  };

  const images = (await readdir(targetDirectory))
    .filter((image) => !ALLOWED_EXTENSIONS.includes(extname(image).toLowerCase()))
    .map((image) => `${targetDirectory}/${image}`);

  let imageWidth = 0;
  let imageHeight = 0;

  if (typeof imageDimensions === 'string') {
    imageWidth = DIMENSIONS[imageDimensions][0];
    imageHeight = DIMENSIONS[imageDimensions][1];
  } else if (Array.isArray(imageDimensions)) {
    imageWidth = imageDimensions[0];
    imageHeight = imageDimensions[1];
  }

  const events = new EventEmitter() as JobsEventEmitter;

  generatePdf(events, stream, paperSize, imageWidth, imageHeight, imageMargins);
  resizeImages(events, images, imageWidth, imageHeight);
}
