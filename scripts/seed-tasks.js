#!/usr/bin/env node
/**
 * Seed the Firestore tasks collection with all 15 Redbelly DAO tasks.
 *
 * Usage:
 *   node scripts/seed-tasks.js path/to/serviceAccountKey.json
 *
 * Safe to run multiple times — uses setDoc so existing tasks are overwritten
 * rather than duplicated.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");

const TASKS = [
  {
    id: "TASK-01",
    number: 1,
    title: "Sybil-Proof ERC-20 (Anti-Bot Standard)",
    category: "developer",
    reward: 40,
    reviewerComp: 8,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build a KYC-gated ERC-20 token that blocks unverified wallets from minting or transferring, using Redbelly's on-chain EligibilitySDK.",
    problem: "Standard ERC-20 tokens have no identity requirements. Airdrop farmers create thousands of wallets to claim rewards multiple times. Traditional solutions use centralized whitelists that are expensive to maintain. On Redbelly, this is solvable at the protocol layer using the existing eligibility infrastructure.",
    deliverables: [
      "ERC-20 smart contract with hasChainPermission verification gating on minting and configurable transfer gate",
      "Deployment script targeting Redbelly Testnet (Chain ID 153)",
      "React frontend example with IndividualOnboardingSDK widget and useHasChainPermission hook",
      "Unit test suite with minimum 90% coverage",
      "Documentation: 5 to 7 page integration guide",
    ],
    qualityBenchmarks: [
      "Deploy to Redbelly Testnet with verified source code on block explorer",
      "Unverified wallet attempting to mint must revert with a KYC-specific error message",
      "Same wallet after completing KYC must successfully mint",
      "Gas cost for the verification check must not exceed 50,000 gas",
      "Test coverage must be 90% or higher",
    ],
    failureCriteria: [
      "Contract allows minting or transfers by unverified wallets",
      "Error messages are generic rather than KYC-specific",
      "Frontend example does not compile or render the SDK widget correctly",
      "Test suite does not cover the toggle between gated and ungated transfers",
    ],
  },
  {
    id: "TASK-02",
    number: 2,
    title: "Compliant Asset Tokenization (CAT) Vault",
    category: "developer",
    reward: 60,
    reviewerComp: 12,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build an ERC-4626 vault with jurisdiction-based deposit restrictions using Redbelly's BusinessOnboardingSDK and on-chain business details.",
    problem: "Tokenized real-world assets require region-specific transfer restrictions. Traditional solutions use off-chain databases that break composability. On Redbelly, jurisdiction data is already stored on-chain through Business Identifier contracts, making compliance enforceable at the smart contract layer.",
    deliverables: [
      "ERC-4626 vault contract with jurisdiction checking",
      "Business Identifier interface and jurisdiction helper functions",
      "Admin dashboard mockup (Figma or React) for vault configuration",
      "Unit test suite with minimum 90% coverage",
      "Documentation: 8 to 10 page guide",
    ],
    qualityBenchmarks: [
      "Deploy vault to Redbelly Testnet",
      "Attempt deposit from blocked jurisdiction must revert with jurisdiction error",
      "Deposit from allowed jurisdiction must succeed",
      "Event logs clearly show jurisdiction checks for every deposit and withdrawal",
      "Test coverage must be 90% or higher",
    ],
    failureCriteria: [
      "Vault allows deposits from blocked jurisdictions",
      "Jurisdiction parsing fails silently instead of reverting with a clear error",
      "No event emissions for jurisdiction checks",
      "Documentation does not explain the jurisdiction data approach chosen",
    ],
  },
  {
    id: "TASK-03",
    number: 3,
    title: "Dividend Automation Contract with Proof of Eligibility",
    category: "developer",
    reward: 60,
    reviewerComp: 12,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build an ERC-20 snapshot contract that verifies current KYC status at dividend payment time, escrowing funds for lapsed credential holders.",
    problem: "Tokenized REITs and bonds must verify each recipient has valid KYC at the exact moment of dividend payment. Manual verification through transfer agents is expensive and error-prone.",
    deliverables: [
      "ERC-20 with snapshot extension and two-step dividend distribution",
      "Escrow logic for ineligible recipients with configurable 90-day reclaim window",
      "Gas optimization analysis for 20, 50, 100, and 500 holders",
      "Unit test suite with minimum 90% coverage",
      "Documentation: 10 to 12 page guide",
    ],
    qualityBenchmarks: [
      "Deploy to Redbelly Testnet with 20 test holders",
      "Execute distribution: eligible holders paid, ineligible holders escrowed with events",
      "Dividend math check: sum of payments plus escrowed amounts equals total pool",
      "Gas per verified recipient must not exceed 80,000 gas",
      "Test coverage must be 90% or higher",
    ],
    failureCriteria: [
      "Dividend math is incorrect",
      "Ineligible holders receive payment",
      "Self-claim allows double-claiming",
      "No events emitted for skipped payments",
    ],
  },
  {
    id: "TASK-04",
    number: 4,
    title: "Credential Expiry Monitor and Auto-Revoke System",
    category: "developer",
    reward: 100,
    reviewerComp: 20,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build an automated credential monitoring system that freezes token holders when KYC lapses and unfreezes them upon renewal.",
    problem: "When an investor's annual KYC lapses, securities regulations require immediate revocation of trading privileges. Manual tracking is impossible at scale and any delay creates a compliance gap.",
    deliverables: [
      "Registry contract and Freezable token extension",
      "Automation service (Gelato, custom Node.js keeper, or The Graph)",
      "Monitoring dashboard mockup showing frozen accounts and upcoming expirations",
      "Unit test suite with minimum 90% coverage",
      "Documentation: 15 to 18 page guide",
    ],
    qualityBenchmarks: [
      "Deploy registry and test token with 50 holders",
      "Run keeper: exactly 10 accounts frozen when credentials expire",
      "Frozen accounts cannot transfer tokens",
      "Renew 5 credentials, run keeper: exactly 5 accounts unfrozen",
      "Keeper runs reliably for 7 consecutive days",
    ],
    failureCriteria: [
      "Keeper misses a credential expiry",
      "Frozen accounts can still transfer tokens",
      "Keeper service crashes without automatic recovery",
      "No event logs for freeze/unfreeze actions",
    ],
  },
  {
    id: "TASK-05",
    number: 5,
    title: '"Community Showcase" Web Page Redesign',
    category: "design",
    reward: 80,
    reviewerComp: 16,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Design a new Community page for the Redbelly website featuring a dynamic Showcase Grid for community-built tools, matching the existing brand aesthetic exactly.",
    problem: "The official website lacks a dedicated space to highlight community contributions. Valuable tools get lost in Discord channels, missing the opportunity to validate builders and prove network activity to external visitors.",
    deliverables: [
      "Complete Figma project file: desktop (1920px), tablet (768px), mobile (375px)",
      "Showcase Grid component with project thumbnails, builder credits, links, and stack badges",
      "Submit Your Project CTA flow",
      "Developer handoff package with exportable assets and spacing specs",
      "Annotated design specification document",
    ],
    qualityBenchmarks: [
      "Must strictly match existing Redbelly website aesthetic",
      "Technical reviewer must be able to implement without design clarification questions",
      "Must visually showcase Majnoon's TVL dashboard and Robbie's Node dashboard",
      "Users should reach featured tools in 3 clicks or fewer from homepage",
    ],
    failureCriteria: [
      "Design deviates from existing Redbelly brand identity",
      "Missing any of the three required breakpoints",
      "Developer handoff assets are not exportable",
    ],
  },
  {
    id: "TASK-06",
    number: 6,
    title: "Redbelly Insights Brand Intro Sequence (Audio + Visual)",
    category: "content",
    reward: 120,
    reviewerComp: 24,
    paymentSplit: "70% RBNT / 30% USDT",
    status: "open",
    shortDescription: "Create a 5 to 10 second 3D/2D motion graphics bumper sequence for the Redbelly Insights YouTube and podcast series.",
    problem: "The Redbelly Insights series lacks a high-production video intro. Without a consistent sonic and visual signature, the series fails to establish immediate brand recall and institutional authority.",
    deliverables: [
      "Final rendered video: 1080p and 4K MP4, 5 to 10 seconds, audio at -14 LUFS",
      "Open project files (After Effects, Premiere Pro, or Blender)",
      "Individual audio stems",
      "Three concept storyboards for stakeholder review before production",
      "Creative rationale document (2 to 3 pages)",
    ],
    qualityBenchmarks: [
      "Institutional aesthetic: appropriate for a financial compliance webinar",
      "No render artefacts, clean motion blur, professional colour grading",
      "Audio must be original or properly licensed with documentation",
      "Seamless integration into interview footage",
    ],
    failureCriteria: [
      "Cartoon styles, meme references, or hype aesthetics present",
      "Audio is unlicensed",
      "Render artefacts or poor technical quality",
    ],
  },
  {
    id: "TASK-07",
    number: 7,
    title: 'The "Project Acacia" Deep-Dive Analysis',
    category: "research",
    reward: 150,
    reviewerComp: 30,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Produce a 15 to 20 page institutional-grade research report on Redbelly's involvement in the RBA Project Acacia CBDC pilot.",
    problem: "The broader market lacks a comprehensive technical breakdown proving why Redbelly was selected for Project Acacia and how it outperforms alternatives for CBDC applications.",
    deliverables: [
      "15 to 20 page research report (PDF + Markdown) with executive summary, methodology, findings, and recommendations",
      "Comparative table: Redbelly vs other CBDC pilot participants",
      "Regulatory implications for at least 3 jurisdictions",
      "Live publication on SSRN, Mirror.xyz, or Substack",
      "2 to 3 page executive brief",
    ],
    qualityBenchmarks: [
      "Must read like an equity research analyst report or IMF working paper",
      "All claims cite verifiable sources",
      "A central bank technology officer should learn new information from reading it",
      "No promotional language without evidence-backed justification",
    ],
    failureCriteria: [
      "Speculative claims presented as fact",
      "No citations or bibliography",
      "Reads as promotional content rather than objective analysis",
    ],
  },
  {
    id: "TASK-08",
    number: 8,
    title: '"Existing Bridge Integration Guide"',
    category: "documentation",
    reward: 80,
    reviewerComp: 16,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Research existing bridge support for Redbelly and write a step-by-step testnet integration guide with working code examples.",
    problem: "Limited cross-chain interoperability makes Redbelly feel isolated. Users cannot easily move assets between Redbelly and other networks, reducing liquidity and creating onboarding friction.",
    deliverables: [
      "Landscape audit of bridge protocols with support status and security assessment",
      "Step-by-step guide for completing a testnet bridge transaction",
      "GitHub repository with working test script and testnet transaction proof",
      "Published article on Dev.to or Medium",
      "Troubleshooting section covering at least 5 common errors",
    ],
    qualityBenchmarks: [
      "A mid-level developer must complete a testnet bridge transaction in under 1 hour",
      "All code snippets fully commented and free of deprecation warnings",
      "Testnet transaction hashes included as proof",
      "Landscape audit covers at least 5 bridge protocols",
    ],
    failureCriteria: [
      "Broken RPC endpoints or deprecated contract addresses",
      "Code examples throw errors when executed",
      "No testnet transaction proof provided",
    ],
  },
  {
    id: "TASK-09",
    number: 9,
    title: 'The "Anti-Friction" Developer Troubleshooting Wiki',
    category: "documentation",
    reward: 60,
    reviewerComp: 12,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build a practical troubleshooting wiki covering the 15 to 20 most common Redbelly developer errors, validated against real Discord support questions.",
    problem: "Current documentation is theory-heavy. Developers encountering standard roadblocks must rely on trial-and-error or wait hours for Discord responses.",
    deliverables: [
      "Structured wiki with minimum 15 to 20 documented issues, each with Symptom, Root Cause, Solution, and Prevention",
      "Quick-reference index by error message or keyword",
      "Live published link (GitHub Wiki, Dev.to, or Medium)",
      "Community validation: feedback from at least 3 active Discord developers",
    ],
    qualityBenchmarks: [
      "Solutions must be concrete, not vague",
      "Technical reviewer tests at least 5 solutions to verify they work",
      "Must address issues covering more than 80% of Discord support questions",
      "Formatting enables quick problem identification",
    ],
    failureCriteria: [
      "Solutions are vague or untested",
      "No live published link",
      "Fewer than 15 documented issues",
    ],
  },
  {
    id: "TASK-10",
    number: 10,
    title: '"Redbelly Network Public Dashboard"',
    category: "developer",
    reward: 120,
    reviewerComp: 24,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Build a live public dashboard displaying real-time Redbelly Network metrics: TVL, transactions, active addresses, verified entities, and partnerships.",
    problem: "Redbelly's on-chain activity is invisible on major DeFi aggregators, making the network appear inactive to researchers, investors, and prospective partners conducting due diligence.",
    deliverables: [
      "Deployed web application (React/Next.js) with live on-chain metrics",
      "Responsive design: desktop, tablet, mobile",
      "Open-source GitHub repository with deployment documentation",
      "Technical documentation covering architecture and maintenance",
    ],
    qualityBenchmarks: [
      "On-chain data must match manually verified on-chain values",
      "Page load time under 3 seconds on standard broadband",
      "Responsive on mobile devices",
      "No console errors in browser developer tools",
    ],
    failureCriteria: [
      "Data is inaccurate or stale",
      "Not responsive on mobile",
      "Page takes more than 3 seconds to load",
    ],
  },
  {
    id: "TASK-11",
    number: 11,
    title: '"RBNT Token Utility and Ecosystem Visibility Report"',
    category: "research",
    reward: 100,
    reviewerComp: 20,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Produce a comprehensive RBNT tokenomics explainer and actionable submission kits for DeFiLlama and RWA.xyz listings.",
    problem: "Community members and external observers lack clarity on how institutional adoption drives RBNT token demand. Redbelly is also absent from major RWA tracking platforms.",
    deliverables: [
      "RBNT Token Utility Report: 10 to 15 pages with charts",
      "Explainer article under 500 words for community distribution",
      "DeFiLlama submission kit: TVL adapter code, API docs, contract registry",
      "RWA.xyz submission kit: asset registry data, verification docs, submission walkthrough",
    ],
    qualityBenchmarks: [
      "All tokenomics claims cite official Redbelly documentation",
      "No speculative price predictions",
      "TVL adapter executes without errors",
      "Submission plans actionable within 30 days",
    ],
    failureCriteria: [
      "Speculative price predictions included",
      "TVL adapter code does not execute",
      "Claims are unsourced",
    ],
  },
  {
    id: "TASK-12",
    number: 12,
    title: "The Community Mandate: X Account Manager",
    category: "content",
    reward: 150,
    reviewerComp: 0,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Manage the Redbelly DAO X (Twitter) account for one month. Minimum 25 tweets, monthly analytics report, professional institutional voice maintained throughout.",
    problem: "The X account needs consistent, institutional management that balances DAO warmth with TradFi professionalism.",
    deliverables: [
      "Daily content creation and posting (1 to 2 tweets or threads per day minimum)",
      "Active community engagement: responses, retweets, DM monitoring",
      "Monthly analytics report submitted by the 5th of the following month",
      "Optional but recommended: weekly content calendar",
    ],
    qualityBenchmarks: [
      "Minimum 25 tweets per month",
      "Average engagement rate above 2%",
      "Zero factual corrections required after posting",
      "Response time under 24 hours to mentions and DMs",
    ],
    failureCriteria: [
      "Account goes dormant for more than 3 consecutive days",
      "Factual errors posted and not corrected",
      "Tone deviates significantly from brand guidelines",
    ],
  },
  {
    id: "TASK-13",
    number: 13,
    title: '"Zero-to-Hero" Developer Onboarding Kit',
    category: "documentation",
    reward: 150,
    reviewerComp: 30,
    paymentSplit: "70% RBNT / 30% USDT",
    status: "open",
    shortDescription: "Create a 5-module written curriculum, 5 working code examples, and a 3 to 5 part video walkthrough series taking a developer from zero to first deployed contract.",
    problem: "Existing docs assume prior blockchain knowledge and jump straight into advanced concepts. New builders need a linear, step-by-step curriculum.",
    deliverables: [
      "5 progressive modules in Markdown: Environment Setup, First Contract, State Management, Access Control, Real-World Integration",
      "5 working Hardhat projects (one per module) in a GitHub repository",
      "3 to 5 HD screen-capture videos (10 to 20 minutes each) uploaded to YouTube",
    ],
    qualityBenchmarks: [
      "A developer with zero Redbelly experience must deploy a contract in under 2 hours",
      "All code examples compile and deploy without errors on current testnet",
      "Audio clear, on-screen code legible at 1080p",
      "No deprecated libraries or outdated syntax",
    ],
    failureCriteria: [
      "Code examples do not compile or deploy",
      "Videos have poor audio or illegible code",
      "Tutorial skips critical steps",
    ],
  },
  {
    id: "TASK-14",
    number: 14,
    title: '"EligibilitySDK" Integration Guide',
    category: "documentation",
    reward: 100,
    reviewerComp: 20,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Write a comprehensive step-by-step EligibilitySDK integration guide covering React, Next.js App Router, backend verification, and a complete error resolution reference.",
    problem: "The EligibilitySDK lacks a dedicated frontend integration guide. Developers guess on backend verification flows, widget embedding, and error handling.",
    deliverables: [
      "Step-by-step guide covering frontend embedding through backend verification to production",
      "React code examples with useHasChainPermission and useBusinessDetails hooks",
      "Next.js App Router code examples for server-side verification",
      "Integration patterns document with SDK combination decision tree",
      "Error resolution section mapping every SDK error code",
    ],
    qualityBenchmarks: [
      "A developer must integrate the widget into an existing dApp within 4 hours",
      "Error resolution covers every error code in the official SDK reference",
      "All code examples compile on current React and Next.js versions",
    ],
    failureCriteria: [
      "Code examples do not compile on current versions",
      "Error resolution section is incomplete",
      "Guide omits backend verification",
    ],
  },
  {
    id: "TASK-15",
    number: 15,
    title: "DAO Website Navigation Overhaul and Information Architecture",
    category: "design",
    reward: 150,
    reviewerComp: 30,
    paymentSplit: "100% RBNT",
    status: "open",
    shortDescription: "Redesign the DAO website information architecture with clear pathways for Developers, DAO Members, and Institutional Users.",
    problem: "The current website architecture is fragmented. Finding bridge support, developer docs, or governance details requires deep digging through multiple pages.",
    deliverables: [
      "Complete Figma mockup: desktop and mobile navigation patterns",
      "Navigation flowchart mapping every current page to new location",
      "Cross-linking strategy document identifying at least 20 connection points",
      "User journey maps for Developers, DAO Members, and Institutional Users",
      "Before-and-after comparison for the 10 most visited content types",
    ],
    qualityBenchmarks: [
      "Key content findable in fewer than 2 clicks from homepage",
      "Navigation flowchart accounts for every existing page",
      "Mobile navigation tested and documented separately",
    ],
    failureCriteria: [
      "Proposed architecture introduces dead ends or orphaned pages",
      "Navigation flowchart is incomplete",
      "No mobile navigation consideration",
    ],
  },
];

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error("Usage: node scripts/seed-tasks.js path/to/serviceAccountKey.json");
    process.exit(1);
  }

  const serviceAccount = require(path.resolve(keyPath));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(`\nSeeding ${TASKS.length} tasks into Firestore...`);

  for (const task of TASKS) {
    const { id, ...data } = task;
    await db.collection("tasks").doc(id).set(data);
    console.log(`  ✓ ${id}: ${task.title}`);
  }

  console.log(`\nDone. ${TASKS.length} tasks seeded.`);
  console.log("Remember to re-promote yourself to admin in the users collection.");
  process.exit(0);
}

const { resolve } = require("path");
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
