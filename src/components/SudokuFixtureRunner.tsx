"use client";

import NextImage from "next/image";
import { Play, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { recognizeSudokuFromImageFile } from "@/lib/sudoku-recognition";
import {
  bestAlignment,
  gridToString,
  parseExpectedGrid,
  scoreRecognition,
  sudokuFixtures,
  type SudokuFixture
} from "@/lib/sudoku-fixtures";

type FixtureResult = {
  fixtureId: string;
  status: "pass" | "warn" | "error";
  message: string;
  diagnostic?: string;
  accuracy?: number;
  falsePositives?: number;
};

async function fetchFixtureFile(path: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load fixture image: ${path}`);
  }
  const blob = await response.blob();
  const parts = path.split("/");
  const name = parts[parts.length - 1] || "fixture-image";
  return new File([blob], name, { type: blob.type || "image/png" });
}

function statusClass(status: FixtureResult["status"]): string {
  if (status === "pass") return "fixture-pass";
  if (status === "warn") return "fixture-warn";
  return "fixture-error";
}

export default function SudokuFixtureRunner() {
  const [running, setRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [results, setResults] = useState<FixtureResult[]>([]);

  const enabledFixtures = useMemo(
    () => sudokuFixtures.filter((fixture) => fixture.enabled !== false),
    []
  );

  const runFixture = async (fixture: SudokuFixture) => {
    setActiveId(fixture.id);
    try {
      const expected = parseExpectedGrid(fixture.expectedGrid);
      const file = await fetchFixtureFile(fixture.imagePath);
      const recognized = await recognizeSudokuFromImageFile(file);
      const score = scoreRecognition(expected, recognized.values);
      const aligned = bestAlignment(expected, recognized.values);

      const status: FixtureResult["status"] =
        score.accuracy >= 0.92 && score.falsePositives <= 2
          ? "pass"
          : score.accuracy >= 0.75 && score.falsePositives <= 8
            ? "warn"
            : "error";

      const message =
        `${Math.round(score.accuracy * 100)}% match ` +
        `(${score.matchedExpected}/${score.totalExpected}), false positives: ${score.falsePositives}, ` +
        `pruned: ${recognized.droppedConflicts}`;

      setResults((prev) => [
        ...prev.filter((result) => result.fixtureId !== fixture.id),
        {
          fixtureId: fixture.id,
          status,
          message,
          diagnostic:
            `Best alignment: ${aligned.transform}, ${Math.round(aligned.accuracy * 100)}% ` +
            `(${aligned.matchedExpected}/${aligned.totalExpected}), FP: ${aligned.falsePositives}. ` +
            `Recognized: ${gridToString(recognized.values)}`,
          accuracy: score.accuracy,
          falsePositives: score.falsePositives
        }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture failed";
      setResults((prev) => [
        ...prev.filter((result) => result.fixtureId !== fixture.id),
        {
          fixtureId: fixture.id,
          status: "error",
          message
        }
      ]);
    } finally {
      setActiveId(null);
    }
  };

  const runAll = async () => {
    setRunning(true);
    setResults([]);
    for (const fixture of enabledFixtures) {
      // Run sequentially to avoid spinning up many OCR workers at once.
      // This keeps fixture runs stable on lower-power machines.
      await runFixture(fixture);
    }
    setRunning(false);
  };

  return (
    <div className="page-shell">
      <main className="card setup-card">
        <div className="title-block">
          <div className="title-row">
            <div className="title-main">
              <NextImage src="/logo.png" alt="PuzzleSnap logo" width={72} height={72} className="app-logo" />
              <div className="title-text">
                <h1>Sudoku Fixture Runner</h1>
                <span className="title-chip">Recognition QA</span>
              </div>
            </div>
          </div>
          <p>Run stored Sudoku images against expected grids to track recognition quality per game.</p>
        </div>

        <section className="setup-type-panel">
          <h2>Actions</h2>
          <div className="import-actions">
            <button type="button" className="key" onClick={runAll} disabled={running || enabledFixtures.length === 0}>
              <span className="key-content">
                {running ? <RefreshCw size={16} className="spin" aria-hidden /> : <Play size={16} aria-hidden />}
                {running ? "Running..." : "Run all fixtures"}
              </span>
            </button>
          </div>
          {enabledFixtures.length === 0 && (
            <p>No enabled fixtures yet. Add entries in `src/lib/sudoku-fixtures.ts` and images under `public/test-images/`.</p>
          )}
        </section>

        <section className="setup-type-panel">
          <h2>Fixtures</h2>
          <div className="fixture-list">
            {sudokuFixtures.map((fixture) => {
              const result = results.find((entry) => entry.fixtureId === fixture.id);
              const disabled = fixture.enabled === false;
              return (
                <div key={fixture.id} className="fixture-item">
                  <div>
                    <strong>{fixture.name}</strong>
                    <p>{fixture.imagePath}</p>
                    <p>{disabled ? "Disabled" : "Enabled"}</p>
                    {result && <p className={statusClass(result.status)}>{result.message}</p>}
                    {result?.diagnostic && <p>{result.diagnostic}</p>}
                    {activeId === fixture.id && <p>Running OCR...</p>}
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      className="key"
                      onClick={() => void runFixture(fixture)}
                      disabled={running || activeId === fixture.id}
                    >
                      <span className="key-content">
                        <Play size={16} aria-hidden />
                        Run
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
