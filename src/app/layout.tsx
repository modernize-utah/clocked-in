import type { Metadata, Viewport } from "next";
import { Arimo, Geist, Geist_Mono, Nunito_Sans, Source_Sans_3 } from "next/font/google";
import { Providers } from "@/components/providers";
import { defaultIcons } from "@/lib/favicon";
import { portalName } from "@/lib/portal";
import "./globals.css";

const arimo = Arimo({
  variable: "--font-arimo",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  preload: false,
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  preload: false,
});

const nunito = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: portalName(), template: `%s · ${portalName()}` },
  description: "Log volunteer hours, value them for grants, and report on impact.",
  icons: defaultIcons,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${arimo.variable} ${geistSans.variable} ${sourceSans.variable} ${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
