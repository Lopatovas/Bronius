import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bronius - AI Phone Agent',
  description: 'POC for AI-powered outbound phone calls',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
