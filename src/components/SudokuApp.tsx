"use client";

import NextImage from "next/image";
import { Check, Eraser, PenLine, RotateCcw, Undo2, Upload } from "lucide-react";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bitForDigit,
  computeBlockingMask,
  computeCompletedDigits,
  computeConflictMask,
  createEmptyNotes,
  createEmptyValues,
  getPeers,
  hasNote,
  toRowCol,
  type BoardValues
} from "@/lib/sudoku";

type Snapshot = {
  values: BoardValues;
  notes: number[];
};

const STORAGE_KEY = "sudokupaste.game.v1";
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    values: [...snapshot.values],
    notes: [...snapshot.notes]
  };
}

function nextFromMove(
  values: BoardValues,
  notes: number[],
  startValues: BoardValues,
  selected: number | null,
  noteMode: boolean,
  digit: number | null
): Snapshot {
  if (selected === null || startValues[selected] !== null) {
    return { values, notes };
  }

  const nextValues = [...values];
  const nextNotes = [...notes];

  if (digit === null) {
    nextValues[selected] = null;
    nextNotes[selected] = 0;
    return { values: nextValues, notes: nextNotes };
  }

  if (noteMode && nextValues[selected] === null) {
    nextNotes[selected] ^= bitForDigit(digit);
    return { values: nextValues, notes: nextNotes };
  }

  nextValues[selected] = digit;
  nextNotes[selected] = 0;

  const peers = getPeers(selected);
  for (const peer of peers) {
    nextNotes[peer] &= ~bitForDigit(digit);
  }

  return { values: nextValues, notes: nextNotes };
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

export default function SudokuApp() {
  const [startValues, setStartValues] = useState<BoardValues>(() => createEmptyValues());
  const [values, setValues] = useState<BoardValues>(() => createEmptyValues());
  const [notes, setNotes] = useState<number[]>(() => createEmptyNotes());
  const [selected, setSelected] = useState<number | null>(0);
  const [noteMode, setNoteMode] = useState(false);

  const [history, setHistory] = useState<Snapshot[]>(() => [
    {
      values: createEmptyValues(),
      notes: createEmptyNotes()
    }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMessage, setOcrMessage] = useState<string>("");
  const [recognizedValues, setRecognizedValues] = useState<BoardValues | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        startValues?: Array<number | null>;
        values?: Array<number | null>;
        notes?: Array<number>;
        noteMode?: boolean;
      };

      if (!parsed.startValues || !parsed.values || !parsed.notes) {
        return;
      }
      if (parsed.startValues.length !== 81 || parsed.values.length !== 81 || parsed.notes.length !== 81) {
        return;
      }

      const restoredStart = parsed.startValues.map((value) =>
        value !== null && value >= 1 && value <= 9 ? value : null
      );
      const restoredValues = parsed.values.map((value) =>
        value !== null && value >= 1 && value <= 9 ? value : null
      );
      const restoredNotes = parsed.notes.map((value) => (Number.isInteger(value) ? value : 0));

      setStartValues(restoredStart);
      setValues(restoredValues);
      setNotes(restoredNotes);
      setNoteMode(Boolean(parsed.noteMode));
      const snapshot = { values: [...restoredValues], notes: [...restoredNotes] };
      setHistory([snapshot]);
      setHistoryIndex(0);
      setSelected(0);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const payload = {
      startValues,
      values,
      notes,
      noteMode
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [noteMode, notes, startValues, values]);

  const completed = useMemo(() => computeCompletedDigits(values), [values]);
  const conflictMask = useMemo(() => computeConflictMask(values), [values]);

  const selectedValue = selected !== null ? values[selected] : null;
  const blockingMask = useMemo(() => {
    if (selectedValue === null) {
      return Array<boolean>(81).fill(false);
    }
    return computeBlockingMask(values, selectedValue);
  }, [selectedValue, values]);

  const commitSnapshot = useCallback((snapshot: Snapshot) => {
    setValues(snapshot.values);
    setNotes(snapshot.notes);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1).map(cloneSnapshot);
      trimmed.push(cloneSnapshot(snapshot));
      setHistoryIndex(trimmed.length - 1);
      return trimmed;
    });
  }, [historyIndex]);

  const applyDigit = useCallback((digit: number | null) => {
    const snapshot = nextFromMove(values, notes, startValues, selected, noteMode, digit);
    if (snapshot.values === values && snapshot.notes === notes) {
      return;
    }
    commitSnapshot(snapshot);
  }, [commitSnapshot, noteMode, notes, selected, startValues, values]);

  const applyRecognizedPuzzle = (recognized: BoardValues) => {
    const normalized = recognized.map((value) => (value && value >= 1 && value <= 9 ? value : null));
    setStartValues(normalized);
    setValues(normalized);
    const cleanNotes = createEmptyNotes();
    setNotes(cleanNotes);
    const initialSnapshot = { values: [...normalized], notes: cleanNotes };
    setHistory([initialSnapshot]);
    setHistoryIndex(0);
    setSelected(0);
  };

  const performOcr = async (file: File) => {
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrError(null);
    setRecognizedValues(null);
    setOcrMessage("Preparing image...");

    try {
      const image = await loadFileToImage(file);
      const canvas = document.createElement("canvas");
      const maxSize = 1100;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.floor(image.width * scale));
      canvas.height = Math.max(1, Math.floor(image.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Canvas context unavailable");
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const rect = estimateGridRect(canvas);
      const preview = document.createElement("canvas");
      preview.width = rect.size;
      preview.height = rect.size;
      const previewContext = preview.getContext("2d", { willReadFrequently: true });
      if (!previewContext) {
        throw new Error("Preview canvas failed");
      }
      previewContext.drawImage(canvas, rect.left, rect.top, rect.size, rect.size, 0, 0, rect.size, rect.size);
      setPreviewUrl(preview.toDataURL("image/png"));

      setOcrMessage("Loading OCR engine...");
      const tesseract = await import("tesseract.js");
      const worker = await tesseract.createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "123456789"
      });

      const detected = createEmptyValues();
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
        const margin = cellSize * 0.2;
        const left = rect.left + col * cellSize + margin;
        const top = rect.top + row * cellSize + margin;
        const width = cellSize - margin * 2;
        const height = cellSize - margin * 2;

        scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
        scratchCtx.fillStyle = "white";
        scratchCtx.fillRect(0, 0, scratch.width, scratch.height);
        scratchCtx.drawImage(canvas, left, top, width, height, 8, 8, 56, 56);

        const imageData = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
        for (let p = 0; p < imageData.data.length; p += 4) {
          const lum =
            0.2126 * imageData.data[p] +
            0.7152 * imageData.data[p + 1] +
            0.0722 * imageData.data[p + 2];
          const bw = lum < 165 ? 0 : 255;
          imageData.data[p] = bw;
          imageData.data[p + 1] = bw;
          imageData.data[p + 2] = bw;
        }
        scratchCtx.putImageData(imageData, 0, 0);

        const result = await worker.recognize(scratch);
        const digitMatch = result.data.text.match(/[1-9]/);
        if (digitMatch && result.data.confidence > 38) {
          detected[index] = Number.parseInt(digitMatch[0], 10);
        }

        setOcrProgress((index + 1) / 81);
        setOcrMessage(`Recognizing cells: ${index + 1}/81`);
      }

      await worker.terminate();
      setRecognizedValues(detected);
      setOcrMessage("OCR complete. Apply puzzle if it looks right.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR failed";
      setOcrError(message);
      setOcrMessage("");
    } finally {
      setOcrBusy(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setOcrError("Please use an image file.");
      return;
    }
    await performOcr(file);
  };

  const onChooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    await handleFile(file);
    event.target.value = "";
  };

  const onDropFile = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    await handleFile(file);
  };

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) =>
        file.type.startsWith("image/")
      );
      if (imageFile) {
        event.preventDefault();
        await handleFile(imageFile);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        applyDigit(Number.parseInt(event.key, 10));
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        event.preventDefault();
        applyDigit(null);
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNoteMode((prev) => !prev);
        return;
      }

      if (event.key.toLowerCase() === "u") {
        event.preventDefault();
        if (historyIndex > 0) {
          const previous = history[historyIndex - 1];
          setValues([...previous.values]);
          setNotes([...previous.notes]);
          setHistoryIndex((prev) => prev - 1);
        }
        return;
      }

      if (selected === null) {
        return;
      }

      const { row, col } = toRowCol(selected);
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected(((row + 8) % 9) * 9 + col);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected(((row + 1) % 9) * 9 + col);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelected(row * 9 + ((col + 8) % 9));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelected(row * 9 + ((col + 1) % 9));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [applyDigit, history, historyIndex, selected]);

  return (
    <div className="page-shell">
      <main className="card">
        <div className="title-block">
          <div className="title-row">
            <NextImage src="/logo.png" alt="SudokuPaste logo" width={72} height={72} className="app-logo" />
            <div className="title-text">
              <h1>SudokuPaste</h1>
              <span className="title-chip">OCR + Play</span>
            </div>
          </div>
          <p>Type, note, undo, and import puzzles directly from images.</p>
        </div>

        <section className="board-wrap">
          <div className="board" role="grid" aria-label="Sudoku grid">
            {values.map((value, index) => {
              const row = Math.floor(index / 9);
              const col = index % 9;
              const isSelected = selected === index;
              const selectedPos = selected !== null ? toRowCol(selected) : null;
              const inSelectedUnit =
                selectedPos !== null &&
                (selectedPos.row === row ||
                  selectedPos.col === col ||
                  (Math.floor(selectedPos.row / 3) === Math.floor(row / 3) &&
                    Math.floor(selectedPos.col / 3) === Math.floor(col / 3)));
              const sameNumber = selectedValue !== null && value === selectedValue;
              const isGiven = startValues[index] !== null;
              const blocked = selectedValue !== null && blockingMask[index] && value === null;
              const invalid = conflictMask[index];

              const classNames = ["cell"];
              if (isSelected) classNames.push("cell-selected");
              if (inSelectedUnit) classNames.push("cell-unit");
              if (sameNumber) classNames.push("cell-same-number");
              if (isGiven) classNames.push("cell-given");
              if (blocked) classNames.push("cell-blocked");
              if (invalid) classNames.push("cell-invalid");
              if ((col + 1) % 3 === 0 && col < 8) classNames.push("cell-box-right");
              if ((row + 1) % 3 === 0 && row < 8) classNames.push("cell-box-bottom");

              return (
                <button
                  key={index}
                  type="button"
                  className={classNames.join(" ")}
                  onClick={() => setSelected(index)}
                >
                  {value !== null ? (
                    <span className="cell-value">{value}</span>
                  ) : (
                    <span className="notes-grid">
                      {DIGITS.map((digit) => (
                        <span key={digit} className="note-slot">
                          {hasNote(notes[index], digit) ? digit : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="controls">
          <div className="keypad">
            {DIGITS.map((digit) => {
              const muted = completed.has(digit);
              return (
                <button
                  key={digit}
                  type="button"
                  className={`key ${muted ? "key-muted" : ""}`}
                  onClick={() => applyDigit(digit)}
                >
                  {digit}
                </button>
              );
            })}
          </div>

          <div className="action-row">
            <button type="button" className={`key ${noteMode ? "key-note-on" : ""}`} onClick={() => setNoteMode((prev) => !prev)}>
              <span className="key-content">
                <PenLine size={16} aria-hidden />
                Note {noteMode ? "ON" : "OFF"}
              </span>
            </button>
            <button type="button" className="key" onClick={() => applyDigit(null)}>
              <span className="key-content">
                <Eraser size={16} aria-hidden />
                Delete
              </span>
            </button>
            <button
              type="button"
              className="key"
              onClick={() => {
                if (historyIndex > 0) {
                  const previous = history[historyIndex - 1];
                  setValues([...previous.values]);
                  setNotes([...previous.notes]);
                  setHistoryIndex((prev) => prev - 1);
                }
              }}
            >
              <span className="key-content">
                <Undo2 size={16} aria-hidden />
                Undo
              </span>
            </button>
            <button
              type="button"
              className="key"
              onClick={() => {
                const cleanNotes = createEmptyNotes();
                const snapshot = { values: [...startValues], notes: cleanNotes };
                setValues(snapshot.values);
                setNotes(snapshot.notes);
                setHistory((prev) => {
                  const trimmed = prev.slice(0, historyIndex + 1).map(cloneSnapshot);
                  trimmed.push(snapshot);
                  setHistoryIndex(trimmed.length - 1);
                  return trimmed;
                });
              }}
            >
              <span className="key-content">
                <RotateCcw size={16} aria-hidden />
                Reset
              </span>
            </button>
          </div>
        </section>

        <section
          className={`import-zone ${isDragging ? "import-zone-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDropFile}
        >
          <h2>Import from image</h2>
          <p>Drop an image here or paste one with Ctrl+V / Cmd+V.</p>
          <div className="import-actions">
            <button type="button" className="key" onClick={() => fileInputRef.current?.click()} disabled={ocrBusy}>
              <span className="key-content">
                <Upload size={16} aria-hidden />
                Choose Image
              </span>
            </button>
            {recognizedValues && (
              <button
                type="button"
                className="key"
                onClick={() => applyRecognizedPuzzle(recognizedValues)}
                disabled={ocrBusy}
              >
                <span className="key-content">
                  <Check size={16} aria-hidden />
                  Use OCR Puzzle
                </span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={onChooseFile} />

          {ocrBusy && (
            <div className="ocr-status">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
              <p>{ocrMessage}</p>
            </div>
          )}

          {!ocrBusy && ocrMessage && <p className="ocr-message">{ocrMessage}</p>}
          {ocrError && <p className="ocr-error">{ocrError}</p>}

          {previewUrl && (
            <div className="preview-wrap">
              <NextImage
                src={previewUrl}
                alt="Detected Sudoku grid preview"
                width={520}
                height={520}
                className="preview-image"
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
