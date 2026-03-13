import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { inter, brand } from "./fonts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "OnTheSpot",
    template: "%s | OnTheSpot",
  },
  description: "Nearby stories on the map.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "OnTheSpot",
    description: "Nearby stories on the map.",
    images: [
      {
        url: "/social-preview.svg",
        width: 1200,
        height: 630,
        alt: "OnTheSpot",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OnTheSpot",
    description: "Nearby stories on the map.",
    images: ["/social-preview.svg"],
  },
};

export default function RootLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${brand.variable}`}>
      <head>
        {/* Prefetch key routes so redirects feel instant */}
        <link rel="prefetch" href="/login" />
        <link rel="prefetch" href="/account" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        {children}
        {modal}
      </body>
    </html>
  );
}
