'use client';

import { useState } from 'react';
import { chain } from '@/lib/chain/config';
import { useWallet } from '@/app/providers';

export function WalletButton() {
  const { address, chainId, connect, disconnect, switchToSepolia } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (address && chainId !== chain.id) {
    return <div className="wallet-wrap"><button className="button button-dark" onClick={() => { setBusy(true); void switchToSepolia().catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cambiar de red')).finally(() => setBusy(false)); }} disabled={busy}>{busy ? 'Cambiando red…' : 'Cambiar a Arbitrum Sepolia'}</button>{error && <small className="wallet-error">{error}</small>}</div>;
  }
  if (address) return <button className="wallet-pill" onClick={disconnect} title="Desconectar wallet"><span className="online-dot" />{address.slice(0, 6)}…{address.slice(-4)}<span className="wallet-exit">×</span></button>;
  return <div className="wallet-wrap"><button className="button button-dark" disabled={busy} onClick={() => { setBusy(true); setError(''); void connect().catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo conectar')).finally(() => setBusy(false)); }}>{busy ? 'Conectando…' : 'Conectar wallet'}</button>{error && <small className="wallet-error">{error}</small>}</div>;
}
