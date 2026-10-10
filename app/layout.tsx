import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientBoot } from "@/components/ClientBoot";

export const metadata: Metadata = {
  title: "Side Quest",
  description: "A local-first Gemma agent that turns screen time into a 20-minute outdoor quest.",
  manifest: "/manifest.webmanifest",
  applicationName: "Side Quest",
  appleWebApp: { capable: true, title: "Side Quest", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" }
};

export const viewport: Viewport = {
  themeColor: "#3a502a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ClientBoot />
        {children}
      </body>
    </html>
  );
}
