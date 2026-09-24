'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPublicClient, createWalletClient, custom, getAddress, http, type Address, type PublicClient, type WalletClient } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

interface InjectedProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}
declare global { interface Window { ethereum?: InjectedProvider } }

interface WalletContextValue {
  address?: Address;
  chainId?: number;
  walletClient?: WalletClient;
  publicClient: PublicClient;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<void>;
}
const WalletContext = createContext<WalletContextValue | null>(null);
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(process.env.NEXT_PUBLIC_CHAIN_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc') });

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('WalletProvider is missing');
  return value;
}

export function Providers({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<InjectedProvider>();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();

  const syncWallet = useCallback(async (wallet: InjectedProvider) => {
    const [accounts, chainHex] = await Promise.all([
      wallet.request({ method: 'eth_accounts' }) as Promise<string[]>,
      wallet.request({ method: 'eth_chainId' }) as Promise<string>,
    ]);
    setAddress(accounts[0] ? getAddress(accounts[0]) : undefined);
    setChainId(Number.parseInt(chainHex, 16));
  }, []);

  const connect = useCallback(async () => {
    const wallet = window.ethereum;
    if (!wallet) throw new Error('No se encontró una wallet EVM. Instala MetaMask.');
    setProvider(wallet);
    const accounts = await wallet.request({ method: 'eth_requestAccounts' }) as string[];
    const chainHex = await wallet.request({ method: 'eth_chainId' }) as string;
    setAddress(accounts[0] ? getAddress(accounts[0]) : undefined);
    setChainId(Number.parseInt(chainHex, 16));
  }, []);

  const disconnect = useCallback(() => { setAddress(undefined); }, []);
  const switchToSepolia = useCallback(async () => {
    const wallet = provider ?? window.ethereum;
    if (!wallet) throw new Error('Conecta primero una wallet EVM.');
    try {
      await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x66eee' }] });
    } catch (cause) {
      const errorCode = (cause as { code?: number }).code;
      if (errorCode !== 4902) throw cause;
      await wallet.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x66eee', chainName: 'Arbitrum Sepolia',
          nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [process.env.NEXT_PUBLIC_CHAIN_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc'],
          blockExplorerUrls: ['https://sepolia.arbiscan.io'],
        }],
      });
    }
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: unknown) => setAddress(Array.isArray(accounts) && typeof accounts[0] === 'string' ? getAddress(accounts[0]) : undefined);
    const chainChanged = (chainHex: unknown) => { if (typeof chainHex === 'string') setChainId(Number.parseInt(chainHex, 16)); };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    void syncWallet(provider).catch(() => undefined);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', chainChanged);
    };
  }, [provider, syncWallet]);

  const walletClient = useMemo(() => provider && address
    ? createWalletClient({ account: address, chain: arbitrumSepolia, transport: custom(provider) })
    : undefined, [provider, address]);
  const value = useMemo(() => ({ address, chainId, walletClient, publicClient, connect, disconnect, switchToSepolia }), [address, chainId, walletClient, connect, disconnect, switchToSepolia]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
