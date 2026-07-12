import type { Metadata } from "next";
import { AppLoader } from "../components/app-loader";
import { UpdaterNotification } from "../components/updater-notification";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZStream",
  description: "วิดเจ็ตสำหรับไลฟ์สตรีม โอเวอร์เลย์แบบเรียลไทม์ และระบบอ่านข้อความอัตโนมัติ (TTS)"
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
