"use client";

import NextImage from "next/image";
import { Eraser, Monitor, Moon, PenLine, RotateCcw, Sun, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type ThemePreference = "light" | "dark" | "system";

type SudokuAppProps = {
  initialValues?: BoardValues | null;
  onBack?: () => void;
};

const THEME_STORAGE_KEY = "sudokupaste.theme.v1";
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function sanitizeInitial(values?: BoardValues | null): BoardValues {
  if (!values || values.length !== 81) {
    return createEmptyValues();
  }
  return values.map((value) => (value && value >= 1 && value <= 9 ? value : null));
}

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

export default function SudokuApp({ initialValues = null, onBack }: SudokuAppProps) {
  const initial = useMemo(() => sanitizeInitial(initialValues), [initialValues]);
  const [startValues] = useState<BoardValues>(initial);
  const [values, setValues] = useState<BoardValues>(initial);
  const [notes, setNotes] = useState<number[]>(() => createEmptyNotes());
  const [selected, setSelected] = useState<number | null>(0);
  const [noteMode, setNoteMode] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  });

  const [history, setHistory] = useState<Snapshot[]>([{ values: [...initial], notes: createEmptyNotes() }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = themePreference === "system" ? (media.matches ? "dark" : "light") : themePreference;
      document.documentElement.dataset.theme = resolved;
    };
    applyTheme();
    if (themePreference !== "system") {
      return;
    }
    media.addEventListener("change", applyTheme);
    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, [themePreference]);

  const completed = useMemo(() => computeCompletedDigits(values), [values]);
  const conflictMask = useMemo(() => computeConflictMask(values), [values]);
  const ThemeIcon = themePreference === "light" ? Sun : themePreference === "dark" ? Moon : Monitor;

  const selectedValue = selected !== null ? values[selected] : null;
  const blockingMask = useMemo(() => {
    if (selectedValue === null) {
      return Array<boolean>(81).fill(false);
    }
    return computeBlockingMask(values, selectedValue);
  }, [selectedValue, values]);

  const commitSnapshot = useCallback(
    (snapshot: Snapshot) => {
      setValues(snapshot.values);
      setNotes(snapshot.notes);
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1).map(cloneSnapshot);
        trimmed.push(cloneSnapshot(snapshot));
        setHistoryIndex(trimmed.length - 1);
        return trimmed;
      });
    },
    [historyIndex]
  );

  const applyDigit = useCallback(
    (digit: number | null) => {
      const snapshot = nextFromMove(values, notes, startValues, selected, noteMode, digit);
      if (snapshot.values === values && snapshot.notes === notes) {
        return;
      }
      commitSnapshot(snapshot);
    },
    [commitSnapshot, noteMode, notes, selected, startValues, values]
  );

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
            <div className="title-main">
              <NextImage src="/logo.png" alt="PuzzleSnap logo" width={72} height={72} className="app-logo" />
              <div className="title-text">
                <h1>PuzzleSnap</h1>
                <span className="title-chip">Sudoku</span>
              </div>
            </div>
            {onBack && (
              <button type="button" className="key" onClick={onBack}>
                Back
              </button>
            )}
            <button
              type="button"
              className="theme-mobile-button"
              onClick={() =>
                setThemePreference((prev) => (prev === "light" ? "dark" : prev === "dark" ? "system" : "light"))
              }
              aria-label={`Theme: ${themePreference}. Tap to change theme mode.`}
            >
              <ThemeIcon size={18} aria-hidden />
            </button>
            <div className="theme-toggle" role="group" aria-label="Theme">
              <button
                type="button"
                className={`theme-button ${themePreference === "light" ? "theme-button-active" : ""}`}
                onClick={() => setThemePreference("light")}
              >
                <Sun size={15} aria-hidden />
                Light
              </button>
              <button
                type="button"
                className={`theme-button ${themePreference === "dark" ? "theme-button-active" : ""}`}
                onClick={() => setThemePreference("dark")}
              >
                <Moon size={15} aria-hidden />
                Dark
              </button>
              <button
                type="button"
                className={`theme-button ${themePreference === "system" ? "theme-button-active" : ""}`}
                onClick={() => setThemePreference("system")}
              >
                <Monitor size={15} aria-hidden />
                System
              </button>
            </div>
          </div>
          <p>Solve the recognized puzzle.</p>
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
      </main>
    </div>
  );
}
