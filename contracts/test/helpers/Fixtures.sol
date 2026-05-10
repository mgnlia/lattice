// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AgentNFT} from "@0glabs/0g-agent-nft/contracts/AgentNFT.sol";
import {SoulINFT} from "../../src/SoulINFT.sol";
import {DataVerifier} from "../../src/DataVerifier.sol";
import {LatticeAttestor} from "../../src/LatticeAttestor.sol";
import {LatticeRegistry} from "../../src/LatticeRegistry.sol";
import {ISoulINFT} from "../../src/interfaces/ISoulINFT.sol";
import {ILatticeAttestor} from "../../src/interfaces/ILatticeAttestor.sol";

/// @title Fixtures
/// @notice Shared test deployment helpers for The Lattice contract graph.
library Fixtures {
    /// @notice Result of deploying The Lattice stack.
    /// @param soulINFT Deployed SoulINFT proxy.
    /// @param verifier Deployed DataVerifier (ERC-7857 32-byte preimage verifier).
    /// @param attestor Deployed LatticeAttestor.
    /// @param registry Deployed LatticeRegistry.
    struct LatticeStack {
        SoulINFT soulINFT;
        DataVerifier verifier;
        LatticeAttestor attestor;
        LatticeRegistry registry;
    }

    /// @notice Deploy SoulINFT behind an ERC1967Proxy and initialize it.
    function deploySoulINFT(address /*admin*/ )
        internal
        returns (SoulINFT proxy, DataVerifier verifier)
    {
        verifier = new DataVerifier();
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
        ERC1967Proxy proxyAddr = new ERC1967Proxy(address(impl), init);
        proxy = SoulINFT(address(proxyAddr));
    }

    /// @notice Deploy the full Lattice stack with `feeRecipient` as the dust sink.
    /// @param admin DEFAULT_ADMIN/ADMIN role on the SoulINFT proxy + LatticeAttestor.
    /// @param feeRecipient Recipient of integer-division dust on royalty settlement.
    function deployLatticeStack(address admin, address feeRecipient)
        internal
        returns (LatticeStack memory s)
    {
        (SoulINFT soulINFT, DataVerifier verifier) = deploySoulINFT(admin);
        s.soulINFT = soulINFT;
        s.verifier = verifier;
        s.attestor = new LatticeAttestor(admin);
        s.registry = new LatticeRegistry(ISoulINFT(address(soulINFT)), ILatticeAttestor(address(s.attestor)), feeRecipient);
    }
}
