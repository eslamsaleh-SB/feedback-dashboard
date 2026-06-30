import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collector Performance Dashboard",
  description: "Collector performance feedback dashboard",
};

// Read the saved theme before React hydrates so the first paint matches
// the user's choice (no white flash for dark-mode users).
const themeBootstrap = `
(function(){try{var t=localStorage.getItem('theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&s)){document.documentElement.classList.add('dark');}}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
