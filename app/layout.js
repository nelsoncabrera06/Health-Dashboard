import { Inter } from "next/font/google";
import { AuthProvider } from "../components/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Nutrition Dashboard",
  description: "Nutrición y entrenamiento",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
