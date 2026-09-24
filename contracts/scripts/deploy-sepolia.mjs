import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, isAddress, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import solc from 'solc';

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
const configuredVerifier = process.env.SUPPORT_COST_VERIFIER_ADDRESS;
if (configuredVerifier && !isAddress(configuredVerifier)) throw new Error('SUPPORT_COST_VERIFIER_ADDRESS must be a valid EVM address');
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

async function deploySupportCostVerifier() {
  if (configuredVerifier) {
    if (!(await publicClient.getBytecode({ address: configuredVerifier }))) throw new Error('SUPPORT_COST_VERIFIER_ADDRESS has no contract code on Arbitrum Sepolia');
    return configuredVerifier;
  }
  const verifierUrl = new URL('../../circuits/support-costs/build/SupportCostVerifier.sol', import.meta.url);
  let source;
  try { source = await readFile(verifierUrl, 'utf8'); }
  catch { throw new Error('Generate circuits/support-costs/build/SupportCostVerifier.sol first, or set SUPPORT_COST_VERIFIER_ADDRESS to a deployed verifier.'); }
  const input = {
    language: 'Solidity',
    sources: { 'SupportCostVerifier.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(`Generated verifier compile failed: ${errors.map((entry) => entry.formattedMessage).join('\n')}`);
  const contracts = output.contracts?.['SupportCostVerifier.sol'] ?? {};
  const [name, artifact] = Object.entries(contracts).find(([contractName]) => /Groth16Verifier|Verifier/.test(contractName)) ?? [];
  if (!artifact?.evm?.bytecode?.object) throw new Error('No deployable verifier contract was found in the generated Solidity source.');
  const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Support-cost verifier deployment failed (${hash})`);
  console.log(`${name}: ${receipt.contractAddress} (tx ${hash})`);
  return receipt.contractAddress;
}

const verifierAddress = await deploySupportCostVerifier();
const token = await deploy('MockAidToken', [account.address]);
const registry = await deploy('ProofOfAidRoleRegistry', [account.address]);
const escrow = await deploy('ProofOfAidEscrow', [token, registry, verifierAddress]);

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
console.log(`SUPPORT_COST_VERIFIER_ADDRESS=${verifierAddress}`);
console.log('\nFrontend .env.local values (copy manually):');
console.log(`NEXT_PUBLIC_ESCROW_ADDRESS=${escrow}`);
console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=${token}`);
