import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZStream",
  description: "Live Stream Widget, Real-time Overlay และ TTS Automation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
