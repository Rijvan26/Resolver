import React, { useState } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  useGetOverviewQuery,
  useGetIncidentsByStatusQuery,
  useGetIncidentsByPriorityQuery,
  useGetIncidentTrendsQuery,
  useGetTeamWorkloadQuery,
  useGetRecentActivityQuery,
} from "@/features/dashboard/dashboardApi";
import { DateRangeState } from "@/features/dashboard/dashboardUtils";
import { DashboardDateFilter } from "@/features/dashboard/components/DashboardDateFilter";
import { OverviewKpiCards } from "@/features/dashboard/components/OverviewKpiCards";
import { IncidentTrendsChart } from "@/features/dashboard/components/IncidentTrendsChart";
import { StatusDistributionChart } from "@/features/dashboard/components/StatusDistributionChart";
import { PriorityDistributionChart } from "@/features/dashboard/components/PriorityDistributionChart";
import { TeamWorkloadWidget } from "@/features/dashboard/components/TeamWorkloadWidget";
import { RecentActivityWidget } from "@/features/dashboard/components/RecentActivityWidget";
import { Alert } from "@/components/ui/alert";
import { LayoutDashboard } from "lucide-react";

export const DashboardPage: React.FC = () => {
  const { organization } = useAppSelector((state) => state.auth);

  // Date range filter state (defaults to "All Time" to let backend serve complete dataset)
  const [dateRange, setDateRange] = useState<DateRangeState>(() => {
    return { preset: "all", startDate: undefined, endDate: undefined };
  });

  // Recent activity pagination
  const [activityPage, setActivityPage] = useState(1);

  // Refresh tracking
  const [isRefreshing, setIsRefreshing] = useState(false);

  // RTK Query hooks
  const queryParams = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const {
    data: overviewData,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useGetOverviewQuery(queryParams);

  const {
    data: statusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
    refetch: refetchStatus,
  } = useGetIncidentsByStatusQuery(queryParams);

  const {
    data: priorityData,
    isLoading: isPriorityLoading,
    isError: isPriorityError,
    refetch: refetchPriority,
  } = useGetIncidentsByPriorityQuery(queryParams);

  const {
    data: trendsData,
    isLoading: isTrendsLoading,
    isError: isTrendsError,
    refetch: refetchTrends,
  } = useGetIncidentTrendsQuery(queryParams);

  const {
    data: workloadData,
    isLoading: isWorkloadLoading,
    isError: isWorkloadError,
    refetch: refetchWorkload,
  } = useGetTeamWorkloadQuery();

  const {
    data: activityData,
    isLoading: isActivityLoading,
    isError: isActivityError,
    refetch: refetchActivity,
  } = useGetRecentActivityQuery({ page: activityPage, limit: 8 });

  // Coordinated refetch across all dashboard queries
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        refetchOverview(),
        refetchStatus(),
        refetchPriority(),
        refetchTrends(),
        refetchWorkload(),
        refetchActivity(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Has active date filtering
  const hasDateFilter = Boolean(dateRange.startDate && dateRange.endDate);

  // Dashboard-level critical error detection (when all core metrics fail)
  const isCriticalDashboardFailure =
    isOverviewError && isStatusError && isPriorityError && isTrendsError;

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header section */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs dark:bg-brand-500">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Incident Operations
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Real-time incident tracking, team workloads, and analytics for{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {organization?.name || "Your Organization"}
            </span>
          </p>
        </div>

        {/* Date Filter & Refresh Toolbar */}
        <DashboardDateFilter
          value={dateRange}
          onChange={(newRange) => {
            setDateRange(newRange);
            setActivityPage(1); // Reset activity page when range changes
          }}
          onRefresh={handleRefreshAll}
          isRefreshing={isRefreshing}
        />
      </div>

      {/* Critical error banner if backend connectivity fails */}
      {isCriticalDashboardFailure && (
        <Alert
          variant="error"
          title="Dashboard Connection Issue"
          className="shadow-sm"
        >
          Unable to establish a reliable connection with the Resolver analytics service.
          Please verify your connection and try refreshing.
        </Alert>
      )}

      {/* Section 1: KPI Summary Metrics */}
      <section aria-label="Incident KPI Summary">
        <OverviewKpiCards
          data={overviewData?.data}
          isLoading={isOverviewLoading}
          isError={isOverviewError}
          onRetry={refetchOverview}
          hasDateFilter={hasDateFilter}
        />
      </section>

      {/* Section 2: Trends Chart (Full width) */}
      <section aria-label="Incident Velocity Trends">
        <IncidentTrendsChart
          trends={trendsData?.data?.trends}
          startDate={trendsData?.data?.startDate}
          endDate={trendsData?.data?.endDate}
          isLoading={isTrendsLoading}
          isError={isTrendsError}
          onRetry={refetchTrends}
        />
      </section>

      {/* Section 3: Distribution Breakdown (Status & Priority side by side) */}
      <section
        aria-label="Incident Distributions"
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        <StatusDistributionChart
          data={statusData?.data}
          isLoading={isStatusLoading}
          isError={isStatusError}
          onRetry={refetchStatus}
        />

        <PriorityDistributionChart
          data={priorityData?.data}
          isLoading={isPriorityLoading}
          isError={isPriorityError}
          onRetry={refetchPriority}
        />
      </section>

      {/* Section 4: Operational Breakdown (Team Workload & Activity Feed) */}
      <section
        aria-label="Operations and Activity"
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        <TeamWorkloadWidget
          data={workloadData?.data}
          isLoading={isWorkloadLoading}
          isError={isWorkloadError}
          onRetry={refetchWorkload}
        />

        <RecentActivityWidget
          data={activityData?.data}
          isLoading={isActivityLoading}
          isError={isActivityError}
          onRetry={refetchActivity}
          page={activityPage}
          onPageChange={setActivityPage}
        />
      </section>
    </div>
  );
};

export default DashboardPage;
