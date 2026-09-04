import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { SEVERITY_META } from "@/constants/severity";
import { colors } from "@/constants/theme";
import { sqliteOutbox } from "@/features/offline/outbox";
import { usePendingReports } from "@/features/offline/usePendingReports";
import { ReportCard } from "@/features/reports/ReportCard";
import { formatAge } from "@/lib/format/relativeTime";

import { OutboxItemCard } from "./OutboxItemCard";
import { useMyReports, useMyVerifications } from "./useMyActivity";

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{children}</Text>;
}

export function ActivityList() {
  const pending = usePendingReports();
  const reports = useMyReports();
  const verifications = useMyVerifications();
  const [photoUris, setPhotoUris] = useState<Record<string, string | null>>({});

  // Outbox rows carry the stashed photo path; the pending hook strips it, so look it up here.
  useEffect(() => {
    let alive = true;
    sqliteOutbox.listAll().then((rows) => {
      if (!alive) return;
      setPhotoUris(Object.fromEntries(rows.map((r) => [r.clientId, r.photoUri])));
    });
    return () => {
      alive = false;
    };
  }, [pending]);

  const nothing =
    pending.length === 0 && (reports.data?.length ?? 0) === 0 && (verifications.data?.length ?? 0) === 0;

  return (
    <View className="gap-6">
      {pending.length > 0 ? (
        <View>
          <SectionTitle>Not sent yet</SectionTitle>
          <View className="gap-2">
            {pending.map((p) => (
              <OutboxItemCard key={p.clientId} item={p} photoUri={photoUris[p.clientId] ?? null} />
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <SectionTitle>My reports</SectionTitle>
        {reports.isPending ? (
          <Text className="text-sm text-ink-secondary">Loading…</Text>
        ) : reports.data && reports.data.length > 0 ? (
          <View className="gap-2">
            {reports.data.map((r) => (
              <Link key={r.id} href={{ pathname: "/report/[id]", params: { id: r.id } }} asChild>
                <Pressable accessibilityRole="button">
                  <ReportCard report={r} />
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-ink-secondary">
            {reports.isError ? "Couldn't load your reports." : "You haven't reported flooding yet."}
          </Text>
        )}
      </View>

      <View>
        <SectionTitle>My verifications</SectionTitle>
        {verifications.data && verifications.data.length > 0 ? (
          <View className="gap-2">
            {verifications.data.map((v) => {
              const meta = v.report ? SEVERITY_META[v.report.severity] : null;
              return (
                <Link key={v.id} href={{ pathname: "/report/[id]", params: { id: v.report_id } }} asChild>
                  <Pressable accessibilityRole="button" className="flex-row items-center gap-3 rounded-card bg-surface-raised p-3">
                    <Pill
                      label={v.kind === "confirm" ? "Still flooded" : "Cleared"}
                      color={v.kind === "confirm" ? colors.severity.dangerous : colors.confidence.high}
                    />
                    <View className="flex-1">
                      <Text className="text-sm text-ink">
                        {meta ? `${meta.label} report` : "Report"} · {formatAge(v.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        ) : (
          <Text className="text-sm text-ink-secondary">
            {verifications.isError ? "Couldn't load your verifications." : "No verifications yet."}
          </Text>
        )}
      </View>

      {nothing && !reports.isPending ? (
        <EmptyState
          icon="water-outline"
          title="Nothing here yet"
          body="Reports you send and verifications you make will show up here."
        />
      ) : null}
    </View>
  );
}
