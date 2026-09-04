import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo } from "react";
import { Text, View } from "react-native";

import { EmptyState } from "@/components/ui/EmptyState";
import { formatAge } from "@/lib/format/relativeTime";
import type { PublicReport } from "@/lib/supabase/database.types";

import { ReportCard } from "../reports/ReportCard";

export type SheetItem = { report: PublicReport; distanceM: number | null };

type Props = {
  items: SheetItem[];
  selectedId: string | null;
  loading: boolean;
  offline: boolean;
  lastUpdatedAt: number | null;
  onSelect: (id: string) => void;
};

const SNAP_POINTS = ["16%", "45%", "85%"];

export const NearbyReportsSheet = forwardRef<BottomSheet, Props>(function NearbyReportsSheet(
  { items, selectedId, loading, offline, lastUpdatedAt, onSelect },
  ref,
) {
  const active = items.filter((i) => i.report.effective_status !== "stale");
  const onlyStale = items.length > 0 && active.length === 0;
  const newest = useMemo(
    () => items.reduce<string | null>((acc, i) => (!acc || i.report.last_confirmed_at > acc ? i.report.last_confirmed_at : acc), null),
    [items],
  );

  const header = (
    <View className="px-4 pb-2">
      <Text className="text-lg font-bold text-ink">
        {loading && items.length === 0
          ? "Looking for reports…"
          : items.length === 0
            ? "No flood reports here"
            : onlyStale
              ? "No recent reports"
              : `${active.length} active report${active.length === 1 ? "" : "s"} in view`}
      </Text>
      <Text className="text-sm text-ink-secondary">
        {offline && lastUpdatedAt
          ? `Offline · showing data from ${formatAge(new Date(lastUpdatedAt).toISOString())}`
          : onlyStale && newest
            ? `Last activity ${formatAge(newest)}. Older reports may have receded.`
            : items.length === 0
              ? "That does not guarantee roads are clear."
              : "Sorted by distance. Tap a report for details."}
      </Text>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: SheetItem }) => (
      <View className="px-4 pb-3">
        <ReportCard
          report={item.report}
          distanceM={item.distanceM}
          selected={item.report.id === selectedId}
          onPress={() => onSelect(item.report.id)}
        />
      </View>
    ),
    [selectedId, onSelect],
  );

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: "#F7F9FB", borderRadius: 20 }}
      handleIndicatorStyle={{ backgroundColor: "#CBD5E1", width: 44 }}
    >
      <BottomSheetFlatList
        data={items}
        keyExtractor={(i: SheetItem) => i.report.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="water-outline"
              title="No flood reports in this area"
              body="Nobody has reported flooding within the last 24 hours here. Zoom out or pan to check nearby streets."
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </BottomSheet>
  );
});
