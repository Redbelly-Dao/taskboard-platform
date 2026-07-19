"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { RIGHTS_VERSION } from "@/lib/rights";

const RULEBOOK_VERSION = "Cycle 2 · v1";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="mono text-primary text-sm font-bold">{n}</span>
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-on-surface leading-relaxed [&_b]:text-on-surface [&_ul]:mt-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2"><span className="text-primary shrink-0">·</span><span>{children}</span></li>
);

export default function RulesPage() {
  const { user } = useAuth();
  const body = (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-on-surface">Task Board Rulebook</h1>
        <p className="mono text-xs text-outline mt-1 uppercase tracking-widest">{RULEBOOK_VERSION}</p>
        <p className="text-sm text-outline mt-3 max-w-2xl leading-relaxed">
          How the board runs for every role. Rules are versioned. A change made mid-cycle never applies backwards to
          work already submitted.
        </p>
      </div>

      <div className="space-y-4">
        <Section n="01" title="One reviewer per task">
          <p>A single reviewer owns every submission on a task, from open to winner. A fair review needs comparison, and comparison only works when one person sees all of it.</p>
          <ul>
            <Bullet>Every submission gets a first decision within <b>3 days</b>, and a re-review within 2 days of a resubmission.</Bullet>
            <Bullet>Reviewer compensation is a flat <b>20% of the task reward</b>, paid whether or not a submission wins.</Bullet>
          </ul>
        </Section>

        <Section n="02" title="One winner per task">
          <p>Each task has a limited number of submission slots and pays a single winner: the highest-scoring submission on the rubric. The board is a competition. Strong work can lose to stronger work, and only the winning submission is paid.</p>
        </Section>

        <Section n="03" title="Status vocabulary">
          <ul>
            <Bullet><b>Shortlisted</b>: cleared the bar, in contention.</Bullet>
            <Bullet><b>Selected</b>: won the task, paid.</Bullet>
            <Bullet><b>Not selected</b>: cleared the bar, another submission won.</Bullet>
            <Bullet><b>Revision requested</b>: fixable, come back to it.</Bullet>
            <Bullet><b>Rejected</b>: fell below the bar.</Bullet>
          </ul>
          <p>A shortlisted submission that is not selected is refunded to your cycle cap. Good work should not cost you a slot.</p>
        </Section>

        <Section n="04" title="The rubric">
          <p>Every submission is scored 1-5 on 7 criteria, out of 35 total. You see the full rubric on each task before you submit, and your own scores after a decision.</p>
        </Section>

        <Section n="05" title="Revisions">
          <p>Every genuine submission is guaranteed at least one revision before it can be rejected. Plagiarism, empty, or off-scope submissions are the exception and are rejected outright. Once a submission is rejected, that contributor is finished on that task.</p>
        </Section>

        <Section n="06" title="Limits">
          <ul>
            <Bullet>Per cycle, across all tasks: contributors get <b>4</b> submissions, reviewers get <b>2</b>, admins get none.</Bullet>
            <Bullet>Each task accepts a maximum of <b>5</b> submissions across all contributors.</Bullet>
            <Bullet>Reviewers may take on tasks, but the moment a reviewer submits to a task they lose all review access to it.</Bullet>
          </ul>
        </Section>

        <Section n="07" title="The calendar">
          <p>A cycle runs 30 days. New submissions close before the cycle ends so there is time to review, and a countdown on your dashboard shows exactly when. Late submissions are not accepted; resubmissions to an already-open revision still are.</p>
        </Section>

        <Section n="08" title="Rights and credit">
          <p>When you submit, you sign a short rights agreement with your wallet, along with the name you want credited (agreement version <span className="mono">{RIGHTS_VERSION}</span>). If your submission is selected and you are paid, you assign the rights in that work to Redbelly Network Pty Ltd, with your consent to moral-rights use. If you are not selected, no rights transfer and you keep your work. Payment is what transfers rights. Final terms are in the participation T&amp;Cs.</p>
        </Section>

        <Section n="09" title="Appeals">
          <p>You can appeal a rejection or a winner selection within 7 days, citing the rubric criterion you believe was scored wrongly. Appeals go to admin and any overturn is co-signed by a High Council member.</p>
        </Section>
      </div>

      <p className="text-xs text-outline mt-6">
        Questions? Reach out in the{" "}
        <a href="https://discord.com/channels/969088176322908160/1471738127860236424" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">#DAO TASKBOARD</a> channel.
      </p>
    </>
  );

  // Signed-in users get the app nav; signed-out visitors get a minimal header so the rulebook is publicly readable.
  if (user) return <AppShell width="narrow">{body}</AppShell>;
  return (
    <div className="min-h-screen bg-background-deep">
      <header className="page-header sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5"><Logo /><span className="text-outline text-sm font-medium">Task Board</span></div>
          <div className="flex items-center gap-2"><ThemeToggle /><Link href="/login" className="btn-secondary text-xs">Sign in</Link></div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">{body}</div>
    </div>
  );
}
