import { Inter, Poppins } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const brand = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-brand",
  display: "swap",
});