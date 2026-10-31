import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk } from "next/font/google";
import "./globals.css";

const familjen = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Kansa: ask a country anything",
  description: "5,000 statistically real synthetic Finns answer any question in seconds, talk to their neighbours, and get checked against a real election.",
};

export const viewport: Viewport = { themeColor: "#0c1726", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${familjen.variable} antialiased`}>{children}</body>
    </html>
  );
}
