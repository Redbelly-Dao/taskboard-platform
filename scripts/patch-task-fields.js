#!/usr/bin/env node
/**
 * Patch existing tasks with technicalRequirements and infrastructure fields.
 * Only updates those two fields — does NOT touch status, rewards, deliverables, or anything else.
 *
 * Usage:
 *   node scripts/patch-task-fields.js path/to/serviceAccountKey.json
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require("path");

const PATCHES = {
  "TASK-01": {
    technicalRequirements: [
      "Build on top of OpenZeppelin ERC-20 base contract; no custom token implementations",
      "Integrate hasChainPermission(address) from the Redbelly Eligibility SDK for all gated actions",
      "Minting gate must be non-bypassable; owner cannot mint for unverified addresses",
      "Transfer gate must be configurable by owner between gated and ungated states",
      "Admin function must allow updating the eligibility contract address with appropriate access control",
      "All reverting transactions must include descriptive KYC-specific error messages",
    ],
    infrastructure: [
      "useHasChainPermission hook: https://docs.redbelly.network/pages/eligibility-sdk/client/hooks/useHasChainPermission/",
      "Individual Onboarding SDK widget for KYC flow",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
    ],
  },
  "TASK-02": {
    technicalRequirements: [
      "Implement ERC-4626 compliant vault inheriting from OpenZeppelin's ERC4626 base contract",
      "Integrate with Redbelly's BusinessIdentifier contracts to read on-chain jurisdiction data for each depositor",
      "Jurisdiction blocklist must be admin-configurable via an on-chain mapping",
      "Deposits from blocked jurisdictions must revert with jurisdiction-specific error messages",
      "Every deposit and withdrawal must emit events recording the jurisdiction check result",
      "Admin dashboard mockup must reflect the actual on-chain admin functions available",
    ],
    infrastructure: [
      "BusinessOnboardingSDK docs: https://docs.redbelly.network/pages/business-onboarding-sdk/",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
      "OpenZeppelin ERC4626: https://github.com/OpenZeppelin/openzeppelin-contracts",
    ],
  },
  "TASK-03": {
    technicalRequirements: [
      "ERC-20 must use OpenZeppelin ERC20Snapshot extension for point-in-time holder records",
      "Distribution must be two-step: take snapshot first, then pay only KYC-verified holders at snapshot time",
      "Escrow contract or mapping must hold funds for ineligible recipients with a configurable 90-day reclaim window",
      "hasChainPermission must be called for each recipient at distribution time, not at snapshot time",
      "Distribution epoch tracking must prevent any recipient from double-claiming within the same epoch",
      "Gas benchmark required at 20, 50, 100, and 500 holders; results must be included in documentation",
    ],
    infrastructure: [
      "hasChainPermission reference: https://docs.redbelly.network/pages/eligibility-sdk/client/hooks/useHasChainPermission/",
      "OpenZeppelin ERC20Snapshot extension",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
    ],
  },
  "TASK-04": {
    technicalRequirements: [
      "Registry contract must store credential expiry timestamps updated by an authorized oracle or admin",
      "Freezable token must block all transfers from frozen addresses; freeze state enforced in ERC-20 transfer hooks",
      "Keeper must process expired credentials in batches to avoid exceeding block gas limits",
      "Keeper must implement automatic restart or health-check mechanism documented in the README",
      "All freeze and unfreeze actions must emit events with block timestamp and affected address",
      "Keeper must support both Gelato and custom Node.js operation modes as documented alternatives",
    ],
    infrastructure: [
      "Gelato Network (recommended for keeper automation): https://www.gelato.network/",
      "The Graph for on-chain event indexing: https://thegraph.com/",
      "Individual Onboarding SDK (for eligibility data): https://docs.redbelly.network/pages/eligibility-sdk/",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
    ],
  },
  "TASK-05": {
    technicalRequirements: [
      "Design must exactly replicate Redbelly's existing color palette, typography stack, button styles, and spacing system",
      "Showcase Grid must render without layout breaking at 4, 8, and 12 project cards",
      "All Figma assets must be exported at 1x and 2x resolution for retina displays",
      "Figma file must use auto-layout components and a shared style library to enable developer handoff without design clarification",
      "Responsive breakpoints required: 1920px desktop, 768px tablet, 375px mobile",
    ],
    infrastructure: [
      "Redbelly website for brand audit: https://redbelly.network",
      "Figma (required design tool)",
      "Majnoon TVL dashboard (reference project for Showcase Grid)",
      "Robbie's Node dashboard (reference project for Showcase Grid)",
    ],
  },
  "TASK-06": {
    technicalRequirements: [
      "Video duration strictly 5 to 10 seconds with no black padding frames at start or end",
      "Audio integrated loudness: -14 LUFS; true peak maximum: -1 dBTP",
      "Render output: 1920x1080 (1080p) and 3840x2160 (4K), minimum 30fps, H.264 or H.265",
      "Color space: Rec. 709 for broadcast compatibility",
      "Audio must be original composition or royalty-free with license file included in deliverables",
      "Three concept storyboards required before production; admin sign-off required before final render",
    ],
    infrastructure: [
      "After Effects, Premiere Pro, or Blender (required production tools)",
      "Redbelly brand assets: official colors, logo files, and typography (request from DAO admin)",
      "Redbelly Insights YouTube channel for tone reference",
      "Audio delivered as separate WAV stems: music, SFX, and any voice elements",
    ],
  },
  "TASK-07": {
    technicalRequirements: [
      "Academic citation format required throughout (APA, Chicago, or IEEE); bibliography mandatory",
      "Comparative analysis must use a structured scoring methodology with named criteria and weighted scores",
      "All on-chain data referenced must include block explorer URLs as verifiable evidence",
      "Regulatory analysis must cite primary sources only (official government, central bank, or regulatory body documents)",
      "Executive brief must be fully self-contained and require no cross-reference to the main report",
    ],
    infrastructure: [
      "RBA Project Acacia official publications and press releases",
      "Redbelly public documentation: https://docs.redbelly.network",
      "Redbelly block explorer: https://explorer.redbelly.network",
      "Publication platforms: SSRN, Mirror.xyz, or Substack",
    ],
  },
  "TASK-08": {
    technicalRequirements: [
      "Bridge audit must test actual connectivity to current Redbelly Testnet RPC endpoints, not simulated environments",
      "All code examples must execute on Redbelly Testnet (Chain ID 153) without modification beyond .env setup",
      "Troubleshooting section must reproduce each error on current testnet and include exact terminal output",
      "Test script must be a self-contained Node.js or Hardhat script requiring only npm install and env configuration",
      "At least 5 bridge protocols must be covered in the landscape audit",
    ],
    infrastructure: [
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
      "Redbelly block explorer: https://explorer.redbelly.network",
      "LayerZero documentation: https://layerzero.network/",
      "Axelar documentation: https://axelar.network/",
    ],
  },
  "TASK-09": {
    technicalRequirements: [
      "Every issue entry must follow the exact four-section format: Symptom, Root Cause, Solution, Prevention",
      "Each solution must be validated by reproducing the error on current Redbelly Testnet before submission",
      "Quick-reference index must be navigable by error code, exact error message text, and topic keyword",
      "Community validation requires screenshots or Discord thread links as supporting evidence",
      "Wiki must be hosted at a persistent, publicly accessible URL",
    ],
    infrastructure: [
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Redbelly documentation: https://docs.redbelly.network",
      "Redbelly official Discord (for sourcing real developer issues)",
      "GitHub Wiki, Dev.to, or Medium for hosting",
    ],
  },
  "TASK-10": {
    technicalRequirements: [
      "All on-chain data must be fetched directly from Redbelly RPC; no third-party data aggregators as the primary source",
      "All metrics must auto-refresh at a minimum interval of 60 seconds with a visible last-updated timestamp",
      "Dashboard must handle RPC downtime gracefully: show stale-data banner and continue displaying last known values",
      "Mobile layout must function fully without horizontal scrolling on 375px viewport",
      "Repository must include a one-command deployment script tested on both Vercel and self-hosted environments",
    ],
    infrastructure: [
      "Redbelly Mainnet RPC: https://governors.mainnet.redbelly.network",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Redbelly block explorer: https://explorer.redbelly.network",
      "Mainnet Chain ID: 151, Testnet Chain ID: 153",
    ],
  },
  "TASK-11": {
    technicalRequirements: [
      "All tokenomics claims must cite official Redbelly documentation or on-chain verifiable data",
      "DeFiLlama TVL adapter must follow the official adapter specification and pass the DeFiLlama adapter linter",
      "RWA.xyz submission kit must include all mandatory listing fields per the RWA.xyz submission template",
      "No speculative price targets, return projections, or extrapolated future values anywhere in the report",
      "All charts must be reproducible directly from the cited data sources",
    ],
    infrastructure: [
      "Redbelly documentation: https://docs.redbelly.network",
      "DeFiLlama adapter specification: https://github.com/DefiLlama/DefiLlama-Adapters",
      "Redbelly block explorer: https://explorer.redbelly.network",
      "Redbelly Mainnet RPC: https://governors.mainnet.redbelly.network",
    ],
  },
  "TASK-12": {
    technicalRequirements: [
      "All tweets and threads must go through DAO admin approval before posting; direct publishing without approval is a failure criterion",
      "Monthly analytics report must include follower growth, impressions, engagement rate, link clicks, and profile visits in PDF format",
      "DMs must be checked daily; sensitive messages must be forwarded to DAO admin within 24 hours",
      "Engagement responses must match brand voice guidelines; no informal language, slang, or price commentary",
      "Minimum 25 original tweets per month; reshares and quote tweets do not count toward the minimum",
    ],
    infrastructure: [
      "Redbelly DAO X account access (provided by admin on selection)",
      "X Analytics dashboard for performance reporting",
      "Redbelly DAO brand guidelines and approved messaging framework (provided by admin)",
      "DAO Discord for content coordination, approval workflow, and escalation",
    ],
  },
  "TASK-13": {
    technicalRequirements: [
      "All 5 Hardhat projects must deploy successfully to Redbelly Testnet (Chain ID 153) at time of submission",
      "Each module must be fully self-contained; no module may require completing a prior module to work",
      "Videos must be captured at 1920x1080 minimum with system audio disabled; no background noise or notifications",
      "All Markdown must render correctly on GitHub without custom CSS or plugins",
      "Solidity contracts must compile with 0.8.20 or later; no deprecated syntax or libraries",
    ],
    infrastructure: [
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
      "Chain ID: 153",
      "Redbelly documentation: https://docs.redbelly.network",
      "Hardhat framework: https://hardhat.org",
      "YouTube for video hosting (unlisted during review, public after approval)",
    ],
  },
  "TASK-14": {
    technicalRequirements: [
      "All React examples must be tested against React 18 and Next.js 14 App Router at time of submission",
      "Backend verification examples must use the official Redbelly SDK; no undocumented third-party wrappers",
      "Error code mapping must cover every error code in the current official SDK reference documentation with no omissions",
      "Integration decision tree must be a visual diagram (Figma, Miro, or equivalent); prose-only trees will be rejected",
      "All code examples must be validated against a live Redbelly Testnet environment, not a local mock",
    ],
    infrastructure: [
      "EligibilitySDK documentation: https://docs.redbelly.network/pages/eligibility-sdk/",
      "useHasChainPermission hook: https://docs.redbelly.network/pages/eligibility-sdk/client/hooks/useHasChainPermission/",
      "useBusinessDetails hook: https://docs.redbelly.network/pages/eligibility-sdk/client/hooks/useBusinessDetails/",
      "Individual Onboarding SDK widget: https://docs.redbelly.network/pages/eligibility-sdk/",
      "Redbelly Testnet RPC: https://rpc-testnet.redbelly.network",
    ],
  },
  "TASK-15": {
    technicalRequirements: [
      "Navigation flowchart must account for every page in the current website sitemap with no omissions",
      "User journey maps must include at least 3 entry points and 3 exit points per persona",
      "Cross-linking strategy must identify at least 20 specific connection points with source and destination pages named",
      "Mobile navigation must be designed and documented separately for iOS Safari and Android Chrome viewport sizes",
      "Before-and-after comparison must use the same 10 most-visited content types for both current and proposed views",
    ],
    infrastructure: [
      "Redbelly DAO website for current IA audit",
      "Figma (required tool for all deliverable mockups)",
      "Miro or equivalent for user journey mapping",
      "Reference DAO websites for IA benchmarking: MakerDAO, Compound, Uniswap governance",
    ],
  },
};

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error("Usage: node scripts/patch-task-fields.js path/to/serviceAccountKey.json");
    process.exit(1);
  }

  const serviceAccount = require(path.resolve(keyPath));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const taskIds = Object.keys(PATCHES);
  console.log(`\nPatching ${taskIds.length} tasks with technicalRequirements and infrastructure...\n`);

  for (const taskId of taskIds) {
    try {
      await db.collection("tasks").doc(taskId).update(PATCHES[taskId]);
      console.log(`  ✓ ${taskId}`);
    } catch (err) {
      console.error(`  ✗ ${taskId}: ${err.message}`);
    }
  }

  console.log(`\nDone. Run the app and open any task to verify the new sections display.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
