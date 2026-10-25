// Personal Finance: the logged-in person's OWN money, kept apart from the office books and never shown to another login.
// Sections: Expenses (same categories as the office expenses), Savings, Friendly Lends, Gifts Received. Investments can be added later
// as another section: add it to PERSONAL_SECTIONS in navConfig and render it here.
import { useSectionParam } from "@/hooks/useSectionParam";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { PERSONAL_SECTIONS } from "@/components/layout/navConfig";
import { ExpensesSection } from "@/pages/ExpensesPage";
import { GiftsSection, LendsSection, SavingsSection } from "@/components/personal/PersonalRecordSections";

export default function PersonalFinancePage() {
  const [section] = useSectionParam(PERSONAL_SECTIONS);
  const isMobile = useIsMobile();
  return (
    <div data-testid="personal-finance" data-section={section}>
      {section === "expenses" && <ExpensesSection scope="personal" isMobile={isMobile} />}
      {section === "savings" && <SavingsSection isMobile={isMobile} />}
      {section === "lends" && <LendsSection isMobile={isMobile} />}
      {section === "gifts" && <GiftsSection isMobile={isMobile} />}
    </div>
  );
}
