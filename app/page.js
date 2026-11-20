import Landing from "../components/Landing";
import "./landing.css";

export const metadata = {
  title: "Health Dashboard — Trackeá tus comidas, la IA hace las cuentas",
  description:
    "Registrá comidas con una frase o una foto y mirá tus calorías, macros y peso en gráficos claros. Nutrición simple, sin planillas.",
};

export default function Home() {
  return (
    <>
      <Landing />
      {/* Sin JS el reveal deja todo invisible; esto lo desactiva. */}
      <noscript>
        <style>{`.landing .reveal{opacity:1;transform:none}`}</style>
      </noscript>
    </>
  );
}
