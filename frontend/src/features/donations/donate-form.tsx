'use client';

import { useState } from 'react';
import { formatUnits, isAddress, parseEther } from 'viem';
import { useWallet } from '@/app/providers';
import { chain, escrowAddress } from '@/lib/chain/config';
import { escrowAbi } from '@/lib/chain/escrow-abi';
import { tokenAbi } from '@/lib/chain/token-abi';

const tokenAddress = (process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

export function DonateForm({ projectId, target, donated, projectStatus, onDonated }: { projectId: string; target: string; donated: string; projectStatus: string; onDonated: () => void }) {
  const { address, chainId, walletClient, publicClient, switchToSepolia } = useWallet();
  const [amount, setAmount] = useState('25');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<string>();

  async function getBalance() {
    if (!address || !isAddress(tokenAddress) || tokenAddress === '0x0000000000000000000000000000000000000000') return;
    const value = await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [address] });
    setBalance(formatUnits(value, 18));
  }

  async function donate() {
    setError('');
    setStatus('');
    if (!address || !walletClient) throw new Error('Conecta tu wallet para donar.');
    if (chainId !== chain.id) {
      await switchToSepolia();
      throw new Error('La wallet está cambiando de red. Vuelve a intentarlo cuando indique Arbitrum Sepolia.');
    }
    if (!isAddress(tokenAddress) || tokenAddress === '0x0000000000000000000000000000000000000000') throw new Error('Falta configurar NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS.');
    if (!isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') throw new Error('Falta configurar NEXT_PUBLIC_ESCROW_ADDRESS.');
    const tokenAmount = parseEther(amount);
    if (tokenAmount <= 0n) throw new Error('Introduce una cantidad mayor que cero.');
    const tokenBalance = await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [address] });
    setBalance(formatUnits(tokenBalance, 18));
    if (tokenBalance < tokenAmount) throw new Error('Saldo mAID insuficiente. En la demo, el administrador debe acuñar tokens de prueba para esta wallet.');
    const allowance = await publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: 'allowance', args: [address, escrowAddress] });
    if (allowance < tokenAmount) {
      setStatus('Aprueba exactamente esta cantidad de mAID…');
      const approvalHash = await walletClient.writeContract({ account: address, chain, address: tokenAddress, abi: tokenAbi, functionName: 'approve', args: [escrowAddress, tokenAmount] });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }
    setStatus('Confirma la donación en tu wallet…');
    const donationHash = await walletClient.writeContract({
      account: address, chain, address: escrowAddress, abi: escrowAbi, functionName: 'donate',
      args: [BigInt(projectId), tokenAmount],
    });
    setStatus(`Esperando confirmación: ${donationHash.slice(0, 12)}…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: donationHash });
    if (receipt.status !== 'success') throw new Error('La blockchain rechazó la donación.');
    setStatus(`Donación confirmada · ${donationHash}`);
    await getBalance();
    onDonated();
  }

  return <div className="donate-card"><div><div className="eyebrow">APOYA EL PROGRAMA</div><h3>Tu aportación va al escrow</h3><p>El contrato retiene las donaciones y libera cada tramo a la ONG según el hito. La ONG paga a sus proveedores fuera de la plataforma. Quedan {formatAmount(BigInt(target) - BigInt(donated))} mAID por financiar.</p></div>
    <div className="donate-action"><label htmlFor="donate-amount">Cantidad <span>mAID · token de prueba</span></label><div className="amount-input"><input id="donate-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>mAID</span></div>
      {address && <button className="balance-link" type="button" onClick={() => { void getBalance().catch(() => setError('No se pudo consultar el saldo.')); }}>Consultar saldo{balance !== undefined ? ` · ${Number(balance).toLocaleString('es-ES')} mAID` : ''}</button>}
      <button className="button button-orange full-width" type="button" onClick={() => { setBusy(true); void donate().catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo completar la donación.')).finally(() => setBusy(false)); }} disabled={busy || !address}>{busy ? status || 'Procesando…' : 'Donar con mi wallet'}<span>→</span></button>
    </div>
    {status && <div className="donate-status" role="status">{status}</div>}{error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}

function formatAmount(value: bigint) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value / 10n ** 16n) / 100); }
