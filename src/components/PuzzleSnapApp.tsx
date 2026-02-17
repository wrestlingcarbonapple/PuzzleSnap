"use client";

import NextImage from "next/image";
import { ArrowLeft, Camera, Eye, EyeOff, ImagePlus, Play, Trash2 } from "lucide-react";
import { ChangeEvent, DragEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SudokuApp from "@/components/SudokuApp";
import { createEmptyValues, type BoardValues } from "@/lib/sudoku";
import { recognizeSudokuFromImageFile, type NormalizedCorner } from "@/lib/sudoku-recognition";

type Stage = "upload" | "detect" | "play";

function autoOrderCorners(corners: NormalizedCorner[]): NormalizedCorner[] {
  if (corners.length !== 4) {
    return corners;
  }
  const sortedByY = [...corners].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

export default function PuzzleSnapApp() {
  const [stage, setStage] = useState<Stage>("upload");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Upload a Sudoku image to start.");
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recognizedValues, setRecognizedValues] = useState<BoardValues>(createEmptyValues());
  const [selectedDetectedCell, setSelectedDetectedCell] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [manualCorners, setManualCorners] = useState<NormalizedCorner[]>([]);
  const orderedCorners = useMemo(
    () => (manualCorners.length === 4 ? autoOrderCorners(manualCorners) : null),
    [manualCorners]
  );

  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageHitRef = useRef<HTMLDivElement | null>(null);
  const previousCornerCountRef = useRef(0);

  const runRecognition = useCallback(async (file: File, corners?: NormalizedCorner[]) => {
    setBusy(true);
    setError(null);
    setMessage("Preparing image...");
    try {
      const result = await recognizeSudokuFromImageFile(
        file,
        ({ progress: p, stage: s }) => {
          setProgress(p);
          setMessage(s);
        },
        corners && corners.length === 4
          ? { manualCorners: [corners[0], corners[1], corners[2], corners[3]] }
          : undefined
      );
      setPreviewUrl(result.previewUrl);
      setRecognizedValues(result.values);
      setSelectedDetectedCell(null);
      setShowOverlay(true);
      setMessage(
        result.droppedConflicts > 0
          ? `Recognition complete. Removed ${result.droppedConflicts} conflicting digits.`
          : "Recognition complete."
      );
    } catch (recognitionError) {
      const text = recognitionError instanceof Error ? recognitionError.message : "Recognition failed";
      setError(text);
      setMessage("Recognition failed.");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }, []);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please use an image file.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setOriginalImageUrl((prev) => {
      if (prev?.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return objectUrl;
    });
    setImportFile(file);
    setManualCorners([]);
    setStage("detect");
    await runRecognition(file);
  }, [runRecognition]);

  useEffect(() => {
    return () => {
      if (originalImageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(originalImageUrl);
      }
    };
  }, [originalImageUrl]);

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      if (stage !== "upload") {
        return;
      }
      const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) =>
        file.type.startsWith("image/")
      );
      if (!imageFile) {
        return;
      }
      event.preventDefault();
      await handleFile(imageFile);
    };

    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
    };
  }, [handleFile, stage]);

  useEffect(() => {
    if (!importFile || stage !== "detect") {
      previousCornerCountRef.current = manualCorners.length;
      return;
    }

    const previous = previousCornerCountRef.current;
    const current = manualCorners.length;

    if (previous < 4 && current === 4 && orderedCorners) {
      void runRecognition(importFile, orderedCorners);
    } else if (previous > 0 && current === 0) {
      void runRecognition(importFile);
    }

    previousCornerCountRef.current = current;
  }, [importFile, manualCorners.length, orderedCorners, runRecognition, stage]);

  const onManualImageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!imageHitRef.current || manualCorners.length >= 4) {
      return;
    }
    const rect = imageHitRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setManualCorners((prev) => [...prev, { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }]);
  };

  const setDetectedDigit = (digit: number | null) => {
    if (selectedDetectedCell === null) {
      return;
    }
    setRecognizedValues((prev) => {
      const next = [...prev];
      next[selectedDetectedCell] = digit;
      return next;
    });
  };

  if (stage === "play") {
    return (
      <SudokuApp
        initialValues={recognizedValues}
        onBack={() => {
          setStage("detect");
        }}
      />
    );
  }

  if (stage === "upload") {
    return (
      <div className="page-shell upload-stage-shell">
        <main className="card setup-card upload-card">
          <div className="title-block">
            <div className="title-row upload-title-row">
              <div className="title-main upload-title-main">
                <NextImage src="/logo.png" alt="PuzzleSnap logo" width={72} height={72} className="app-logo" />
                <div className="title-text">
                  <h1>PuzzleSnap</h1>
                  <span className="title-chip">Step 1 · Upload</span>
                </div>
              </div>
            </div>
            <p>Take a picture of your puzzle or upload a photo of it</p>
          </div>

          <section
            className={`setup-drop-zone upload-drop-centered ${isDragging ? "import-zone-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={async (event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0] ?? null;
              await handleFile(file);
            }}
          >
            <h2>Upload image</h2>
            <p>Take a picture of your puzzle or upload a photo of it</p>
            <div className="import-actions">
              <button type="button" className="key" onClick={() => fileInputRef.current?.click()}>
                <span className="key-content">
                  <ImagePlus size={16} aria-hidden />
                  Import
                </span>
              </button>
              <button type="button" className="key" onClick={() => cameraInputRef.current?.click()}>
                <span className="key-content">
                  <Camera size={16} aria-hidden />
                  Camera
                </span>
              </button>
            </div>
            <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={async (event: ChangeEvent<HTMLInputElement>) => {
              await handleFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }} />
            <input
              ref={cameraInputRef}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                await handleFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <main className="card setup-card">
        <div className="title-block">
          <div className="title-row">
            <div className="title-main">
              <NextImage src="/logo.png" alt="PuzzleSnap logo" width={72} height={72} className="app-logo" />
              <div className="title-text">
                <h1>PuzzleSnap</h1>
                <span className="title-chip">Step 2 · Detect</span>
              </div>
            </div>
            <div className="detect-header-actions">
              <button
                type="button"
                className="icon-only-button back-button"
                onClick={() => {
                  setStage("upload");
                  setManualCorners([]);
                  setPreviewUrl(null);
                  setError(null);
                  setMessage("Upload a Sudoku image to start.");
                }}
                disabled={busy}
                aria-label="Back to upload"
                title="Back"
              >
                <ArrowLeft size={18} aria-hidden />
              </button>
              <button
                type="button"
                className="icon-only-button play-fab"
                onClick={() => setStage("play")}
                disabled={busy || !recognizedValues.some((value) => value !== null)}
                aria-label="Play puzzle"
                title="Play"
              >
                <Play size={22} aria-hidden />
              </button>
            </div>
          </div>
          <p>Check recognition preview. If off, select 4 corners and rerun.</p>
        </div>

        <section className="setup-drop-zone">
          <h2>Detection preview</h2>
          {busy && (
            <div className="ocr-status">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          <p>{message}</p>
          {error && <p className="ocr-error">{error}</p>}

          {previewUrl && (
            <div className="preview-wrap detection-preview-wrap">
              <NextImage src={previewUrl} alt="Recognition preview" width={540} height={540} className="preview-image" />
              {busy && (
                <div className="detection-progress-overlay" aria-live="polite">
                  <div className="detection-progress-card">
                    <p>{message}</p>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}
              {showOverlay && (
                <div className="detection-grid-overlay" role="grid" aria-label="Recognized grid overlay">
                  {recognizedValues.map((value, index) => {
                    const row = Math.floor(index / 9);
                    const col = index % 9;
                    const classes = ["detection-cell"];
                    if (selectedDetectedCell === index) classes.push("detection-cell-selected");
                    if ((col + 1) % 3 === 0 && col < 8) classes.push("detection-cell-box-right");
                    if ((row + 1) % 3 === 0 && row < 8) classes.push("detection-cell-box-bottom");
                    return (
                      <button
                        key={index}
                        type="button"
                        className={classes.join(" ")}
                        onClick={() => setSelectedDetectedCell(index)}
                      >
                        {value ?? ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {previewUrl && (
            <div className="import-actions">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className="key"
                  onClick={() => setDetectedDigit(digit)}
                  disabled={selectedDetectedCell === null}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="key"
                onClick={() => setDetectedDigit(null)}
                disabled={selectedDetectedCell === null}
                aria-label="Clear selected cell"
                title="Clear selected cell"
              >
                <Trash2 size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="key"
                onClick={() => setShowOverlay((prev) => !prev)}
                aria-label={showOverlay ? "Hide overlay" : "Show overlay"}
                title={showOverlay ? "Hide overlay" : "Show overlay"}
              >
                {showOverlay ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          )}
        </section>

        {originalImageUrl && (
          <section className="setup-type-panel">
            <h2>Optional corner correction</h2>
            <p>Click on the four corners of the puzzle.</p>
            <div className="preview-wrap manual-corner-preview">
              <div ref={imageHitRef} className="manual-corner-image-hit" onClick={onManualImageClick}>
                <NextImage
                  src={originalImageUrl}
                  alt="Original upload for corner correction"
                  width={560}
                  height={560}
                  className="preview-image"
                  unoptimized
                />
              </div>

              {orderedCorners && (
                <svg className="corner-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polygon
                    points={orderedCorners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(" ")}
                    className="corner-overlay-poly"
                  />
                  <rect
                    x={`${Math.min(...orderedCorners.map((corner) => corner.x)) * 100}`}
                    y={`${Math.min(...orderedCorners.map((corner) => corner.y)) * 100}`}
                    width={`${
                      (Math.max(...orderedCorners.map((corner) => corner.x)) -
                        Math.min(...orderedCorners.map((corner) => corner.x))) *
                      100
                    }`}
                    height={`${
                      (Math.max(...orderedCorners.map((corner) => corner.y)) -
                        Math.min(...orderedCorners.map((corner) => corner.y))) *
                      100
                    }`}
                    className="corner-overlay-box"
                  />
                </svg>
              )}

              {(orderedCorners ?? manualCorners).map((corner, index) => (
                <button
                  key={`${corner.x}-${corner.y}-${index}`}
                  type="button"
                  className="corner-dot"
                  style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setManualCorners((prev) => {
                      const removeAt = prev.findIndex(
                        (item) => Math.abs(item.x - corner.x) < 0.0001 && Math.abs(item.y - corner.y) < 0.0001
                      );
                      return removeAt < 0 ? prev : prev.filter((_, i) => i !== removeAt);
                    });
                  }}
                >
                  <span className="corner-dot-label">{index + 1}</span>
                </button>
              ))}
            </div>

            <div className="import-actions">
              <button
                type="button"
                className="key"
                onClick={async () => {
                  if (!importFile) {
                    return;
                  }
                  setManualCorners([]);
                  await runRecognition(importFile);
                }}
                disabled={busy || manualCorners.length === 0}
              >
                Clear corners
              </button>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
