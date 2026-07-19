import './globals.css';

export const metadata = {
  title: 'League Draft',
  description: 'Player registration and live draft for the recreation league',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-white text-ink font-body min-h-screen"
        style={{ '--font-display': "'Anton', sans-serif", '--font-body': "'Inter', sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
