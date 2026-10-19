import type { Metadata } from "next";
import { Public_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

// Display face: headings, figures and anything that should feel set rather
// than typed.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resale Tracker",
  description: "Track your reselling inventory, sales, expenses, and profit.",
};

// Applies the saved theme before the first paint, so a dark-mode user never
// sees a white flash. Runs ahead of React, hence the inline script; it mirrors
// what ThemeToggle writes, and falls back to the OS preference when no choice
// has been saved yet.
const themeScript = `
try {
  var saved = localStorage.getItem('theme');
  var dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
