import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TownHawll Admin",
  description: "TownHawll staff operations.",
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
