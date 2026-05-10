/**
 * Hand-written ABI fragments for The Lattice's three Solidity contracts.
 * Kept narrow — only the methods + events the orchestrator actually invokes.
 * Mirrors `contracts/src/{SoulINFT,LatticeAttestor,LatticeRegistry}.sol`.
 */

export const SOUL_INFT_ABI = [
  'function mintSoul(address to, bytes32 contextRoot, string domain, address royaltyWallet) returns (uint256 soulId)',
  'function ownerOf(uint256 soulId) view returns (address)',
  'function domainOf(uint256 soulId) view returns (string)',
  'function royaltyWalletOf(uint256 soulId) view returns (address)',
  'function setRoyaltyWallet(uint256 soulId, address wallet)',
  'function dataHashesOf(uint256 soulId) view returns (bytes32[])',
  'event SoulMinted(uint256 indexed soulId, address indexed owner, bytes32 contextRoot, string domain, address royaltyWallet)',
] as const;

export const LATTICE_ATTESTOR_ABI = [
  'function registerProvider(address provider, address teeSigner, string providerUri)',
  'function revokeProvider(address provider)',
  'function providerSigner(address provider) view returns (address)',
  'function usedProofs(bytes32 proofId) view returns (bool)',
  'function verifyAndMark(address provider, string chatID, bytes teeText, bytes teeSignature) returns (address)',
  'event ProviderRegistered(address indexed provider, address indexed teeSigner, string providerUri)',
  'event AttestationVerified(bytes32 indexed proofId, address indexed provider, address indexed teeSigner)',
] as const;

export const LATTICE_REGISTRY_ABI = [
  'function MAX_SOULS_PER_COMMUNION() view returns (uint256)',
  'function openCommunion(bytes32 nonce, uint256[] soulIds, bytes32 contextHash, bytes[] participationReceipts) payable returns (uint256 communionId)',
  'function submitAttestation(uint256 communionId, address provider, string chatID, bytes32 outputHash, bytes32 usageHash, bytes teeText, bytes teeSignature)',
  'function settleRoyalties(uint256 communionId)',
  'function predictCommunionId(address payer, bytes32 nonce, bytes32 contextHash) pure returns (uint256)',
  'function participationMessage(uint256 communionId, bytes32 contextHash) view returns (bytes32)',
  'function communionOf(uint256 communionId) view returns (tuple(uint256[] soulIds, address[] royaltyWallets, address payer, uint256 payment, bytes32 contextHash, bytes32 outputHash, bytes32 usageHash, address provider, string chatID, uint64 openedAt, uint64 attestedAt, bool settled))',
  'event CommunionOpened(uint256 indexed communionId, uint256[] soulIds, address indexed payer, uint256 payment, bytes32 contextHash, uint64 openedAt)',
  'event CommunionAttested(uint256 indexed communionId, address indexed provider, string chatID, bytes32 outputHash, bytes32 usageHash, uint64 attestedAt)',
  'event CommunionSettled(uint256 indexed communionId, address[] royaltyWallets, uint256[] payouts, uint256 dust)',
] as const;
