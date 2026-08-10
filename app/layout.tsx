import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Гулять вместе",
    description: "Находите компанию для прогулок с собакой рядом с домом.",
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
  themeColor: "#f8f7f2"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
