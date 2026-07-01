import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'aitour.keyss · Dashboard',
  description: 'aitour.keyss client & admin dashboard',
};

// Applied before paint so there's no light/dark flash on load. Defaults to dark
// (adds the `.dark` class unless the user explicitly chose light).
const themeScript = `(function(){try{if(localStorage.getItem('theme')!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
