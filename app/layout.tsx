import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fichagest · Iberogest",
  description: "Control horario y gestión laboral para clientes de Iberogest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#111827] text-white`}
      >
        {/* TOPBAR GLOBAL */}
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            
            {/* LOGO */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#134396]" />
              <div className="leading-none">
                <div className="font-semibold text-lg">
                  Ficha<span className="font-extrabold">gest</span>
                </div>
                <div className="text-xs text-white/60">
                  Plataforma de control horario
                </div>
              </div>
            </div>

            {/* MARCA IBEROGEST */}
            <div className="text-sm text-white/60">
              by <span className="font-semibold text-white">Iberogest</span>
            </div>

          </div>
        </header>

        {/* CONTENIDO APP */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="max-w-7xl mx-auto px-6 pb-8 text-xs text-white/40">
          Fichagest · Sistema de registro horario · Iberogest
        </footer>
      </body>
    </html>
  );
}