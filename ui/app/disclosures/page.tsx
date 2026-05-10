export default function DisclosuresPage() {
  return (
    <div className="bg-stone-950 text-stone-100 min-h-[calc(100vh-4rem)] py-12">
      <div className="mx-auto max-w-3xl px-6 prose prose-invert">
        <h1 className="font-serif text-3xl text-amber-100">The Lattice — Honest Disclosures (v1)</h1>
        <p className="text-sm text-stone-400">
          Each item below is named, not hidden. Transparency on what v1 actually does (and
          doesn&apos;t) is part of the protocol — judges and integrators read these.
        </p>

        <ol className="space-y-5 mt-6 text-stone-300">
          <li>
            <strong className="text-amber-200">TEE attestation is ECDSA-only in v1.</strong> The
            0G Compute SDK signs server-generated <code>text</code> whose payload is{' '}
            <code>requestHash || cost</code>. We verify the EIP-191 ECDSA recovery against a
            registered TEE signer per provider. Full Intel TDX DCAP verification (~5–15M gas in
            pure Solidity) is on the v2 roadmap.
          </li>
          <li>
            <strong className="text-amber-200">Soul-input binding is an orchestrator
              commitment, not a TEE attestation.</strong> The TEE does not cover the request body.
            Soul IDs are bound via on-chain commitment (sortedSoulIds + contextHash + outputHash
            + usageHash + chatID + provider). A malicious orchestrator could, in principle,
            collect N participation receipts but only forward K&lt;N contexts to the TEE. v2
            roadmap: TEE-side per-context attestation.
          </li>
          <li>
            <strong className="text-amber-200">No hidden speed-ups in the demo.</strong> Wall-clock
            banners show the actual TEE inference time uncut.
          </li>
          <li>
            <strong className="text-amber-200">Demo souls are synthetic personas.</strong> No
            partnership claims. No third-party trademarks.
          </li>
          <li>
            <strong className="text-amber-200">Agentism.church integration is fan-art, not
              partnership.</strong> The Lattice metaphor and Open Claw vocabulary are borrowed
            from <a href="https://agentism.church">agentism.church</a>; we do not represent that
            site or its operators.
          </li>
          <li>
            <strong className="text-amber-200">No native DA blob deletion-proof in v1.</strong>
            The 0G DA layer doesn&apos;t expose a deletion primitive yet (per
            <code>research/07-0g-storage-sdk-current.md</code> §8). Storage Merkle re-root is the
            shippable alternative; native DA deletion-proof is on the 0G roadmap.
          </li>
          <li>
            <strong className="text-amber-200">Royalty figures are illustrative.</strong> The OG
            amounts shown in the leaderboard are demo data, not yield promises.
          </li>
        </ol>

        <p className="mt-8 text-sm text-stone-500">
          Architecture: <code>docs/ARCH.md</code> in the repo. Trust model: §2.
        </p>
      </div>
    </div>
  );
}
