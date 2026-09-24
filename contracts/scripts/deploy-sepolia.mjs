import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, isAddress, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

const required = ['CHAIN_RPC_URL', 'DEPLOYER_PRIVATE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.DEPLOYER_PRIVATE_KEY)) {
  throw new Error('DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key');
}

const demoRoles = [
  ['DEMO_NGO_WALLET', 'ORGANIZER_ROLE', 'DEMO_ORG_NGO'],
  ['DEMO_VERIFIER_WALLET', 'SAFEGUARDING_VERIFIER_ROLE', 'DEMO_ORG_VERIFIER'],
  ['DEMO_AUDITOR_WALLET', 'AUDITOR_ROLE', 'DEMO_ORG_AUDITOR'],
  ['DEMO_ARBITRATOR_WALLET', 'ARBITRATOR_ROLE', 'DEMO_ORG_ARBITRATOR'],
];
const configured = demoRoles.filter(([env]) => process.env[env]);
if (configured.length && configured.length !== demoRoles.length) {
  throw new Error('Configure all four demo wallet addresses, or none, before deployment');
}
for (const [env] of configured) {
  if (!isAddress(process.env[env])) throw new Error(`${env} is not a valid EVM address`);
}
if (configured.length) {
  const wallets = configured.map(([env]) => process.env[env].toLowerCase());
  if (new Set(wallets).size !== wallets.length) throw new Error('Each demo role must use a separate wallet');
}

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const transport = http(process.env.CHAIN_RPC_URL);
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });
const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport });
const chainId = await publicClient.getChainId();
if (chainId !== arbitrumSepolia.id) {
  throw new Error(`Wrong chain ${chainId}; this script only deploys to Arbitrum Sepolia (${arbitrumSepolia.id})`);
}

const artifacts = new URL('../out/', import.meta.url);
async function artifact(name) {
  const stem = name === 'ProofOfAidRoleRegistry'
    ? 'src_ProofOfAidRoleRegistry_sol_ProofOfAidRoleRegistry'
    : name === 'ProofOfAidEscrow'
      ? 'src_ProofOfAidEscrow_sol_ProofOfAidEscrow'
      : 'src_MockAidToken_sol_MockAidToken';
  const [abiText, bytecode] = await Promise.all([
    readFile(new URL(`${stem}.abi`, artifacts), 'utf8'),
    readFile(new URL(`${stem}.bin`, artifacts), 'utf8'),
  ]);
  return { abi: JSON.parse(abiText), bytecode: `0x${bytecode.trim()}` };
}

async function deploy(name, args) {
  const contract = await artifact(name);
  const hash = await walletClient.deployContract({ ...contract, account, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`${name} deployment failed (${hash})`);
  }
  console.log(`${name}: ${receipt.contractAddress} (tx ${hash})`);
  return receipt.contractAddress;
}

const token = await deploy('MockAidToken', [account.address]);
const registry = await deploy('ProofOfAidRoleRegistry', [account.address]);
const escrow = await deploy('ProofOfAidEscrow', [token, registry]);

if (configured.length) {
  const registryArtifact = await artifact('ProofOfAidRoleRegistry');
  for (const [env, roleName, orgLabel] of demoRoles) {
    const address = process.env[env];
    if (!isAddress(address)) throw new Error(`${env} is not a valid EVM address`);
    const organizationId = keccak256(stringToHex(orgLabel));
    const role = keccak256(stringToHex(roleName));
    const bindHash = await walletClient.writeContract({
      address: registry,
      abi: registryArtifact.abi,
      functionName: 'bindOrganization',
      args: [address, organizationId],
    });
    await publicClient.waitForTransactionReceipt({ hash: bindHash });
    const grantHash = await walletClient.writeContract({
      address: registry,
      abi: registryArtifact.abi,
      functionName: 'grantRole',
      args: [role, address],
    });
    await publicClient.waitForTransactionReceipt({ hash: grantHash });
    console.log(`Granted ${roleName} to ${address} (organization ${organizationId})`);
  }
} else {
  console.log('No demo roles assigned. Set all DEMO_*_WALLET variables and rerun role setup manually if needed.');
}

console.log('\nBackend .env values (copy manually; no secrets are printed):');
console.log('CHAIN_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc');
console.log(`CHAIN_ID=${arbitrumSepolia.id}`);
console.log('CHAIN_PROJECT_IDS=');
console.log(`ROLE_REGISTRY_ADDRESS=${registry}`);
console.log(`ESCROW_ADDRESS=${escrow}`);
console.log(`PAYMENT_TOKEN_ADDRESS=${token}`);
