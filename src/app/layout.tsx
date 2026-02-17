import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SudokuPaste",
  description: "Sudoku app with notes, undo, and OCR-based puzzle import",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
