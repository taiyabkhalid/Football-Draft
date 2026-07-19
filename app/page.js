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
        <Link href="/draft" className="btn-secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          View live draft / results
        </Link>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/staff-login"
            style={{
              background: 'none',
              border: '0.5px solid #d8dde2',
              color: '#5a6b7d',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              display: 'inline-block',
            }}
          >
            Commissioner and GM login
          </Link>
        </div>
      </div>
    </main>
  );
}
