# Sudoku Test Images

Put Sudoku fixture images in this folder.

Recommended naming:
- `game-001.jpg`
- `game-002.png`

Then register each image in `src/lib/sudoku-fixtures.ts` with:
- `imagePath` set to `/test-images/<file>`
- `expectedGrid` set to 81 chars (`1-9` for givens, `.` for empty)
- `enabled: true`
