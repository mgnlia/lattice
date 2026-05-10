// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AgentNFT} from "@0glabs/0g-agent-nft/contracts/AgentNFT.sol";
import {SoulINFT} from "../src/SoulINFT.sol";
import {DataVerifier} from "../src/DataVerifier.sol";
import {LatticeAttestor} from "../src/LatticeAttestor.sol";
import {LatticeRegistry} from "../src/LatticeRegistry.sol";
import {ISoulINFT} from "../src/interfaces/ISoulINFT.sol";
import {ILatticeAttestor} from "../src/interfaces/ILatticeAttestor.sol";

/// @title DeployLattice
/// @notice Deploys The Lattice contract stack to 0G Aristotle (chain 16661).
/// @dev Run with:
///        forge script script/DeployLattice.s.sol --rpc-url $ZEROG_RPC_URL \
///          --broadcast --slow --private-key $DEPLOYER_PRIVATE_KEY -vvv
///      Required env: DEPLOYER_PRIVATE_KEY.
///      Optional env:
///        TEE_SIGNER         — TEE signer address to register (defaults to deployer).
///        TEE_PROVIDER       — provider EVM address registered in attestor (defaults to TEE_SIGNER).
///        FEE_RECIPIENT      — protocol dust recipient (defaults to deployer).
contract DeployLattice is Script {
    /// @notice Deployed contract addresses.
    struct Addresses {
        address soulINFT;
        address verifier;
        address attestor;
        address registry;
    }

    function run() external returns (Addresses memory addrs) {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        address teeSigner;
        try vm.envAddress("TEE_SIGNER") returns (address t) {
            teeSigner = t;
        } catch {
            teeSigner = deployer;
        }

        address teeProvider;
        try vm.envAddress("TEE_PROVIDER") returns (address p) {
            teeProvider = p;
        } catch {
            teeProvider = teeSigner;
        }

        address feeRecipient;
        try vm.envAddress("FEE_RECIPIENT") returns (address f) {
            feeRecipient = f;
        } catch {
            feeRecipient = deployer;
        }

        vm.startBroadcast(deployerPk);

        // 1. ERC-7857 data verifier (reused from Lattice — same 32-byte preimage shape).
        DataVerifier verifier = new DataVerifier();

        // 2. SoulINFT impl + UUPS proxy.
        SoulINFT impl = new SoulINFT();
        bytes memory init = abi.encodeCall(
            AgentNFT.initialize,
            (
                "Lattice Soul INFT",
                "SOUL",
                address(verifier),
                "https://evmrpc.0g.ai",
                "https://indexer-storage-testnet-turbo.0g.ai"
            )
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), init);
        SoulINFT soulINFT = SoulINFT(address(proxy));

        // 3. LatticeAttestor (admin = deployer).
        LatticeAttestor attestor = new LatticeAttestor(deployer);

        // 4. LatticeRegistry (binds soulINFT + attestor + fee recipient).
        LatticeRegistry registry = new LatticeRegistry(
            ISoulINFT(address(soulINFT)),
            ILatticeAttestor(address(attestor)),
            feeRecipient
        );

        // 5. Register the TEE provider's signing key.
        attestor.registerProvider(teeProvider, teeSigner, "https://teesigner.lattice");

        vm.stopBroadcast();

        addrs = Addresses({
            soulINFT: address(soulINFT),
            verifier: address(verifier),
            attestor: address(attestor),
            registry: address(registry)
        });

        console2.log("=== The Lattice -- Contracts Deployed ===");
        console2.log("Deployer:               ", deployer);
        console2.log("TEE provider (EVM):     ", teeProvider);
        console2.log("TEE signer (ECDSA):     ", teeSigner);
        console2.log("Fee recipient (dust):   ", feeRecipient);
        console2.log("DataVerifier:         ", addrs.verifier);
        console2.log("SoulINFT (proxy):       ", addrs.soulINFT);
        console2.log("LatticeAttestor:        ", addrs.attestor);
        console2.log("LatticeRegistry:        ", addrs.registry);
        console2.log("");
        console2.log("Next:");
        console2.log("  export SOUL_INFT_ADDR=         ", addrs.soulINFT);
        console2.log("  export LATTICE_ATTESTOR_ADDR=  ", addrs.attestor);
        console2.log("  export LATTICE_REGISTRY_ADDR=  ", addrs.registry);
        console2.log("  export LATTICE_TEE_PROVIDER=   ", teeProvider);
    }
}
