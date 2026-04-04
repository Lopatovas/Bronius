'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError('Wrong password');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ background: '#1e293b', borderRadius: 12, padding: 32, width: 360 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>Bronius</h1>
        <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>Enter password to continue</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 16,
            outline: 'none',
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Log in
        </button>
        {error && <p style={{ color: '#ef4444', marginTop: 8, marginBottom: 0, fontSize: 14 }}>{error}</p>}
      </form>
    </div>
  );
}
