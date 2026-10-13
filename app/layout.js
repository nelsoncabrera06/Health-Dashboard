import { AuthProvider } from "../components/AuthContext";
import "./globals.css";

export const metadata = {
  title: "Health Dashboard",
  description: "Nutrición y entrenamiento",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
