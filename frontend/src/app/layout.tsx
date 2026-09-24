import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from './providers';
import { WalletButton } from '@/components/wallet/wallet-button';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proof of Aid | Protección infantil',
  description: 'Financiación transparente para programas de protección integral infantil.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><Providers>
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark">P</span><span>proof<span className="brand-light">of</span>aid</span></Link>
      <nav><Link href="/">Proyectos</Link><Link href="/organizer/projects/new">Crear proyecto</Link></nav>
      <WalletButton />
    </header>
    <main>{children}</main>
    <footer className="footer"><span>Proof of Aid · Arbitrum Sepolia</span><span>Solo información de programa agregada. No introduzcas datos de menores o casos.</span></footer>
  </Providers></body></html>;
}
