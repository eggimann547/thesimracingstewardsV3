// app/layout.js
import './globals.css';

export const metadata = {
  title: 'Sim Racing Steward AI - V2',
  description: 'AI-powered incident analysis using iRacing, Le Mans Ultimate, rFactor 2, and SCCA GCR rules',
  keywords: 'sim racing, steward, AI, iRacing, Le Mans Ultimate, rFactor 2, SCCA, incident analysis',
  openGraph: {
    title: 'Sim Racing Steward AI',
    description: 'Get official rule-based verdicts on racing incidents',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Tailwind CSS via CDN – instant, no build step */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: 'class',
                theme: {
                  extend: {
                    colors: {
                      primary: '#2563eb',
                    },
                  },
                },
              };
            `,
          }}
        />
        {/* Favicon (optional – add your own) */}
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
