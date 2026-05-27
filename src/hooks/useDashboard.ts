import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/services/api";
import type {
  DashboardSummary, DailyActivity, LoanSummary,
  IopRemindersResponse, IopCalendarDay,
  EdiInactiveCustomer, EdiDefaulter, IopMonthlyDue,
} from "@/types";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => (await dashboardApi.summary()).data as DashboardSummary,
  });
}

export function useDailyActivity(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "daily-activity", days],
    queryFn: async () => (await dashboardApi.dailyActivity(days)).data as DailyActivity[],
  });
}

export function useLoanSummary() {
  return useQuery({
    queryKey: ["dashboard", "loan-summary"],
    queryFn: async () => (await dashboardApi.loanSummary()).data as LoanSummary,
  });
}

export function useIopReminders() {
  return useQuery({
    queryKey: ["dashboard", "iop-reminders"],
    queryFn: async () => (await dashboardApi.iopReminders()).data as IopRemindersResponse,
  });
}

export function useIopCalendar(year: number, month: number) {
  return useQuery({
    queryKey: ["dashboard", "iop-calendar", year, month],
    queryFn: async () => (await dashboardApi.iopCalendar(year, month)).data as IopCalendarDay[],
  });
}

export function useEdiInactive() {
  return useQuery({
    queryKey: ["dashboard", "edi-inactive"],
    queryFn: async () => (await dashboardApi.ediInactive()).data as EdiInactiveCustomer[],
  });
}

export function useEdiDefaulters() {
  return useQuery({
    queryKey: ["dashboard", "edi-defaulters"],
    queryFn: async () => (await dashboardApi.ediDefaulters()).data as EdiDefaulter[],
  });
}

export function useIopMonthlyDues() {
  return useQuery({
    queryKey: ["dashboard", "iop-monthly-dues"],
    queryFn: async () => (await dashboardApi.iopMonthlyDues()).data as IopMonthlyDue[],
  });
}
