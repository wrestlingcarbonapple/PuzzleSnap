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

## Recognition Fixtures

You can benchmark recognition quality per game image.

1. Add images to `public/test-images/`
2. Register fixtures in `src/lib/sudoku-fixtures.ts`
3. Set `expectedGrid` as 81 chars (`1-9` for givens, `.` for empty)
4. Open `/fixtures` and run fixtures

## License

This project is released under **The Unlicense**.

See [`UNLICENSE`](UNLICENSE) for details.
