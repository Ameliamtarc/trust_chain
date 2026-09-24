import { isAddress, isHex, type Address, type Hex } from 'viem';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function roleHash(name: string): Hex {
  const value = required(name);
  if (!isHex(value, { size: 32 })) throw new Error(`${name} must be a 32-byte hex role identifier`);
  return value;
}

const chainId = Number(process.env.CHAIN_ID ?? '421614');
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('CHAIN_ID must be a positive integer');
const registryAddress = required('ROLE_REGISTRY_ADDRESS');
if (!isAddress(registryAddress)) throw new Error('ROLE_REGISTRY_ADDRESS must be a valid EVM address');

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? '4000'),
  chainId,
  rpcUrl: required('CHAIN_RPC_URL'),
  registryAddress: registryAddress as Address,
  challengeTtlSeconds: Number(process.env.CHALLENGE_TTL_SECONDS ?? '300'),
  evidenceDirectory: new URL('../../data/local-store/', import.meta.url),
  roles: {
    organizer: roleHash('ORGANIZER_ROLE'),
    safeguardingVerifier: roleHash('SAFEGUARDING_VERIFIER_ROLE'),
    auditor: roleHash('AUDITOR_ROLE'),
    arbitrator: roleHash('ARBITRATOR_ROLE'),
  },
} as const;

if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (!Number.isSafeInteger(config.challengeTtlSeconds) || config.challengeTtlSeconds < 30 || config.challengeTtlSeconds > 900) {
  throw new Error('CHALLENGE_TTL_SECONDS must be between 30 and 900');
}
