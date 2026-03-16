// app/layout.tsx
import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Animal Image Generator",
  description: "Generate themed images from animal photos",
  icons: { icon: { url: "/aig_favicon.ico", sizes: "256x256" } },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ width: "100%" }}>
          <img src="/header-aig.svg" alt="Animal Image Generator" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
        <Providers>{children}</Providers>
        <div style={{
          position: "fixed",
          bottom: 8,
          right: 12,
          fontSize: 11,
          color: "#94a3b8",
          pointerEvents: "none",
          userSelect: "none",
        }}>
          v3.0
        </div>
      </body>
    </html>
  );
}
