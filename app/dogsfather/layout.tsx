import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Управление — Гулять вместе",
  robots: { index: false, follow: false, nocache: true }
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
