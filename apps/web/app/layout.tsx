import type { Metadata } from "next";
import { AppLoader } from "../components/app-loader";
import { UpdaterNotification } from "../components/updater-notification";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZStream",
  description: "Live Stream Widget, Real-time Overlay และ TTS Automation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <AppLoader>{children}</AppLoader>
        <UpdaterNotification />
      </body>
    </html>
  );
}
