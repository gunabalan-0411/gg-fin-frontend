import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/services/api";
import type { DashboardSummary, DailyActivity } from "@/types";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const res = await dashboardApi.summary();
      return res.data as DashboardSummary;
    },
  });
}

export function useDailyActivity(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "daily-activity", days],
    queryFn: async () => {
      const res = await dashboardApi.dailyActivity(days);
      return res.data as DailyActivity[];
    },
  });
}
