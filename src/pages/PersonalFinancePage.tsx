// Personal Finance: the logged-in person's OWN money, kept apart from the office books and never shown to another login.
// Sections: Dashboard (opens first), Expenses (same categories as the office expenses), Monthly budget, Savings, Friendly Lends (with what I owe beside it),
// Gifts Received, Investments.
// A new section: add it to PERSONAL_SECTIONS in navConfig and render it here.
import { useSectionParam } from "@/hooks/useSectionParam";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { PERSONAL_SECTIONS } from "@/components/layout/navConfig";
import { ExpensesSection } from "@/pages/ExpensesPage";
import { PersonalDashboard } from "@/components/dashboard/PersonalDashboard";
import { BudgetSection } from "@/components/personal/BudgetSection";
import { BorrowsSection, GiftsSection, InvestmentsSection, LendsSection, SavingsSection } from "@/components/personal/PersonalRecordSections";

export default function PersonalFinancePage() {
  const [section] = useSectionParam(PERSONAL_SECTIONS);
  const isMobile = useIsMobile();
  return (
    <div data-testid="personal-finance" data-section={section}>
      {section === "dashboard" && (
        <div className="space-y-4">
          <div>
            <h1 className="text-foreground font-medium tracking-tight leading-tight" style={{ fontSize: 20 }}>Personal finance</h1>
            <div className="text-muted-foreground mt-0.5" style={{ fontSize: 11.5 }}>What you hold, owe and spend - your own money, kept apart from the office</div>
          </div>
          <PersonalDashboard />
        </div>
      )}
      {section === "expenses" && <ExpensesSection scope="personal" isMobile={isMobile} />}
      {section === "budget" && <BudgetSection />}
      {section === "savings" && <SavingsSection isMobile={isMobile} />}
      {section === "lends" && (
        <div data-testid="lends-and-borrows" className="grid items-start gap-6 lg:grid-cols-2">
          <LendsSection isMobile={isMobile} />
          <BorrowsSection isMobile={isMobile} />
        </div>
      )}
      {section === "gifts" && <GiftsSection isMobile={isMobile} />}
      {section === "investments" && <InvestmentsSection isMobile={isMobile} />}
    </div>
  );
}
