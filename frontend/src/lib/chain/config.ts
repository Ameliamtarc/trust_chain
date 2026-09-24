import { arbitrumSepolia } from 'viem/chains';

export const chain = arbitrumSepolia;
export const escrowAddress = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
