#!/usr/bin/env node
/**
 * Expand the 15 pilot task descriptions in Firestore using the detailed
 * specifications from:
 *   resource-documents/02. Final Taskboard Pilot Roster_Tasks (1).md
 *
 * Contributors reported that tasks were under-explained on the board. The live
 * task docs were a condensed version of the source spec; this script pushes the
 * fuller wording back in.
 *
 * Only enriches the descriptive fields: problem, technicalRequirements,
 * deliverables, qualityBenchmarks, and (where the source provides them)
 * failureCriteria. Uses set(..., { merge: true }) so status, rewards, category,
 * reviewerComp, paymentSplit, maxSubmissions, assignments, shortDescription and
 * infrastructure are NEVER touched.
 *
 * Usage:
 *   node scripts/expand-tasks.js path/to/serviceAccountKey.json            # dry run (diff only, no writes)
 *   node scripts/expand-tasks.js path/to/serviceAccountKey.json --apply    # write to Firestore
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");

const EXPANSIONS = {
  "TASK-01": {
    problem: `Standard ERC-20 tokens have no identity requirements. Airdrop farmers create thousands of wallets to claim rewards multiple times. Traditional solutions use centralized whitelists that are expensive to maintain and create data honeypots. On a compliance-first chain like Redbelly, this problem is solvable at the protocol layer using the existing eligibility infrastructure rather than bolting on external identity solutions after the fact.`,
    technicalRequirements: [
      `Build an ERC-20 token contract that blocks unverified users from minting or transferring tokens.`,
      `Integrate with Redbelly's hasChainPermission(address) function from the EligibilitySDK.`,
      `Users must complete KYC through the IndividualOnboardingSDK before interacting with the token.`,
      `The contract must revert with clear, descriptive, KYC-specific error messages when unverified users attempt restricted actions.`,
      `Provide a configurable option allowing the contract owner to toggle whether transfers (not just minting) require verification.`,
      `Include an admin function to update the eligibility contract address in case Redbelly deploys updated infrastructure.`,
    ],
    deliverables: [
      `Smart Contract: an ERC-20 with verification gating on minting and a configurable transfer gate. Must inherit from OpenZeppelin ERC-20 and integrate cleanly with the EligibilitySDK, with a deployment script targeting Redbelly Testnet (Chain ID 153).`,
      `Frontend Example: a React component embedding the IndividualOnboardingSDK widget that displays real-time verification status via the useHasChainPermission hook. The UI must clearly disable token actions for unverified users and show explanatory messaging directing them to the KYC flow.`,
      `Test Suite: unit tests proving verified users can mint, unverified users are blocked from minting, transfer gating can be toggled on/off by the owner, and the eligibility contract address can be updated by the owner but not by non-owners. Minimum 90% coverage.`,
      `Documentation: a 5 to 7 page integration guide covering contract architecture, deployment steps on Redbelly Testnet, a frontend integration walkthrough, and a troubleshooting section for common errors (gas estimation failures, SDK widget rendering issues, RPC timeout handling).`,
    ],
    qualityBenchmarks: [
      `Deploy to Redbelly Testnet with verified source code on the block explorer.`,
      `An unverified wallet attempting to mint must revert with a KYC-specific error message.`,
      `The same wallet, after completing KYC, must successfully mint.`,
      `Gas cost for the verification check must not exceed 50,000 gas.`,
      `Test coverage must be 90% or higher.`,
    ],
    failureCriteria: [
      `Contract allows minting or transfers by unverified wallets.`,
      `Error messages are generic (e.g. "transaction reverted") rather than KYC-specific.`,
      `Frontend example does not compile or render the SDK widget correctly.`,
      `Test suite does not cover the toggle between gated and ungated transfers.`,
      `Documentation omits deployment instructions or contains broken code snippets.`,
    ],
  },

  "TASK-02": {
    problem: `Tokenized real-world assets (real estate, private equity, regulated securities) require region-specific transfer restrictions to comply with securities laws. A Manhattan apartment token can only be sold to US-accredited investors; a German bond can only be held by EU residents. Traditional solutions use off-chain databases that break composability and require manual reconciliation every time a transfer happens. On Redbelly, jurisdiction data is already stored on-chain through the Business Identifier contracts, making compliance enforceable at the smart contract layer.`,
    technicalRequirements: [
      `Build an ERC-4626 vault contract that restricts deposits and withdrawals based on user jurisdiction, inheriting from OpenZeppelin's ERC4626 base.`,
      `Integrate with the BusinessOnboardingSDK's Business Identifier contracts for institutional depositors and the IndividualOnboardingSDK for retail depositors.`,
      `Query business details using getBusinessDetails(address) to extract jurisdiction data.`,
      `Maintain a configurable allowlist and blocklist of jurisdictions (ISO country codes), with admin functions to add or remove allowed jurisdictions without redeployment.`,
      `Jurisdiction Data Challenge: Business Identifier contracts store a companyAddress containing location information. Choose ONE approach and document the trade-offs - Option A: parse the jurisdiction from the existing companyAddress string field, or Option B: propose adding an explicit jurisdiction field to Business Identifier contracts. Document the choice, the rationale, and the limitations.`,
    ],
    deliverables: [
      `Smart Contract Suite: an ERC-4626 vault with jurisdiction checking, a Business Identifier interface, jurisdiction helper functions, and deployment scripts for Redbelly Testnet.`,
      `Jurisdiction Handling Implementation: complete code for extracting and validating jurisdiction data from on-chain records, including edge-case handling for malformed addresses, missing data, and jurisdictions not in the allowlist.`,
      `Admin Dashboard Mockup: a Figma file OR React component showing the vault configuration interface, a jurisdiction management panel (add/remove jurisdictions), and transfer history with jurisdiction flags.`,
      `Test Suite: unit tests proving allowed jurisdictions can deposit, blocked jurisdictions are rejected, jurisdiction-list updates take effect immediately, and dual-path verification (Business vs Individual SDK) routes correctly. Minimum 90% coverage.`,
      `Documentation: an 8 to 10 page guide covering the legal context for jurisdictional compliance, contract architecture, deployment walkthrough, jurisdiction configuration instructions, and compliance-reporting capabilities.`,
    ],
    qualityBenchmarks: [
      `Deploy the vault to Redbelly Testnet.`,
      `Configure with allowedJurisdictions = ["US"].`,
      `A deposit attempt from a wallet with jurisdiction "SG" (Singapore) must revert with a jurisdiction error.`,
      `A deposit from a "US" wallet must succeed.`,
      `Event logs clearly show jurisdiction checks for every deposit and withdrawal attempt.`,
      `Gas cost for the jurisdiction check must not exceed 100,000 gas.`,
      `Test coverage must be 90% or higher.`,
    ],
    failureCriteria: [
      `Vault allows deposits from blocked jurisdictions.`,
      `Jurisdiction parsing fails silently instead of reverting with a clear error.`,
      `No event emissions for jurisdiction checks (audit trail missing).`,
      `Documentation does not explain the jurisdiction data approach chosen or its trade-offs.`,
    ],
  },

  "TASK-03": {
    problem: `Tokenized REITs and bonds must verify each recipient has valid KYC at the exact moment of dividend payment, not just when they purchased the token. A holder who was compliant last quarter may have let their credentials lapse. Traditional transfer agents charge $10,000 or more per quarterly distribution for 1,000 holders. On Redbelly, the on-chain eligibility check makes this verification automatable and near-costless.`,
    technicalRequirements: [
      `Build an ERC-20 token with snapshot capability for recording holder balances at a point in time.`,
      `Implement a two-step dividend process - Step 1 (Snapshot): record token balances at the dividend declaration date; Step 2 (Distribution): pay dividends based on the snapshot but check CURRENT eligibility status before each payment.`,
      `Skip payments to holders whose credentials expired since the snapshot was taken.`,
      `Allow holders to self-claim dividends as an alternative to batch distribution by the issuer.`,
      `Track unclaimed funds from expired credentials and allow the issuer to reclaim them after a configurable waiting period (default 90 days).`,
      `Critical verification logic at distribution time, per recipient: calculate the dividend from the snapshot balance; check current eligibility via hasChainPermission(address); if eligible, transfer immediately; if expired, skip the payment, emit an event with a reason code and add the amount to the unclaimed pool; track skipped amounts for later issuer reclaim after the waiting period.`,
    ],
    deliverables: [
      `Smart Contract: an ERC-20 with a snapshot extension, dividend-cycle management (declare, distribute, claim, reclaim), a batch distribution function with configurable batch sizes, a self-claim function, and unclaimed-fund reclaim after the waiting period, with deployment scripts for Redbelly Testnet.`,
      `Frontend Dashboard (optional but recommended): a React component showing current allocation per holder, an eligibility-status indicator, a claim button with countdown, and distribution history.`,
      `Test Suite: unit tests proving the snapshot accurately captures balances, dividend math is correct to the wei, eligible holders receive payment, ineligible holders are skipped with events, self-claim works, double-claim is blocked, and reclaim triggers only after the waiting period. Minimum 90% coverage.`,
      `Gas Optimization Analysis: a document showing gas costs for distributions of 20, 50, 100 and 500 holders, with batch-size recommendations for minimizing total gas cost.`,
      `Documentation: a 10 to 12 page guide covering the regulatory rationale for point-in-time eligibility checks, the full walkthrough from snapshot to distribution to reclaim, admin procedures, and gas-optimization strategies.`,
    ],
    qualityBenchmarks: [
      `Deploy to Redbelly Testnet with 20 test holders.`,
      `Take a snapshot, then expire 5 holders' credentials.`,
      `Execute distribution: 15 payments succeed, 5 are skipped with events emitted.`,
      `Math check: the sum of the 15 payments plus the 5 skipped amounts equals the total dividend pool (within 1 wei tolerance).`,
      `Gas per verified recipient must not exceed 80,000 gas.`,
      `Test coverage must be 90% or higher.`,
    ],
    failureCriteria: [
      `Dividend math is incorrect (total distributed plus total skipped does not equal the total pool).`,
      `Ineligible holders receive payment.`,
      `Self-claim allows double-claiming.`,
      `No events emitted for skipped payments (breaks the audit trail).`,
    ],
  },

  "TASK-04": {
    problem: `When an investor's annual KYC lapses, securities regulations require immediate revocation of trading privileges. Manual tracking across thousands of holders is impossible at scale. Any delay between credential expiry and access revocation creates a compliance gap that regulators will scrutinize. This system must run autonomously, detect status changes, and enforce restrictions without human intervention.`,
    technicalRequirements: [
      `Component 1 - Smart Contracts: a registry contract tracking which tokens require credential monitoring; a freezable token extension adding freeze/unfreeze to any ERC-20; access control allowing only the authorized keeper service to freeze accounts; and clear event emissions for all freeze/unfreeze actions with timestamps and reason codes.`,
      `Component 2 - Automation Service: a daily check of all monitored token holders that queries hasChainPermission for each holder, compares against the previous state, calls freezeAccount() when a credential expires (status changes from true to false) and unfreezeAccount() when it is renewed (false to true).`,
      `Automation implementation - choose ONE: Option A Gelato Network (a daily Gelato Automate task with a Web3 Function checking credentials; document setup and gas management; use if Gelato supports Redbelly); Option B Custom Keeper Service (a Node.js service on cron or AWS Lambda, storing previous permission states in a database or file, with a deployment guide for AWS Lambda, DigitalOcean or similar); Option C The Graph + Webhooks (a subgraph indexing hasChainPermission changes with webhooks; only if The Graph supports Redbelly).`,
    ],
    deliverables: [
      `Smart Contract Suite: the registry contract, the Freezable token extension, an example token integration demonstrating both contracts working together, and deployment scripts for Redbelly Testnet.`,
      `Automation Service: a complete implementation of ONE chosen option with full source code, configuration files, state-management logic, error handling, and retry logic for failed transactions.`,
      `Test Suite: contract unit tests plus an integration test proving 10 of 50 accounts freeze correctly when credentials expire, then 5 of 10 unfreeze when renewed, and that frozen accounts cannot transfer. Minimum 90% coverage.`,
      `Monitoring Dashboard Mockup: a Figma file OR React component showing the monitored-tokens list, frozen-account counts, recent freeze/unfreeze events with timestamps, upcoming credential expirations (7-day and 30-day warnings), and keeper-service health status.`,
      `Documentation: a 15 to 18 page guide covering the regulatory context, complete system architecture diagrams, a deployment guide for the chosen automation option, registry-management instructions, a token-integration walkthrough (adding FreezableToken to an existing ERC-20), monitoring and alerting setup, disaster-recovery procedures, and gas-cost projections.`,
    ],
    qualityBenchmarks: [
      `Deploy the registry and a test token with 50 holders (all verified) to Redbelly Testnet.`,
      `Expire credentials for 10 holders.`,
      `Run the keeper service: exactly 10 accounts frozen with events emitted.`,
      `Frozen accounts cannot transfer (the transaction must revert).`,
      `Renew 5 credentials, run the keeper again: 5 accounts unfrozen, 5 remain frozen.`,
      `Gas per freeze operation must not exceed 60,000 gas.`,
      `The keeper runs reliably for 7 consecutive days without manual intervention.`,
      `Test coverage must be 90% or higher.`,
    ],
    failureCriteria: [
      `The keeper misses a credential expiry (a holder remains unfrozen after their KYC lapses).`,
      `Frozen accounts can still transfer tokens.`,
      `The keeper service crashes without automatic recovery.`,
      `No event logs for freeze/unfreeze actions (audit trail broken).`,
    ],
  },

  "TASK-05": {
    problem: `The official Redbelly website (https://redbelly.network/community) lacks a dedicated, engaging space to highlight community contributions. Valuable ecosystem tools like Majnoon's TVL dashboard and Robbie's Node dashboard get lost in Discord channels. This misses a critical opportunity to validate builders, prove network activity to external visitors, and create visible momentum.`,
    technicalRequirements: [
      `Audit the current Community page and identify structural gaps.`,
      `Map out a new page layout that integrates seamlessly into Redbelly's existing visual identity (typography, colour palette, spacing, component styles).`,
      `Design a dynamic Showcase Grid component featuring: a project thumbnail or screenshot, the builder handle and credit, a 2 to 3 sentence description, an external link to the live tool or GitHub repo, and optional technology-stack badges (React, Solidity, etc.).`,
      `Design a "Submit Your Project" call-to-action flow explaining how new builders can get featured.`,
      `Propose additional community-aligned content sections (e.g. Featured Builder Spotlight, Ecosystem Stats, Recent Contributions).`,
    ],
    deliverables: [
      `Complete Figma Project File with desktop (1920px), tablet (768px) and mobile (375px) layouts, and all three breakpoints showing responsive behaviour.`,
      `Asset Organisation: all components grouped and labelled, layers named for developer handoff (e.g. "Showcase_Grid_Container", "Project_Card_01"), colour styles extracted and documented (hex codes), typography styles documented (font families, weights, sizes, line heights), and the grid system clearly marked (columns, gutters, margins).`,
      `Developer Handoff Package: exportable assets (icons, illustrations, mock project screenshots), spacing and padding specifications, hover states for interactive elements, and component variant documentation (empty, loading and populated states).`,
    ],
    qualityBenchmarks: [
      `Brand Consistency: must strictly match the existing Redbelly website aesthetic. Do NOT reinvent the visual identity.`,
      `Developer-Ready: a technical reviewer must be able to export all assets and implement the layout without asking design clarification questions.`,
      `Featured Projects: must visually showcase Majnoon's TVL dashboard and Robbie's Node dashboard as core examples in the grid.`,
      `Accessibility: users should reach featured community tools in 3 clicks or fewer from the homepage.`,
    ],
  },

  "TASK-06": {
    problem: `The "Redbelly Insights" YouTube and podcast series (featuring interviews with institutional partners and ecosystem builders) currently lacks a high-production video intro. Without a consistent sonic and visual signature, the series fails to establish immediate brand recall and institutional authority. The first 5 to 10 seconds of video content sets the tone for credibility. Redbelly Insights needs a bumper sequence that signals TradFi-grade professionalism before the interviews begin.`,
    technicalRequirements: [
      `Create a 5 to 10 second 3D or 2D motion-graphics bumper sequence to open all Redbelly Insights episodes.`,
      `Integrate visual metaphors representing Redbelly's architecture: "DBFT finality" shown as digital locks or vault mechanisms snapping into place with precision; "Receptor scanning" represented by verification grids, identity nodes being authenticated, or secure credential flows; and network nodes forming a synchronized consensus pattern.`,
      `Incorporate original or properly licensed audio and sound design conveying institutional security (sharp, precise cues), technological sophistication (digital/synthetic tones) and trustworthiness (avoid hype or pump aesthetics).`,
      `Reference institutional finance media aesthetics (Bloomberg Technology, Fireblocks brand videos, Chainalysis reports), NOT retail crypto influencer content.`,
    ],
    deliverables: [
      `Finalised Video Files: 1080p MP4 (H.264, suitable for YouTube) and 4K MP4 (H.264, future-proofed), duration exactly 5 to 10 seconds, with a stereo audio mix at the -14 LUFS loudness standard.`,
      `Open Project Files: the After Effects (.aep), Premiere Pro (.prproj) or Blender (.blend, if 3D) project with all assets organised (fonts, audio stems, shape layers, imported media) and render settings documented.`,
      `Asset Package: individual audio stems (background tone, SFX, etc.), any custom 3D models or vector graphics used, and font files if custom typography is included.`,
    ],
    qualityBenchmarks: [
      `Seamless Integration: the animation must loop cleanly into a transparent background OR fade to a solid colour (black or dark blue) for easy overlay onto interview footage.`,
      `Institutional Aesthetic: must feel appropriate for a financial compliance webinar or central-bank presentation. Avoid cartoon or anime styles, meme references, overly colourful DeFi aesthetics, and laser-eye or rocket imagery.`,
      `Technical Quality: no render artefacts, clean motion blur, smooth keyframe easing, professional colour grading.`,
      `Audio Licensing: all audio must be original composition OR properly licensed, with licence documentation included. No copyright-infringing music.`,
    ],
  },

  "TASK-07": {
    problem: `Redbelly Network's involvement in the Reserve Bank of Australia's (RBA) Project Acacia CBDC pilot is a major institutional authority signal. However, the broader crypto and TradFi markets lack a comprehensive technical breakdown proving why Redbelly was selected and how it outperforms alternative blockchain architectures for central bank digital currency applications. This research gap prevents the ecosystem from fully leveraging the RBA partnership for credibility and business-development momentum.`,
    technicalRequirements: [
      `Research phase: analyse all publicly available information on Project Acacia (RBA press releases, pilot reports, technical whitepapers); review Redbelly's official technical documentation to understand its architectural advantages; and compare Redbelly's DBFT consensus against alternatives tested in other CBDC pilots (Ethereum, Hyperledger, R3 Corda, etc.).`,
      `Analysis phase: explain WHY Redbelly was chosen for this specific use case (transaction finality requirements, regulatory-compliance integration, throughput benchmarks); break down the technical advantages (DBFT deterministic vs probabilistic finality, Receptor identity integration for regulated participants, atomic settlement for simultaneous payment-vs-payment); document real-world pilot outcomes where publicly disclosed; and assess regulatory implications across at least three jurisdictions (Australia, Singapore and one more).`,
      `Writing phase: format the analysis for an institutional audience (equity-research report style, not a promotional blog post), structured with executive summary, methodology, findings and technical appendix, including charts and diagrams where helpful (system architecture, consensus comparison tables, transaction-flow diagrams).`,
      `The report must answer: What were the RBA's technical requirements for Project Acacia? How does DBFT consensus provide finality advantages over probabilistic consensus? What role did the Receptor identity system play in pilot compliance? How does Redbelly's atomic settlement compare to traditional RTGS (Real-Time Gross Settlement) systems? What are the implications for future CBDC deployments on Redbelly?`,
    ],
    deliverables: [
      `Comprehensive Research Report: 15 to 20 pages including charts and diagrams, delivered as a professionally typeset PDF plus a Markdown source file for future web publication. Must include executive summary, methodology, findings, comparative analysis, regulatory implications and strategic recommendations.`,
      `Proper Citations: every claim cites its source (RBA publications, Redbelly technical docs, academic papers on consensus mechanisms), with footnotes or endnotes and a complete bibliography / works-cited section.`,
      `Live Publication: published on SSRN, Mirror.xyz or Substack, and publicly accessible (not paywalled).`,
      `Executive Brief: a condensed 2 to 3 page summary suitable for distribution to institutional partners who will not read the full report.`,
    ],
    qualityBenchmarks: [
      `Professional Writing: must read like an equity-research analyst report or IMF working paper.`,
      `Objective Analysis: focus on technical facts and architectural trade-offs; avoid promotional language without evidence-backed justification.`,
      `Technical Depth: a central-bank technology officer or blockchain architect should learn NEW information from reading this, not just marketing talking points.`,
      `Citation Accuracy: the technical reviewer must be able to verify all factual claims via the provided sources.`,
    ],
  },

  "TASK-08": {
    problem: `Limited cross-chain interoperability makes Redbelly Network feel isolated. Users trying to bring external liquidity or assets (USDC, WETH, etc.) from major chains like Ethereum or Polygon face friction due to a lack of clear bridge integration documentation. This creates an onboarding barrier for DeFi users and limits TVL growth.`,
    technicalRequirements: [
      `Research phase: identify which existing cross-chain bridges currently support Redbelly Network (if any), test the compatibility of major bridge protocols (LayerZero, Axelar, Wormhole, Connext, and Multichain if still operational), and determine whether Redbelly can be added as a custom chain to any of them.`,
      `Implementation phase: set up a testnet bridge integration (Ethereum Sepolia to Redbelly Testnet OR Polygon Mumbai to Redbelly Testnet), document the exact architecture required (RPC endpoints, any custom bridge-contract deployments, gas-token requirements, message-verification mechanisms), and execute a successful cross-chain test transaction.`,
      `Documentation phase: write a step-by-step tutorial that a mid-level developer can replicate, including a troubleshooting section for common errors (RPC timeouts, gas-estimation failures, bridge-fee calculation, stuck transactions).`,
    ],
    deliverables: [
      `Technical Guide (Markdown): an introduction explaining bridge-architecture basics, prerequisites (wallets, testnet funds, RPC access), a step-by-step integration walkthrough, code snippets for key operations (approve, bridge, claim), a troubleshooting section, and gas-cost analysis for different transaction sizes.`,
      `GitHub Repository: a working test script or minimal frontend demonstrating a successful bridge transaction, a README with setup instructions, an .env.example template, documented dependencies, and test transaction hash(es) proving a successful cross-chain transfer on testnet.`,
      `Published Article: the guide published on Dev.to or Medium with a search-optimised title and screenshots or screen recordings where helpful.`,
    ],
    qualityBenchmarks: [
      `Functional Accuracy: a mid-level developer with basic Web3 experience must be able to bridge a test token from Ethereum Sepolia to Redbelly Testnet in under 1 hour by following the guide.`,
      `Code Quality: all code snippets must be fully commented, properly formatted and free of deprecation warnings.`,
      `Testnet Proof: must include verifiable testnet transaction hashes showing successful bridge execution.`,
      `Troubleshooting Coverage: the guide must address at least 5 common error scenarios with exact solutions.`,
    ],
    failureCriteria: [
      `Guide contains broken RPC endpoints or deprecated contract addresses.`,
      `Code examples throw errors when executed.`,
      `No testnet transaction proof provided.`,
      `Tutorial skips critical steps (e.g. does not explain how to acquire testnet RBNT for gas).`,
    ],
  },

  "TASK-09": {
    problem: `Redbelly's current developer documentation is heavily theoretical and research-focused. Developers encountering standard technical roadblocks (RPC connection timeouts, gas-estimation errors, SDK integration failures, contract deployment issues) are forced to rely on trial-and-error or wait hours for Discord support responses. This creates unnecessary friction and slows ecosystem development.`,
    technicalRequirements: [
      `Research phase: review the Redbelly Developer Discord and Telegram channels for recurring technical questions, identify the 15 to 20 most common error patterns and roadblocks, and categorise them by type (network/RPC connection problems, smart contract deployment failures, EligibilitySDK integration errors, gas estimation and transaction failures, wallet connection issues, testnet faucet problems).`,
      `Documentation phase: for each identified issue create a structured entry with Symptom (the exact error message or observable behaviour), Root Cause (why the error occurs), Solution (a step-by-step fix with exact commands or code changes) and Prevention (how to avoid the issue in future projects).`,
      `Example issues to cover include: RPC endpoint returning 429 (rate limit) errors, "nonce too low" transaction failures, MetaMask not detecting Redbelly Network, EligibilitySDK widget not rendering, Hardhat deployment failing with "insufficient funds", contract verification on the block explorer failing, gas-price estimation returning null, testnet faucet not distributing RBNT, cross-origin issues with the SDK iframe, and transactions pending indefinitely.`,
    ],
    deliverables: [
      `Structured Troubleshooting Wiki (Markdown): organised by category, a minimum of 15 to 20 documented issues, each formatted consistently with Symptom, Root Cause, Solution and Prevention, plus a quick-reference index allowing developers to search by error message or keyword.`,
      `Live Published Link: published on GitHub Wiki, Dev.to or Medium, publicly searchable with a good SEO title and metadata, and including a table of contents for easy navigation.`,
      `Community Validation: share the draft in the Redbelly Discord developer channel and incorporate feedback from at least 3 active developers.`,
    ],
    qualityBenchmarks: [
      `Actionability: solutions must be concrete ("Run this command"), not vague ("Check your configuration").`,
      `Scannability: formatting must enable quick problem identification (clear headers, code blocks, bullet points).`,
      `Accuracy: the technical reviewer tests at least 5 solutions to verify they actually fix the stated problems.`,
      `Coverage: must address issues accounting for more than 80% of Discord support questions based on channel analysis.`,
    ],
  },

  "TASK-10": {
    problem: `Redbelly Network suffers from an invisibility problem on major DeFi aggregators. Partnership activity and tokenized asset values are not tracked on DeFiLlama or RWA.xyz, making the network appear inactive to external researchers and investors. The network's actual on-chain activity is healthy but unreported, creating a perception gap that hurts business development and community morale.`,
    technicalRequirements: [
      `Build a public-facing web application displaying real-time Redbelly Network metrics.`,
      `On-chain data (live via RPC or indexer): Total Value Locked across all deployed protocols, total transactions processed (24h, 7d, 30d, all-time), active addresses (daily and monthly), total gas fees paid in RBNT, smart contracts deployed, and average block time and finality metrics.`,
      `Off-chain data (manually curated or API-sourced): number of verified businesses (via BusinessOnboardingSDK) and verified individuals (via IndividualOnboardingSDK), a list of tokenized RWA projects on Redbelly (if publicly disclosed), and partnership announcements (RBA Project Acacia, enterprise integrations).`,
      `UI/UX: responsive design (desktop, tablet, mobile), real-time or near-real-time updates (WebSocket or polling), charts for time-series data (TVL over time, transaction volume trends), a clean institutional aesthetic matching Redbelly branding, and fast load times (under 3 seconds initial page load).`,
      `Recommended stack: React + Next.js (for SSR and SEO), ethers.js or viem for RPC calls, Recharts / Chart.js / D3.js for charts, Tailwind CSS or styled-components for styling, hosted on Vercel or Netlify.`,
    ],
    deliverables: [
      `Live Hosted Dashboard: deployed to Vercel, Netlify or similar with a live URL; an open-source GitHub repository with complete source code, a README with local setup instructions, an .env.example template, and documented data sources.`,
      `Technical Documentation: an architecture overview (how data flows from the blockchain to the dashboard), API documentation if custom endpoints are created, a deployment guide, and maintenance procedures (how to add new protocols to the TVL calculation).`,
    ],
    qualityBenchmarks: [
      `On-chain data must be functionally accurate (the reviewer verifies TVL matches a manual calculation).`,
      `The UI must be responsive on mobile devices (tested on iPhone and Android).`,
      `Page load time under 3 seconds on a standard broadband connection.`,
      `Charts must display properly across all major browsers (Chrome, Firefox, Safari, Edge).`,
      `No console errors in browser developer tools.`,
      `Follows Redbelly's visual brand guidelines.`,
    ],
  },

  "TASK-11": {
    problem: `Community members and external observers lack clarity on how institutional adoption actually drives RBNT token demand beyond basic gas-fee utility. Additionally, Redbelly is absent from major RWA tracking platforms (RWA.xyz, DeFiLlama), limiting discoverability and making the network appear less established than it is. This research and strategic deliverable complements the Network Dashboard (Task 10) with the analytical layer investors and partners need.`,
    technicalRequirements: [
      `Part 1 - RBNT Tokenomics Explainer: cover gas fees (how RBNT is used for transaction costs), staking mechanics, supply dynamics (total supply, emission schedule, burns if any), demand drivers (how institutional adoption increases RBNT demand), network effects (relationship between TVL growth and token value) and governance (whether RBNT holders have voting rights). Must align strictly with Redbelly's official whitepaper and tokenomics documentation and avoid speculative price predictions or promotional language.`,
      `Part 2 - DeFiLlama and RWA.xyz Submission Kit: research the exact integration requirements for both platforms (DeFiLlama TVL adapter code, API endpoints, contract addresses; RWA.xyz asset-registry format and verification process), draft submission-ready integration code (TVL calculation scripts, API endpoints, contract ABI and address mappings, testing documentation proving data accuracy), and write a submission guide explaining how to maintain the listings (data updates, refresh schedules).`,
    ],
    deliverables: [
      `RBNT Token Utility Report: 10 to 15 pages including charts and diagrams, a professionally formatted PDF that cites Redbelly's official whitepaper for all claims, with a competitive comparison table showing RBNT utility against tokens of other RWA-focused Layer 1 networks.`,
      `Explainer Article: under 500 words, titled "How Network Adoption Drives RBNT Value", formatted for community distribution on social media and Discord.`,
      `DeFiLlama Submission Kit: complete TVL adapter code (JavaScript or TypeScript), API endpoint documentation, a contract-address registry (JSON format), a testing guide proving adapter accuracy, and a submission instructions document.`,
      `RWA.xyz Submission Kit: asset-registry data in the required format, verification documentation, and a submission walkthrough with exact contact points and application timeline.`,
    ],
    qualityBenchmarks: [
      `All tokenomics claims must cite official Redbelly documentation.`,
      `No speculative price predictions or investment advice.`,
      `TVL adapter code executes without errors.`,
      `Calculated TVL matches manual verification within a 5% margin.`,
      `Submission plans must be actionable within 30 days of delivery.`,
      `Suitable for presentation to institutional investors (professional tone and formatting).`,
    ],
  },

  "TASK-12": {
    problem: `The Redbelly DAO's X (Twitter) account needs consistent, high-quality management that balances institutional credibility with community warmth. The account must amplify technical work produced by task board contributors, engage with ecosystem partners, and attract developers and builders, all while maintaining a voice that resonates with both TradFi professionals and crypto-native builders. Poor social media management leads to low engagement, missed partnership opportunities, and wasted content-production effort. This is a monthly recurring role.`,
    technicalRequirements: [
      `Content Creation and Scheduling: a minimum of 1 to 2 tweets per day (or threads where appropriate), a weekly thread highlighting completed task board deliverables, translating technical outputs (smart contracts, research reports, SDK guides) into digestible, engaging content, and sharing ecosystem updates, partnership announcements and builder spotlights.`,
      `Community Engagement: respond to mentions and DMs within 24 hours, proactively engage with ecosystem builders, RWA/DeFi protocols that could integrate with Redbelly, institutional blockchain projects and Web3 developer communities, and amplify community-created content (tutorials, tools, analyses).`,
      `Reputation Management: monitor for FUD and address it with facts, correct misinformation about Redbelly Network capabilities, and provide professional crisis communication if needed.`,
      `Content mix: roughly 70% institutional voice (technical achievements, partnership milestones, compliance advantages, professional language, cited sources, no hype) and roughly 30% community warmth (celebrating builder contributions, sharing ecosystem culture tastefully, humanising the DAO with behind-the-scenes content, friendly interaction with partner projects).`,
      `Terms: an X Premium subscription ($8/month) is funded by the DAO treasury outside the retainer. The role is revocable by DAO vote if the account goes dormant (more than 3 consecutive days without activity), engagement metrics fall more than 30% below agreed KPIs for 2 consecutive months, the tone deviates significantly from brand guidelines, or monthly analytics reports are not submitted; if revoked, payment is pro-rated for completed weeks only.`,
    ],
    deliverables: [
      `Ongoing Account Management: daily content creation and posting (1 to 2 tweets or threads per day minimum), active community engagement (responses, retweets, quote tweets), and DM monitoring with professional responses to partnership inquiries.`,
      `Monthly Analytics Report: submitted by the 5th of the following month, including follower growth, impression metrics, engagement rate, link clicks and community sentiment analysis, highlighting top-performing content and giving recommendations for next month's content strategy.`,
      `Content Calendar (optional but recommended): a weekly content plan showing scheduled tweets so DAO members can preview upcoming announcements and collaborate on major ones.`,
    ],
    qualityBenchmarks: [
      `Follower growth of at least +10% per quarter.`,
      `Average engagement rate above 2% (likes + retweets + replies / impressions).`,
      `Response time under 24 hours to mentions and DMs during business hours.`,
      `Content consistency: a minimum of 25 tweets per month (approximately 1 per weekday).`,
      `Partnership engagement: at least 3 meaningful interactions with potential partners per month.`,
      `Content quality: zero typos or grammatical errors, all factual claims verifiable (link to source or block explorer), a professional tone maintained even when addressing criticism, and no engagement with obvious scams or malicious accounts.`,
    ],
  },

  "TASK-13": {
    problem: `Multiple community survey responses flagged that Redbelly's current documentation lacks linear, step-by-step guidance for complete beginners. Existing docs assume prior blockchain development knowledge and jump straight into advanced concepts. New builders need a highly structured curriculum that takes them from zero setup to their first deployed contract in a single, cohesive learning path, similar to how Solana has "Cookbook" or Ethereum has "CryptoZombies".`,
    technicalRequirements: [
      `Part 1 - Written interactive tutorial series: a linear curriculum of 5 progressive modules. Module 1 Environment Setup (installing Node.js and a package manager, setting up Hardhat or Foundry, configuring MetaMask for Redbelly Testnet Chain ID 153, acquiring testnet RBNT from the faucet, connecting to the RPC). Module 2 Your First Smart Contract (writing, compiling, deploying to testnet, verifying on the explorer, interacting via the Hardhat console). Module 3 Reading and Writing State (a storage contract, state vs memory, gas costs, event emission). Module 4 Access Control and Modifiers (Ownable, role-based access control, OpenZeppelin libraries, function modifiers, security best practices). Module 5 Real-World Integration (a simple ERC-20, EligibilitySDK KYC-gated token example, multi-contract systems, frontend integration basics, gas optimisation).`,
      `Each module must include learning objectives, step-by-step instructions, fully commented code examples, expected outputs, common errors and troubleshooting, and a quiz or checkpoint to verify understanding.`,
      `Part 2 - GitHub repository: 5 working code examples (one per module), each in its own folder with a complete Hardhat project structure, README, deployment script, test suite and .env.example template, plus a root README with the full curriculum overview.`,
      `Part 3 - Video walkthrough series: 3 to 5 HD screen-capture videos (10 to 20 minutes each, 1080p minimum, clear audio, legible on-screen code at 16pt minimum) that show the actual coding process, narrate the thought process, and display terminal output in real time.`,
    ],
    deliverables: [
      `Written Tutorial Series: 5 comprehensive modules in Markdown, published on GitHub (in the repository as docs/), optionally cross-posted to Dev.to or Medium for discoverability.`,
      `GitHub Repository: 5 working Hardhat projects (one per module), all code thoroughly commented, each project runnable without modifications (assuming RPC access), with a root README covering installation and curriculum overview.`,
      `Video Series: 3 to 5 videos uploaded to YouTube, organised in a playlist titled "Redbelly Network: Zero-to-Hero Developer Course", with descriptions linking the GitHub repo and written tutorials and chapter markers on the video timeline.`,
    ],
    qualityBenchmarks: [
      `A developer with zero prior Redbelly experience but basic JavaScript knowledge must be able to deploy a working smart contract to testnet in under 2 hours using this kit.`,
      `The technical reviewer follows the entire curriculum start-to-finish and verifies that all code examples compile without errors, all deployment scripts work on the current testnet, and all expected outputs match actual outputs.`,
      `Audio is clear with no background noise or distortion.`,
      `On-screen code is legible at 1080p.`,
      `No deprecated libraries or outdated syntax.`,
    ],
    failureCriteria: [
      `Code examples do not compile or deploy.`,
      `Videos have poor audio quality or illegible code.`,
      `Tutorial skips critical steps (e.g. how to get testnet RBNT).`,
      `Assumes knowledge not taught in earlier modules (breaks linear progression).`,
    ],
  },

  "TASK-14": {
    problem: `The EligibilitySDK is critical infrastructure for any application that needs to verify user eligibility on Redbelly, but it lacks a dedicated frontend integration guide. Developers are left guessing on backend verification flows, widget embedding patterns and error handling. This slows down adoption of Redbelly's core compliance tooling and means every developer independently rediscovers the same integration pitfalls.`,
    technicalRequirements: [
      `Write a comprehensive step-by-step guide covering the full EligibilitySDK implementation path.`,
      `Cover frontend widget embedding (IndividualOnboardingSDK and BusinessOnboardingSDK) and backend verification using hasChainPermission and getBusinessDetails.`,
      `Include end-to-end testing on Redbelly Testnet, with React and Next.js (App Router) code examples.`,
      `Cover integration patterns for combining the EligibilitySDK with both Onboarding SDKs, and a complete error-resolution section mapping every documented SDK error code to its cause and fix.`,
    ],
    deliverables: [
      `Step-by-Step Integration Guide: covers the full path from frontend widget embedding through backend verification to production deployment, with architecture diagrams showing data flow between frontend, backend and on-chain contracts.`,
      `React Code Examples: working examples demonstrating EligibilitySDK widget integration with the useHasChainPermission and useBusinessDetails hooks, including component code, state management, loading states and error handling.`,
      `Next.js (App Router) Code Examples: server-side verification patterns using the App Router, demonstrating both static and dynamic rendering approaches.`,
      `Integration Patterns Document: how to combine the EligibilitySDK with the IndividualOnboardingSDK (for retail users) and the BusinessOnboardingSDK (for institutional users), including a decision tree helping developers choose the right SDK combination for their use case.`,
      `Error Resolution Section: every documented SDK error code mapped to its cause, an example scenario, and a step-by-step fix, formatted for quick scanning (error code as heading, solution as body).`,
      `Published Guide: all materials formatted for publication on Dev.to or Medium, publicly accessible and searchable.`,
    ],
    qualityBenchmarks: [
      `A developer should be able to integrate the EligibilitySDK widget into an existing dApp within 4 hours following the guide.`,
      `The error-resolution section must cover every error code documented in the official SDK reference.`,
      `All code examples must compile and run without modification on current versions of React and Next.js.`,
      `The technical reviewer confirms the integration-patterns document correctly routes developers to the appropriate SDK for their use case.`,
    ],
  },

  "TASK-15": {
    problem: `The current website architecture is fragmented. Finding bridge support, developer documentation, or DAO governance details requires deep digging through multiple pages with inconsistent navigation patterns. This friction frustrates developers, confuses potential institutional partners conducting due diligence, and wastes the time of community members who should be building rather than searching.`,
    technicalRequirements: [
      `Redesign the entire site information architecture to establish clear, intuitive pathways for three primary audiences: Developers (documentation, SDKs, code examples, testnet resources, API references), DAO Members (governance, proposals, task board, voting, treasury transparency), and Institutional Users (case studies, compliance information, partnership details, Project Acacia credentials).`,
      `Create a navigation flowchart mapping every page on the current site to its new location.`,
      `Develop a cross-linking strategy explaining how related content across sections will be connected.`,
      `Build user journey maps for each primary audience showing the expected click path from homepage to target content.`,
    ],
    deliverables: [
      `Complete Figma Mockup: the redesigned site architecture showing all primary and secondary navigation paths, including desktop and mobile navigation patterns.`,
      `Navigation Flowchart: a visual map of every page on the current site and its proposed new location, clearly showing which pages are being merged, split, renamed or removed.`,
      `Cross-Linking Strategy Document: explains how related content across sections will be connected (for example, a developer-documentation page linking to the relevant SDK guide and the DAO task that produced it).`,
      `User Journey Maps: one map per primary audience (Developers, DAO Members, Institutional Users) showing the expected click path from homepage to their most common target content.`,
      `Before-and-After Comparison: an annotated comparison showing specific improvements to findability for the 10 most visited content types on the current site.`,
    ],
    qualityBenchmarks: [
      `A user should be able to find bridge support, DAO governance information, or developer documentation in fewer than 2 clicks from the homepage.`,
      `A usability reviewer must confirm the proposed architecture eliminates the fragmentation problems identified in the current site.`,
      `The navigation flowchart must account for every existing page (no orphaned content).`,
      `The cross-linking strategy must identify at least 20 connection points between sections.`,
      `Mobile navigation must be tested and documented separately from desktop.`,
    ],
    failureCriteria: [
      `Proposed architecture introduces new dead ends or orphaned pages.`,
      `Navigation flowchart is incomplete (missing pages from the current site).`,
      `No mobile navigation consideration.`,
      `Cross-linking strategy is generic rather than identifying specific page-to-page connections.`,
    ],
  },
};

async function main() {
  const keyPath = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!keyPath) {
    console.error("Usage: node scripts/expand-tasks.js path/to/serviceAccountKey.json [--apply]");
    process.exit(1);
  }

  const serviceAccount = require(path.resolve(keyPath));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — enriching ${Object.keys(EXPANSIONS).length} tasks (fields: problem, technicalRequirements, deliverables, qualityBenchmarks, failureCriteria where provided)\n`);

  let missing = 0;
  for (const [id, fields] of Object.entries(EXPANSIONS)) {
    const ref = db.collection("tasks").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ! ${id} NOT FOUND in Firestore — skipping`);
      missing++;
      continue;
    }
    const cur = snap.data();
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) {
        const curLen = Array.isArray(cur[k]) ? cur[k].length : 0;
        parts.push(`${k} ${curLen}→${v.length} items`);
      } else {
        const curLen = (cur[k] || "").length;
        parts.push(`${k} ${curLen}→${v.length} chars`);
      }
    }
    console.log(`  ${id}: ${parts.join(", ")}`);
    if (apply) {
      await ref.set(fields, { merge: true });
    }
  }

  console.log(
    apply
      ? `\n✓ Applied to Firestore. ${missing ? `(${missing} not found)` : ""}`
      : `\nDry run only — no writes. Re-run with --apply to write. ${missing ? `(${missing} not found)` : ""}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
