"use client";
// Participation T&Cs. Public, no login, same shape as the rulebook so the two read as one document set.
//
// Approved by Redbelly (Alison Lewis, 15 and 21 Jul 2026), with the 21 Jul decisions applied: moral rights
// consent scoped to the contributor's own jurisdiction (cl 5.1), and both a wallet signature and a
// click-accept at registration (cl 8.2).
//
// Clause 4.4 RETAINS non-selected work rather than deleting it. That is Njay's call (30 Jul) and it reverses
// the review's recommendation, so cl 4.5 is not optional: holding near-identical non-selected submissions
// under a no-use promise is the exposure the review flagged, and 4.5 is what closes it.
//
// Clause 11 follows ACL practice: s64 rights are preserved first and everything else is expressed as
// subject to it, then the s64A resupply limit, then excluded loss and a cap. Order matters. A limitation
// that reads as excluding non-excludable guarantees is void, so 11.1 comes before anything it qualifies.
// Drafted to standard form, still worth counsel's read.
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import { RIGHTS_VERSION, RIGHTS_ASSIGNEE, RIGHTS_ASSIGNEE_ABN } from "@/lib/rights";

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="mono text-primary text-sm font-bold">{n}</span>
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-on-surface leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  const { user } = useAuth();
  const body = (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Participation Terms and Conditions</h1>
        <p className="mono text-xs text-outline mt-1 uppercase tracking-widest">Version {RIGHTS_VERSION}</p>
        <p className="text-sm text-outline mt-3 max-w-2xl leading-relaxed">
          Assignee and IP owner: {RIGHTS_ASSIGNEE} (ABN {RIGHTS_ASSIGNEE_ABN}) (&quot;Redbelly&quot;). By registering for
          or submitting work to the Redbelly DAO Community Task Board (the &quot;Task Board&quot;), you
          (&quot;Contributor&quot;, &quot;you&quot;) agree to these Terms.
        </p>
      </div>

      <div className="space-y-4">
        <Clause n="01" title="Eligibility">
          <p>1.1 You must complete Redbelly Network KYC at <a href="https://access.redbelly.network/" target="_blank" rel="noopener noreferrer" className="mono text-primary hover:underline">access.redbelly.network</a> before any reward is disbursed.</p>
          <p>1.2 You participate as an independent contributor. Nothing here creates employment, partnership, agency or a joint venture.</p>
          <p>1.3 You must be legally capable of assigning intellectual property rights in your jurisdiction. If you contribute on behalf of an entity, you warrant that you are authorised to bind it and to assign on its behalf.</p>
        </Clause>

        <Clause n="02" title="How the Task Board works">
          <p>2.1 Tasks are published with a specification, a reward, and a submission cap.</p>
          <p>2.2 The board is a competition: multiple contributors may submit to a task, each submission is scored against a published rubric, and only the single highest-scoring submission on a completed task is selected and paid.</p>
          <p>2.3 Submitting does not guarantee selection or payment. Cycle limits, task caps, review deadlines, revisions and appeals are described in the <Link href="/rules" className="text-primary hover:underline">Task Board Rulebook</Link>, which forms part of these Terms.</p>
        </Clause>

        <Clause n="03" title="Your warranties">
          <p>When you submit, you represent and warrant that:</p>
          <p>3.1 the submission is your own original work;</p>
          <p>3.2 it does not infringe the intellectual property, confidentiality, privacy or other rights of any third party;</p>
          <p>3.3 it contains no undisclosed third party or AI generated material presented as your own, and no malicious code;</p>
          <p>3.4 you have the right to assign it to Redbelly as set out below; and</p>
          <p>3.5 it is a good faith attempt at the task.</p>
        </Clause>

        <Clause n="04" title="Assignment of intellectual property">
          <p>4.1 Conditional on payment for a selected submission, you assign to Redbelly, absolutely and throughout the world, all right, title and interest (including all intellectual property rights) in and to that submission and all materials comprising it, for the full term of those rights and any renewals.</p>
          <p>4.2 The assignment takes effect automatically upon payment of the reward for that submission. Until payment, no rights transfer.</p>
          <p>4.3 Non-selected submissions: no rights transfer and no licence is granted. You retain all rights in a submission that is not selected, and neither Redbelly nor the DAO will use, publish, distribute or commercially exploit it.</p>
          <p>4.4 Retention. A non-selected submission is retained on the Task Board record for administration, audit, appeals and dispute resolution, and to evidence what was submitted and when. Access is limited to Task Board administrators. It is not published and it is not shared outside that purpose. You may request deletion of a non-selected submission at any time and it will be deleted, unless an appeal, dispute or investigation involving it is open, in which case it is deleted once that closes.</p>
          <p>4.5 Independent and similar work. Because the Task Board is a competition, multiple contributors work on the same specification and similar or overlapping submissions are expected. Redbelly using or publishing a selected submission does not breach clause 4.3 merely because a non-selected submission resembles it, addresses the same brief, or reaches a similar result. Clause 4.3 protects the specific expression of your submission. It does not give any contributor rights over the ideas, concepts, methods, facts, specifications or requirements of a task, or over material independently created.</p>
          <p>4.6 You agree to do all things and sign all documents Redbelly reasonably requires to give full effect to, perfect or register this assignment.</p>
          <p>4.7 To the extent any right cannot be assigned, you grant Redbelly an exclusive, perpetual, irrevocable, worldwide, royalty-free, sublicensable licence to it, conditional on payment as above.</p>
        </Clause>

        <Clause n="05" title="Moral rights">
          <p>5.1 To the extent permitted by the law of the jurisdiction in which you are resident, you consent to Redbelly and its licensees and successors doing (or omitting to do) any act that would otherwise infringe your moral rights in a selected and paid submission, including using, reproducing, adapting, editing, adding to, combining and publishing it, with or without attribution and in any media.</p>
          <p>5.2 This consent is given genuinely and without duress and extends to acts done before and after the assignment takes effect.</p>
          <p>5.3 Where the law of your jurisdiction does not permit consent to acts affecting moral rights, or permits it only in a limited form, this clause applies only to the extent that law allows, and your moral rights are otherwise unaffected. Consent is not required as a condition of payment beyond what your own law permits.</p>
        </Clause>

        <Clause n="06" title="Credit and brand">
          <p>6.1 You will be credited under the display name you provide at submission.</p>
          <p>6.2 Credit is limited to an end card, description, or contributors file. The DAO&apos;s brand, not the contributor&apos;s, is the centrepiece of any published version. No personal logos, watermarks or promotion may be embedded in the deliverable itself.</p>
        </Clause>

        <Clause n="07" title="Payment">
          <p>7.1 Rewards are paid in RBNT (with any USDT portion as stated on the task) at market price on the day of disbursement, via the DAO High Council multisig.</p>
          <p>7.2 Reviewer compensation, where applicable, is a separate item and does not affect a contributor&apos;s reward.</p>
          <p>7.3 Payment is the consideration for the assignment in clause 4.</p>
        </Clause>

        <Clause n="08" title="Signature and record">
          <p>8.1 At submission you sign a message with your registered wallet capturing the agreement version, the task ID, your chosen credit name, your wallet address and a timestamp. That signature is recorded against your submission as evidence of agreement to these Terms.</p>
          <p>8.2 A wallet signature is an electronic signature and you agree it binds you to these Terms. You also accept these Terms in full at registration.</p>
        </Clause>

        <Clause n="09" title="Data">
          <p>9.1 The public transparency ledger contains no contributor identities. Your wallet, contact handle and identity are handled by the DAO and Redbelly for administration and payment only, consistent with the Redbelly privacy policy at <a href="https://redbelly.network/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">redbelly.network/privacy-policy</a>.</p>
          <p>9.2 Submissions, including non-selected submissions, are retained as described in clause 4.4. You may request deletion of a non-selected submission at any time on the terms in that clause.</p>
        </Clause>

        <Clause n="10" title="Conduct, suspension, appeals">
          <p>10.1 Plagiarism, misrepresentation, or breach of these Terms may result in rejection, suspension, or removal from the board.</p>
          <p>10.2 Rejections and selection decisions may be appealed as set out in the <Link href="/rules" className="text-primary hover:underline">Rulebook</Link>.</p>
        </Clause>

        <Clause n="11" title="Disclaimers and liability">
          <p><b>11.1 Your rights that cannot be excluded.</b> Nothing in these Terms excludes, restricts or modifies any guarantee, right, warranty or remedy you have under the Australian Consumer Law (Schedule 2 to the <i>Competition and Consumer Act 2010</i> (Cth)) or under any other law, to the extent that it cannot lawfully be excluded, restricted or modified. Where any provision of these Terms would have that effect, it is read down only so far as is necessary to give effect to this clause, and the rest of these Terms continues to apply.</p>
          <p><b>11.2 The Task Board as provided.</b> Subject to clause 11.1, the Task Board and any related tools, pages and integrations are provided &quot;as is&quot; and &quot;as available&quot;. Redbelly does not warrant that the Task Board will be uninterrupted, error-free, secure, or that submissions, scores, records or reward calculations will be free from mistake. Redbelly does not warrant the availability, accuracy or performance of any third-party service the Task Board depends on, including wallet providers, blockchain networks, hosting, storage and file uploads.</p>
          <p><b>11.3 Limitation for consumer guarantees.</b> Where liability arises for a failure to comply with a consumer guarantee under the Australian Consumer Law in respect of services not of a kind ordinarily acquired for personal, domestic or household use or consumption, Redbelly&apos;s liability for that failure is limited, at Redbelly&apos;s election and to the extent permitted by section 64A of the Australian Consumer Law, to supplying the services again or paying the cost of having the services supplied again.</p>
          <p><b>11.4 Excluded loss.</b> Subject to clauses 11.1 and 11.3, and to the extent permitted by law, Redbelly is not liable to you for any indirect or consequential loss, or for any loss of profit, revenue, anticipated saving, opportunity, goodwill, reputation or data, however arising and whether in contract, tort (including negligence), under statute or otherwise, even if the possibility of that loss was known.</p>
          <p><b>11.5 Digital assets.</b> Subject to clauses 11.1 and 11.3, Redbelly is not liable for any loss arising from the price, volatility, liquidity, tax treatment or regulatory treatment of RBNT or any other digital asset, from a network, bridge or protocol failure, from gas or transaction fees, or from your loss of, or loss of access to, a wallet, private key or recovery phrase. Rewards are paid to the wallet registered to your account and a transfer made to that wallet discharges the obligation.</p>
          <p><b>11.6 Cap.</b> Subject to clauses 11.1 and 11.3, and to the extent permitted by law, Redbelly&apos;s total aggregate liability to you arising out of or in connection with these Terms and your participation is limited to the greater of (a) the total rewards paid or payable to you for the cycle in which the liability arose, and (b) AUD 100.</p>
          <p><b>11.7 Your acts.</b> Redbelly&apos;s liability is reduced to the extent that your act or omission, or your breach of these Terms, caused or contributed to the loss.</p>
          <p><b>11.8 No guarantee of selection.</b> For the avoidance of doubt, and subject to clause 11.1, nothing in these Terms entitles you to be selected or paid for a submission. Selection is made under the Rulebook and the published rubric, and the appeal process in the Rulebook is the route for challenging a decision.</p>
        </Clause>

        <Clause n="12" title="General">
          <p>12.1 Governing law: New South Wales, Australia, and the parties submit to the courts of that jurisdiction.</p>
          <p>12.2 These Terms, together with the Rulebook, are the entire agreement on their subject matter. Redbelly may update them between cycles. Changes are versioned and do not apply retrospectively to work already submitted.</p>
          <p>12.3 If any provision is unenforceable, the rest continues in force.</p>
        </Clause>
      </div>

      <p className="text-xs text-outline mt-6">
        Questions about these Terms? Reach out in the{" "}
        <a href="https://discord.gg/YMpArA2Y8j" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#DAO TASKBOARD</a> channel.
      </p>
    </>
  );

  if (user) return <AppShell width="narrow">{body}</AppShell>;
  return (
    <div className="min-h-screen bg-background-deep flex flex-col">
      <header className="page-header sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5"><Logo /><span className="text-outline text-sm font-medium">Task Board</span></div>
          <div className="flex items-center gap-2"><ThemeToggle /><Link href="/login" className="btn-secondary text-xs">Sign in</Link></div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">{body}</div>
      <SiteFooter />
    </div>
  );
}
