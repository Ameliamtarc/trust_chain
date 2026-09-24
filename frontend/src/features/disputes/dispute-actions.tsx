'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnits, isAddress, keccak256, stringToBytes } from 'viem';
import { useWallet } from '@/app/providers';
import { chain, escrowAddress } from '@/lib/chain/config';
import { escrowAbi } from '@/lib/chain/escrow-abi';

type Props = { projectId: string; projectStatus: string; onAction: () => void };

export function DisputeActions({ projectId, projectStatus, onAction }: Props) {
  const { address, chainId, walletClient, publicClient, switchToSepolia } = useWallet();
  const [refund, setRefund] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshRefund = useCallback(async () => {
    if (!address || !isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') {
      setRefund(0n);
      return;
    }
    try {
      const amount = await publicClient.readContract({
        address: escrowAddress, abi: escrowAbi, functionName: 'claimableRefund', args: [BigInt(projectId), address],
      });
      setRefund(amount);
    } catch {
      setRefund(0n);
    }
  }, [address, projectId, publicClient]);

  useEffect(() => { void refreshRefund(); }, [refreshRefund]);

  async function send(action: 'dispute' | 'refund') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!address || !walletClient) throw new Error('Conecta tu wallet para continuar.');
      if (chainId !== chain.id) {
        await switchToSepolia();
        throw new Error('La wallet está cambiando a Arbitrum Sepolia. Repite la acción cuando termine.');
      }
      if (!isAddress(escrowAddress) || escrowAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Las acciones estarán disponibles cuando se configure el contrato desplegado.');
      }

      const hash = action === 'dispute'
        ? await walletClient.writeContract({
            account: address, chain, address: escrowAddress, abi: escrowAbi,
            functionName: 'openDonorDispute',
            args: [BigInt(projectId), keccak256(stringToBytes('MILESTONE_PROGRESS_CONCERN'))],
          })
        : await walletClient.writeContract({
            account: address, chain, address: escrowAddress, abi: escrowAbi,
            functionName: 'claimRefund', args: [BigInt(projectId)],
          });
      setMessage(`Transacción enviada · ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('La blockchain rechazó la transacción.');
      setMessage(action === 'dispute' ? 'Disputa registrada en la blockchain.' : 'Reembolso recibido en tu wallet.');
      await refreshRefund();
      onAction();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="dispute-card" aria-labelledby="donor-rights-title">
    <div><div className="eyebrow">DERECHOS DE DONANTES</div><h3 id="donor-rights-title">Seguimiento y devolución</h3>
      <p>Si has contribuido, puedes abrir una disputa sobre el hito actual. Si el proyecto termina como fallido y quedan fondos bloqueados que te corresponden, el contrato permite reclamarlos.</p>
      <p className="privacy-reminder">La disputa usa un motivo general en cadena. No incluyas nombres, casos ni datos de menores.</p>
    </div>
    <div className="dispute-actions">
      <button className="button button-outline" type="button" disabled={busy || projectStatus !== 'active' || !address} onClick={() => void send('dispute')}>
        {projectStatus !== 'active' ? 'Disputa no disponible en este estado' : 'Abrir disputa'}
      </button>
      {address && refund > 0n && <button className="button button-dark" type="button" disabled={busy} onClick={() => void send('refund')}>
        Reclamar {formatUnits(refund, 18)} mAID
      </button>}
      {address && refund === 0n && <button className="balance-link" type="button" onClick={() => void refreshRefund()}>Actualizar reembolso disponible</button>}
    </div>
    {message && <div className="donate-status" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </section>;
}
