// Personal Finance > Monthly budget: the expense accounts (where the money for expenses sits, matched with the bank each month) and
// the monthly amount planned per main expense category, with what is left over or overspent carried into the next month.
// Their own money only. One month at a time: the arrows above change both parts together.
import { useState } from "react";
import { AccountsPanel } from "./budget/AccountsPanel";
import { CategoryBudgets } from "./budget/CategoryBudgets";
import { MonthSwitch } from "./budget/MonthSwitch";
import { keyOf } from "./budget/format";

export function BudgetSection() {
  const [month, setMonth] = useState(keyOf(new Date()));

  return (
    <div data-testid="budget-section" className="mx-auto max-w-6xl space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-foreground">Monthly budget</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan what each category may cost, and keep the accounts you pay expenses from in step with the bank.
          </p>
        </div>
        <MonthSwitch month={month} onChange={setMonth} />
      </header>
      <AccountsPanel month={month} />
      <CategoryBudgets month={month} />
    </div>
  );
}
