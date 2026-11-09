import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
const sans = DM_Sans({ variable: "--font-body", subsets: ["latin"] });
const mono = DM_Mono({
  variable: "--font-code",
  weight: "400",
  subsets: ["latin"],
});
const title = "Opaline — A database client built around your projects";
const description =
  "Keep each project’s connections, SQL tabs, and table changes together in one desktop workspace. PostgreSQL first. macOS coming soon.";
// Set SITE_URL to the deployed origin before launch. Local previews have no canonical.
const siteUrl = process.env.SITE_URL
  ? new URL(process.env.SITE_URL)
  : undefined;

export const metadata: Metadata = {
  metadataBase: siteUrl ?? new URL("http://localhost:3000"),
  title,
  description,
  applicationName: "Opaline",
  alternates: siteUrl ? { canonical: "/" } : undefined,
  icons: { icon: "/icon.svg" },
  openGraph: {
    title,
    description,
    siteName: "Opaline",
    url: siteUrl ? "/" : undefined,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
