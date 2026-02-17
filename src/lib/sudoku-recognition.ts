import { createEmptyValues, type BoardValues } from "@/lib/sudoku";

export type SudokuRecognitionProgress = {
  progress: number;
  stage: string;
};

type Point = { x: number; y: number };
export type NormalizedCorner = Point;
export type RecognizeOptions = {
  manualCorners?: [NormalizedCorner, NormalizedCorner, NormalizedCorner, NormalizedCorner];
};

function pruneConflictingDetections(
  values: BoardValues,
  confidences: number[],
  highConfidence = 86
): { values: BoardValues; dropped: number } {
  const nextValues = [...values];
  const nextConf = [...confidences];
  let dropped = 0;

  const peerIndexes = (index: number): number[] => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const peers: number[] = [];
    for (let i = 0; i < 81; i += 1) {
      if (i === index || nextValues[i] === null) {
        continue;
      }
      const r = Math.floor(i / 9);
      const c = i % 9;
      const sameRow = r === row;
      const sameCol = c === col;
      const sameBox = Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3);
      if ((sameRow || sameCol || sameBox) && nextValues[i] === nextValues[index]) {
        peers.push(i);
      }
    }
    return peers;
  };

  for (let guard = 0; guard < 200; guard += 1) {
    let dropIndex = -1;
    let dropScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < 81; i += 1) {
      if (nextValues[i] === null) {
        continue;
      }
      const peers = peerIndexes(i);
      if (peers.length === 0) {
        continue;
      }

      const selfConfidence = nextConf[i] ?? 0;
      const peerMax = peers.reduce((acc, peer) => Math.max(acc, nextConf[peer] ?? 0), 0);
      const isVeryHigh = selfConfidence >= highConfidence;
      const protectedPenalty = isVeryHigh && selfConfidence >= peerMax ? 1000 : 0;
      const score = selfConfidence + protectedPenalty;

      if (score < dropScore) {
        dropScore = score;
        dropIndex = i;
      }
    }

    if (dropIndex < 0) {
      break;
    }

    nextValues[dropIndex] = null;
    nextConf[dropIndex] = 0;
    dropped += 1;
  }

  return { values: nextValues, dropped };
}

function detectCellInkStats(
  imageData: ImageData,
  width: number,
  height: number
): {
  inkRatio: number;
  bboxWidth: number;
  bboxHeight: number;
  touchesEdge: boolean;
} {
  let black = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const edge = 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      if (imageData.data[p] < 128) {
        black += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (black === 0) {
    return { inkRatio: 0, bboxWidth: 0, bboxHeight: 0, touchesEdge: false };
  }

  const bboxWidth = maxX - minX + 1;
  const bboxHeight = maxY - minY + 1;
  const touchesEdge =
    minX <= edge || minY <= edge || maxX >= width - 1 - edge || maxY >= height - 1 - edge;

  return {
    inkRatio: black / (width * height),
    bboxWidth,
    bboxHeight,
    touchesEdge
  };
}

function prepareCellBinary(
  source: ImageData,
  width: number,
  height: number,
  lumFactor: number,
  darkFactor: number,
  removeBorderInk: boolean
): ImageData {
  const imageData = new ImageData(new Uint8ClampedArray(source.data), width, height);
  const gray = new Uint8ClampedArray(width * height);
  const darkness = new Uint8ClampedArray(width * height);
  for (let p = 0; p < imageData.data.length; p += 4) {
    const r = imageData.data[p];
    const g = imageData.data[p + 1];
    const b = imageData.data[p + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    gray[p / 4] = lum;
    darkness[p / 4] = 255 - Math.max(r, g, b);
  }
  const threshold = otsuThreshold(gray);
  const darkThreshold = otsuThreshold(darkness);
  for (let p = 0; p < imageData.data.length; p += 4) {
    const pixel = p / 4;
    const bw =
      gray[pixel] < threshold * lumFactor || darkness[pixel] > darkThreshold * darkFactor ? 0 : 255;
    imageData.data[p] = bw;
    imageData.data[p + 1] = bw;
    imageData.data[p + 2] = bw;
  }
  if (removeBorderInk) {
    removeBorderConnectedInk(imageData, width, height);
  }
  return imageData;
}

function removeBorderConnectedInk(imageData: ImageData, width: number, height: number): void {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const enqueueIfBlack = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const idx = y * width + x;
    if (visited[idx]) {
      return;
    }
    const p = idx * 4;
    if (imageData.data[p] >= 128) {
      return;
    }
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBlack(x, 0);
    enqueueIfBlack(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfBlack(0, y);
    enqueueIfBlack(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    const p = idx * 4;
    imageData.data[p] = 255;
    imageData.data[p + 1] = 255;
    imageData.data[p + 2] = 255;

    enqueueIfBlack(x - 1, y);
    enqueueIfBlack(x + 1, y);
    enqueueIfBlack(x, y - 1);
    enqueueIfBlack(x, y + 1);
  }
}

function findGridCorners(binaryCanvas: HTMLCanvasElement): {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
} | null {
  const ctx = binaryCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  const { width, height } = binaryCanvas;
  const image = ctx.getImageData(0, 0, width, height);

  let topLeft: Point | null = null;
  let topRight: Point | null = null;
  let bottomLeft: Point | null = null;
  let bottomRight: Point | null = null;
  let minSum = Number.POSITIVE_INFINITY;
  let maxSum = Number.NEGATIVE_INFINITY;
  let minDiff = Number.POSITIVE_INFINITY;
  let maxDiff = Number.NEGATIVE_INFINITY;
  let blackPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      if (image.data[p] >= 128) {
        continue;
      }
      blackPixels += 1;
      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        topLeft = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        bottomRight = { x, y };
      }
      if (diff < minDiff) {
        minDiff = diff;
        bottomLeft = { x, y };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        topRight = { x, y };
      }
    }
  }

  if (!topLeft || !topRight || !bottomLeft || !bottomRight || blackPixels < width * height * 0.01) {
    return null;
  }

  const diag1 = Math.hypot(bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  const diag2 = Math.hypot(topRight.x - bottomLeft.x, topRight.y - bottomLeft.y);
  if (diag1 < Math.min(width, height) * 0.45 || diag2 < Math.min(width, height) * 0.45) {
    return null;
  }

  return { topLeft, topRight, bottomLeft, bottomRight };
}

function solveLinearSystem8(matrix: number[][], vector: number[]): number[] | null {
  const n = 8;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][col]) < 1e-9) {
      return null;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const pivotValue = a[col][col];
    for (let j = col; j <= n; j += 1) {
      a[col][j] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }

  return a.map((row) => row[n]);
}

function homographyFrom4Points(src: Point[], dst: Point[]): number[] | null {
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const solution = solveLinearSystem8(matrix, vector);
  if (!solution) {
    return null;
  }

  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
    1
  ];
}

function warpCanvasToSquare(
  source: HTMLCanvasElement,
  corners: { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point },
  size = 900
): HTMLCanvasElement | null {
  const dst = document.createElement("canvas");
  dst.width = size;
  dst.height = size;
  const srcCtx = source.getContext("2d", { willReadFrequently: true });
  const dstCtx = dst.getContext("2d", { willReadFrequently: true });
  if (!srcCtx || !dstCtx) {
    return null;
  }

  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const outData = dstCtx.createImageData(size, size);

  const srcQuad = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft
  ];
  const dstQuad = [
    { x: 0, y: 0 },
    { x: size - 1, y: 0 },
    { x: size - 1, y: size - 1 },
    { x: 0, y: size - 1 }
  ];

  // We need dst->src mapping for sampling.
  const h = homographyFrom4Points(dstQuad, srcQuad);
  if (!h) {
    return null;
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const denom = h[6] * x + h[7] * y + h[8];
      if (Math.abs(denom) < 1e-9) {
        continue;
      }
      const sx = (h[0] * x + h[1] * y + h[2]) / denom;
      const sy = (h[3] * x + h[4] * y + h[5]) / denom;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      const outP = (y * size + x) * 4;
      if (ix < 0 || iy < 0 || ix >= source.width || iy >= source.height) {
        outData.data[outP] = 255;
        outData.data[outP + 1] = 255;
        outData.data[outP + 2] = 255;
        outData.data[outP + 3] = 255;
        continue;
      }
      const inP = (iy * source.width + ix) * 4;
      outData.data[outP] = srcData.data[inP];
      outData.data[outP + 1] = srcData.data[inP + 1];
      outData.data[outP + 2] = srcData.data[inP + 2];
      outData.data[outP + 3] = 255;
    }
  }

  dstCtx.putImageData(outData, 0, 0);
  return dst;
}

function estimateGridRect(canvas: HTMLCanvasElement): { left: number; top: number; size: number } {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { left: 0, top: 0, size: Math.min(canvas.width, canvas.height) };
  }

  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const rowHits = Array<number>(height).fill(0);
  const colHits = Array<number>(width).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 135) {
        rowHits[y] += 1;
        colHits[x] += 1;
      }
    }
  }

  const rowThreshold = Math.max(8, Math.floor(width * 0.09));
  const colThreshold = Math.max(8, Math.floor(height * 0.09));

  let top = rowHits.findIndex((count) => count > rowThreshold);
  const bottom = rowHits.length - 1 - [...rowHits].reverse().findIndex((count) => count > rowThreshold);
  let left = colHits.findIndex((count) => count > colThreshold);
  const right = colHits.length - 1 - [...colHits].reverse().findIndex((count) => count > colThreshold);

  if (top < 0 || left < 0 || bottom <= top || right <= left) {
    return { left: 0, top: 0, size: Math.min(width, height) };
  }

  const rectWidth = right - left;
  const rectHeight = bottom - top;

  if (Math.abs(rectWidth - rectHeight) > Math.min(width, height) * 0.25) {
    return { left: 0, top: 0, size: Math.min(width, height) };
  }

  const size = Math.min(rectWidth, rectHeight);
  left = Math.max(0, left + Math.floor((rectWidth - size) / 2));
  top = Math.max(0, top + Math.floor((rectHeight - size) / 2));

  return { left, top, size };
}

function rotateCanvas(source: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  const rotated = document.createElement("canvas");
  rotated.width = source.width;
  rotated.height = source.height;
  const ctx = rotated.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return source;
  }

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, rotated.width, rotated.height);
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return rotated;
}

function createDetectionBinary(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return source;
  }
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const lum = 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
    minLum = Math.min(minLum, lum);
    maxLum = Math.max(maxLum, lum);
    image.data[i] = lum;
    image.data[i + 1] = lum;
    image.data[i + 2] = lum;
  }

  const spread = Math.max(1, maxLum - minLum);
  for (let i = 0; i < image.data.length; i += 4) {
    const normalized = ((image.data[i] - minLum) * 255) / spread;
    image.data[i] = normalized;
    image.data[i + 1] = normalized;
    image.data[i + 2] = normalized;
  }

  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const p = (y * canvas.width + x) * 4;
      gray[y * canvas.width + x] = image.data[p];
    }
  }

  const integral = new Uint32Array((canvas.width + 1) * (canvas.height + 1));
  for (let y = 1; y <= canvas.height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= canvas.width; x += 1) {
      rowSum += gray[(y - 1) * canvas.width + (x - 1)];
      integral[y * (canvas.width + 1) + x] = integral[(y - 1) * (canvas.width + 1) + x] + rowSum;
    }
  }

  const window = Math.max(12, Math.floor(Math.min(canvas.width, canvas.height) / 28));
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const x0 = Math.max(0, x - window);
      const y0 = Math.max(0, y - window);
      const x1 = Math.min(canvas.width - 1, x + window);
      const y1 = Math.min(canvas.height - 1, y + window);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (canvas.width + 1) + (x1 + 1)] -
        integral[y0 * (canvas.width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (canvas.width + 1) + x0] +
        integral[y0 * (canvas.width + 1) + x0];
      const avg = sum / area;
      const idx = (y * canvas.width + x) * 4;
      const bw = gray[y * canvas.width + x] < avg * 0.92 ? 0 : 255;
      image.data[idx] = bw;
      image.data[idx + 1] = bw;
      image.data[idx + 2] = bw;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function getAxisScore(binaryCanvas: HTMLCanvasElement): number {
  const ctx = binaryCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return 0;
  }
  const { width, height } = binaryCanvas;
  const image = ctx.getImageData(0, 0, width, height);
  const rowCounts = Array<number>(height).fill(0);
  const colCounts = Array<number>(width).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      if (image.data[p] < 128) {
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }

  const mean = (values: number[]) => values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = (values: number[]) => {
    const m = mean(values);
    return values.reduce((acc, value) => acc + (value - m) * (value - m), 0) / values.length;
  };

  return Math.sqrt(variance(rowCounts)) + Math.sqrt(variance(colCounts));
}

function findBestRotationAngle(binaryCanvas: HTMLCanvasElement): number {
  const sample = document.createElement("canvas");
  const max = 420;
  const scale = Math.min(1, max / Math.max(binaryCanvas.width, binaryCanvas.height));
  sample.width = Math.max(1, Math.floor(binaryCanvas.width * scale));
  sample.height = Math.max(1, Math.floor(binaryCanvas.height * scale));
  const sampleCtx = sample.getContext("2d");
  if (!sampleCtx) {
    return 0;
  }
  sampleCtx.drawImage(binaryCanvas, 0, 0, sample.width, sample.height);

  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let angle = -14; angle <= 14; angle += 1) {
    const rotated = rotateCanvas(sample, angle);
    const score = getAxisScore(rotated);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

function otsuThreshold(grayPixels: Uint8ClampedArray): number {
  const hist = Array<number>(256).fill(0);
  for (const value of grayPixels) {
    hist[value] += 1;
  }

  const total = grayPixels.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) {
    sum += t * hist[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) {
      continue;
    }
    const wF = total - wB;
    if (wF === 0) {
      break;
    }
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVariance) {
      maxVariance = between;
      threshold = t;
    }
  }

  return threshold;
}

async function loadFileToImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load image"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function progress(callback: ((state: SudokuRecognitionProgress) => void) | undefined, state: SudokuRecognitionProgress): void {
  callback?.(state);
}

export async function recognizeSudokuFromImageFile(
  file: File,
  onProgress?: (state: SudokuRecognitionProgress) => void,
  options?: RecognizeOptions
): Promise<{ values: BoardValues; previewUrl: string; droppedConflicts: number }> {
  const image = await loadFileToImage(file);
  const sourceCanvas = document.createElement("canvas");
  const maxSize = 1100;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  sourceCanvas.width = Math.max(1, Math.floor(image.width * scale));
  sourceCanvas.height = Math.max(1, Math.floor(image.height * scale));
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

  progress(onProgress, { progress: 0.02, stage: "Detecting puzzle frame..." });
  const detectionBinary = createDetectionBinary(sourceCanvas);
  const corners = options?.manualCorners
    ? {
        topLeft: {
          x: options.manualCorners[0].x * sourceCanvas.width,
          y: options.manualCorners[0].y * sourceCanvas.height
        },
        topRight: {
          x: options.manualCorners[1].x * sourceCanvas.width,
          y: options.manualCorners[1].y * sourceCanvas.height
        },
        bottomRight: {
          x: options.manualCorners[2].x * sourceCanvas.width,
          y: options.manualCorners[2].y * sourceCanvas.height
        },
        bottomLeft: {
          x: options.manualCorners[3].x * sourceCanvas.width,
          y: options.manualCorners[3].y * sourceCanvas.height
        }
      }
    : findGridCorners(detectionBinary);

  let correctedSource = sourceCanvas;
  let correctedBinary = detectionBinary;
  if (corners) {
    const warpedSource = warpCanvasToSquare(sourceCanvas, corners);
    const warpedBinary = warpCanvasToSquare(detectionBinary, corners);
    if (warpedSource && warpedBinary) {
      correctedSource = warpedSource;
      correctedBinary = warpedBinary;
    }
  }

  const angle = findBestRotationAngle(correctedBinary);
  const rotatedBinary = rotateCanvas(correctedBinary, angle);
  const rotatedSource = rotateCanvas(correctedSource, angle);
  const rect = estimateGridRect(rotatedBinary);

  const preview = document.createElement("canvas");
  preview.width = rect.size;
  preview.height = rect.size;
  const previewContext = preview.getContext("2d", { willReadFrequently: true });
  if (!previewContext) {
    throw new Error("Preview canvas failed");
  }
  previewContext.drawImage(
    rotatedSource,
    rect.left,
    rect.top,
    rect.size,
    rect.size,
    0,
    0,
    rect.size,
    rect.size
  );

  progress(onProgress, { progress: 0.08, stage: "Loading recognition engine..." });
  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: tesseract.PSM.SINGLE_CHAR,
    tessedit_char_whitelist: "123456789"
  });

  const detected = createEmptyValues();
  const confidences = Array<number>(81).fill(0);
  const cellSize = rect.size / 9;
  const scratch = document.createElement("canvas");
  scratch.width = 72;
  scratch.height = 72;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) {
    await worker.terminate();
    throw new Error("Scratch canvas failed");
  }

  for (let index = 0; index < 81; index += 1) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const margin = cellSize * 0.24;
    const left = rect.left + col * cellSize + margin;
    const top = rect.top + row * cellSize + margin;
    const width = cellSize - margin * 2;
    const height = cellSize - margin * 2;

    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.fillStyle = "white";
    scratchCtx.fillRect(0, 0, scratch.width, scratch.height);
    scratchCtx.drawImage(rotatedSource, left, top, width, height, 8, 8, 56, 56);

    const original = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    const primary = prepareCellBinary(original, scratch.width, scratch.height, 0.9, 1.1, true);
    scratchCtx.putImageData(primary, 0, 0);

    const stats = detectCellInkStats(primary, scratch.width, scratch.height);
    if (
      stats.inkRatio < 0.01 ||
      stats.bboxWidth < 6 ||
      stats.bboxHeight < 6 ||
      (stats.touchesEdge && stats.inkRatio < 0.04)
    ) {
      progress(onProgress, {
        progress: 0.08 + ((index + 1) / 81) * 0.92,
        stage: `Recognizing cells: ${index + 1}/81`
      });
      continue;
    }

    let bestDigit: number | null = null;
    let bestConfidence = -1;

    const primaryResult = await worker.recognize(scratch);
    const primaryMatch = primaryResult.data.text.match(/[1-9]/);
    if (primaryMatch) {
      bestDigit = Number.parseInt(primaryMatch[0], 10);
      bestConfidence = primaryResult.data.confidence;
    }

    if (!bestDigit || bestConfidence < 34) {
      const fallback = prepareCellBinary(original, scratch.width, scratch.height, 0.96, 1.0, false);
      scratchCtx.putImageData(fallback, 0, 0);
      const fallbackResult = await worker.recognize(scratch);
      const fallbackMatch = fallbackResult.data.text.match(/[1-9]/);
      if (fallbackMatch && fallbackResult.data.confidence > bestConfidence) {
        bestDigit = Number.parseInt(fallbackMatch[0], 10);
        bestConfidence = fallbackResult.data.confidence;
      }
    }

    if (bestDigit && bestConfidence > 16) {
      detected[index] = bestDigit;
      confidences[index] = bestConfidence;
    }

    progress(onProgress, {
      progress: 0.08 + ((index + 1) / 81) * 0.92,
      stage: `Recognizing cells: ${index + 1}/81`
    });
  }

  await worker.terminate();
  const pruned = pruneConflictingDetections(detected, confidences);

  return {
    values: pruned.values,
    previewUrl: preview.toDataURL("image/png"),
    droppedConflicts: pruned.dropped
  };
}
