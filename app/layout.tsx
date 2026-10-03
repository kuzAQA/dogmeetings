import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@ncdai/react-wheel-picker/style.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Гулять вместе",
    description: "Находите компанию для прогулок с собакой рядом с домом.",
    manifest: "/manifest.webmanifest?v=20261003-2",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Гулять вместе"
    },
    icons: {
      icon: [
        { url: "/favicon.ico?v=20261003-3", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
        { url: "/icons/dogmeet-32.png?v=20261003-3", type: "image/png", sizes: "32x32" }
      ],
      shortcut: "/favicon.ico?v=20261003-3",
      apple: [{ url: "/apple-touch-icon.png?v=20261003-2", sizes: "180x180", type: "image/png" }]
    },
    openGraph: {
      title: "Гулять вместе",
      description: "Компания для прогулок с собакой — рядом с домом",
      type: "website",
      locale: "ru_RU",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Гулять вместе" }]
    },
    twitter: {
      card: "summary_large_image",
      title: "Гулять вместе",
      description: "Компания для прогулок с собакой — рядом с домом",
      images: [imageUrl]
    }
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#f7f4ed"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico?v=20261003-3" type="image/x-icon" sizes="16x16 32x32 48x48" />
        <link rel="icon" href="/icons/dogmeet-32.png?v=20261003-3" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/favicon.ico?v=20261003-3" type="image/x-icon" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20261003-2" sizes="180x180" />
      </head>
      <body>{children}</body>
    </html>
  );
}
