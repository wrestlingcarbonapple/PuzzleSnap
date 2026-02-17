# PuzzleSnap

PuzzleSnap is a modern Sudoku web app built with Next.js and React.

It supports regular Sudoku gameplay and can recognize a puzzle from an uploaded or pasted image so you can start playing instantly.

## Features

- Play Sudoku with keyboard and on-screen number pad
- Notes mode for candidate numbers
- Delete, undo, and reset
- Highlight invalid placements in red
- Mute completed digits in the number pad
- Highlight blocking paths for selected numbers
- Recognize puzzle from image (drag/drop, file upload, or paste)
- Persist game state across refresh
- Theme support: Light, Dark, System
- Mobile-friendly header and controls

## Tech

- Next.js (App Router)
- React + TypeScript
- Tesseract.js (digit recognition)
- Lucide React (icons)

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run lint
npm run build
npm run start
```

## License

This project is released under **The Unlicense**.

See [`UNLICENSE`](UNLICENSE) for details.
