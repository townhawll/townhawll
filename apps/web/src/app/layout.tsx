import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TownHawll",
  description: "Discover, discuss, and track the stories you love.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
