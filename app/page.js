import Link from 'next/link';
import BrandHeader from '../lib/BrandHeader';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandHeader />
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 20px' }}>
        <Link href="/register" className="btn-primary" style={{ display: 'block', textAlign: 'center', marginBottom: 10 }}>
          Register as a player
        </Link>
        <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', marginBottom: 10 }}>
          Log in
        </Link>
        <Link href="/live" className="btn-secondary" style={{ display: 'block', textAlign: 'center' }}>
          View live draft / results
        </Link>
      </div>
    </main>
  );
}
