import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PuzzleSnap",
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
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = "sudokupaste.theme.v1";
                  var raw = window.localStorage.getItem(key);
                  var pref = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
                  var resolved = pref === "system"
                    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
                    : pref;
                  document.documentElement.dataset.theme = resolved;
                } catch (e) {}
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
