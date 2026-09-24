import { isAddress, keccak256, stringToHex, type Address } from 'viem';

const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

function address(name: string): Address {
  const value = process.env[name]?.trim() || zeroAddress;
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address`);
  return value;
}

const chainId = Number(process.env.CHAIN_ID ?? '421614');
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('CHAIN_ID must be a positive integer');

function parseProjectIds(value: string | undefined): Readonly<Record<string, bigint>> {
  const result: Record<string, bigint> = {};
  if (!value?.trim()) return result;
  for (const entry of value.split(',')) {
    const [slug, rawId, ...extra] = entry.trim().split(':');
    if (extra.length || !slug || !/^[a-z0-9-]{1,80}$/.test(slug) || !rawId || !/^[1-9][0-9]{0,77}$/.test(rawId)) {
      throw new Error('CHAIN_PROJECT_IDS must be comma-separated slug:id pairs');
    }
    if (result[slug]) throw new Error(`Duplicate project slug in CHAIN_PROJECT_IDS: ${slug}`);
    result[slug] = BigInt(rawId);
  }
  return result;
}

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? '4000'),
  chainId,
  rpcUrl: process.env.CHAIN_RPC_URL?.trim() || 'https://sepolia-rollup.arbitrum.io/rpc',
  registryAddress: address('ROLE_REGISTRY_ADDRESS'),
  escrowAddress: address('ESCROW_ADDRESS'),
  chainProjectIds: parseProjectIds(process.env.CHAIN_PROJECT_IDS),
  challengeTtlSeconds: Number(process.env.CHALLENGE_TTL_SECONDS ?? '300'),
  evidenceDirectory: new URL('../../data/local-store/', import.meta.url),
  roles: {
    organizer: keccak256(stringToHex('ORGANIZER_ROLE')),
    safeguardingVerifier: keccak256(stringToHex('SAFEGUARDING_VERIFIER_ROLE')),
    auditor: keccak256(stringToHex('AUDITOR_ROLE')),
    arbitrator: keccak256(stringToHex('ARBITRATOR_ROLE')),
  },
} as const;

if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (!Number.isSafeInteger(config.challengeTtlSeconds) || config.challengeTtlSeconds < 30 || config.challengeTtlSeconds > 900) throw new Error('CHALLENGE_TTL_SECONDS must be between 30 and 900');
