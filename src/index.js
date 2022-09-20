import minimist from "minimist";
import fs from "fs";
import fsPromise from "fs/promises";
import PDFDocument from "pdfkit";
import isImage from "is-image";
import pLimit from "p-limit";
import sharp from "sharp";

const argv = minimist(process.argv.slice(2));

const TARGET_DIRECTORY = argv.i || argv.in;
const OUTPUT_FILENAME = argv.o || argv.out;

const TARGET_IMAGE_WIDTH = 85;
const TARGET_IMAGE_HEIGHT = 113;

// Based from PDFKit docs, https://pdfkit.org/docs/paper_sizes.html
const PAPER_TYPE = "A4";
const PAPER_WIDTH = 595;
const PAPER_HEIGHT = 841;

const SPACING = 10;

const limit = pLimit(10);

async function processImages() {
  const jobs = [];
  const files = await fsPromise.readdir(TARGET_DIRECTORY);

  for (const file of files) {
    // Skip non-image file
    if (!isImage(file)) {
      continue;
    }

    jobs.push(
      limit(() =>
        sharp(`${TARGET_DIRECTORY}/${file}`)
          .resize(TARGET_IMAGE_WIDTH, TARGET_IMAGE_HEIGHT, { fit: "fill" })
          .sharpen()
          .jpeg({ quality: 100 })
          .toBuffer()
      )
    );
  }

  return Promise.all(jobs);
}

/**
 * Generate the pdf
 */
async function generate() {
  const doc = new PDFDocument({ size: PAPER_TYPE });
  doc.pipe(fs.createWriteStream(OUTPUT_FILENAME));

  const images = await processImages();

  let iterationX = 0;
  let iterationY = 0;

  for (const image of images) {
    // Reset X iteration if X is overflowing the page
    if (
      (iterationX + 1) * TARGET_IMAGE_WIDTH +
        (iterationX === 0 ? SPACING : (iterationX + 1) * SPACING) >=
      PAPER_WIDTH
    ) {
      iterationX = 0;
      iterationY += 1;
    }

    // Reset X and Y iteration if Y is overflowing the page, then add a new page
    if (
      (iterationY + 1) * TARGET_IMAGE_HEIGHT +
        (iterationY === 0 ? SPACING : (iterationY + 1) * SPACING) >=
      PAPER_HEIGHT
    ) {
      doc.addPage({ size: PAPER_TYPE });
      iterationX = 0;
      iterationY = 0;
    }

    const offsetX =
      iterationX === 0
        ? SPACING
        : iterationX * TARGET_IMAGE_WIDTH + (iterationX + 1) * SPACING;

    const offsetY =
      iterationY === 0
        ? SPACING
        : iterationY * TARGET_IMAGE_HEIGHT + (iterationY + 1) * SPACING;

    doc.image(image, offsetX, offsetY, {
      width: TARGET_IMAGE_WIDTH,
      height: TARGET_IMAGE_HEIGHT,
    });

    iterationX += 1;
  }

  doc.end();
}

generate();
