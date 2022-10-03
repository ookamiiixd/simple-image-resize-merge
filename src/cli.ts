import minimist from 'minimist';
import { prompt } from 'inquirer';
import { createSpinner } from 'nanospinner';
import { create, DIMENSIONS, PAPERS, CreateFnOptions } from '.';
import { createWriteStream } from 'fs';

type AcceptableArgs = {
  o?: string;
  output?: string;
  t?: string;
  target?: string;
  p?: string;
  paper?: string;
  d?: string;
  dimensions?: string;
  m?: string;
  margins?: string;
  timeout?: string;
};

const argv = minimist(process.argv.slice(2)) as AcceptableArgs;

const spinner = createSpinner('Creating your file...');

function fail(error: unknown) {
  spinner.error({
    text:
      typeof error === 'string'
        ? error
        : error instanceof Error
        ? error.message
        : 'An unknown error occured when trying to process your request',
  });

  process.exit(1);
}

async function getOutputPath() {
  const output = argv.o || argv.output;

  if (output) {
    return output;
  }

  const answer = await prompt<{ output: string }>({
    name: 'output',
    message: 'Please specify path to the pdf file output',
    default: './file.pdf',
  });

  return answer.output;
}

async function getTargetDirectory() {
  const targetDirectory = argv.t || argv.target;

  if (targetDirectory) {
    return targetDirectory;
  }

  const answer = await prompt<{ targetDirectory: string }>({
    name: 'targetDirectory',
    message: 'Please specify path to directory containing the images',
    default: './',
  });

  return answer.targetDirectory;
}

async function getPaperSize() {
  const paperSize = argv.p || argv.paper;

  if (paperSize) {
    return paperSize.includes(',') ? paperSize.split(',').map(parseFloat) : paperSize;
  }

  const choices = [
    ...Object.keys(PAPERS).map((val) => ({
      name: `${val} (${PAPERS[val as keyof typeof PAPERS].join('x')})`,
      value: val,
    })),
    {
      name: 'Use custom value',
      value: 'custom',
    },
  ];

  const answer = await prompt<{ dimensions: string }>({
    name: 'dimensions',
    type: 'list',
    message: 'Please specify paper size using predefined value below or use custom value',
    choices,
  });

  if (answer.dimensions !== 'custom') {
    return answer.dimensions;
  }

  const answer2 = await prompt<{ customDimensions: string }>({
    name: 'customDimensions',
    message: 'Please specify width and height in comma-separated format. Example: 200,300',
  });

  if (!answer2.customDimensions.includes(',')) {
    throw new Error('Custom paper size must be in comma-separated format');
  }

  return answer2.customDimensions.split(',').map(parseFloat);
}

async function getImageDimensions() {
  const dimensions = argv.d || argv.dimensions;

  if (dimensions) {
    return dimensions.includes(',') ? dimensions.split(',').map(parseFloat) : dimensions;
  }

  const choices = [
    ...Object.keys(DIMENSIONS).map((val) => ({
      name: `${val} (${DIMENSIONS[val as keyof typeof DIMENSIONS].join('x')})`,
      value: val,
    })),
    {
      name: 'Use custom value',
      value: 'custom',
    },
  ];

  const answer = await prompt<{ dimensions: string }>({
    name: 'dimensions',
    type: 'list',
    message:
      'Please specify resized images dimensions target using predefined value below or use custom value',
    choices,
  });

  if (answer.dimensions !== 'custom') {
    return answer.dimensions;
  }

  const answer2 = await prompt<{ customDimensions: string }>({
    name: 'customDimensions',
    message: 'Please specify width and height in comma-separated format. Example: 200,300',
  });

  if (!answer2.customDimensions.includes(',')) {
    throw new Error('Custom image dimensions must be in comma-separated format');
  }

  return answer2.customDimensions.split(',').map(parseFloat);
}

async function getImageMargins() {
  const margins = argv.m || argv.margins;

  if (margins) {
    return parseInt(margins);
  }

  const answer = await prompt<{ margins: string }>({
    name: 'margins',
    message: 'Please specify images margins',
    default: '10',
  });

  return parseInt(answer.margins);
}

async function start() {
  const timeout = parseInt(argv.timeout || '300000');

  try {
    const output = await getOutputPath();
    const targetDirectory = await getTargetDirectory();
    const paperSize = (await getPaperSize()) as CreateFnOptions['paper'];
    const imageDimensions = (await getImageDimensions()) as CreateFnOptions['dimensions'];
    const imageMargins = await getImageMargins();

    const stream = createWriteStream(output);

    spinner.start();

    stream.on('error', fail);
    stream.on('finish', () => {
      spinner.success({ text: `Your file has been successfully created at ${output}` });
      process.exit(0);
    });

    setTimeout(() => {
      fail('Failed to create your file in time, try increasing the timeout');
      stream.end();
    }, timeout);

    create({
      stream,
      target: targetDirectory,
      paper: paperSize,
      dimensions: imageDimensions,
      margins: imageMargins,
    });
  } catch (e) {
    fail(e);
  }
}

start();
