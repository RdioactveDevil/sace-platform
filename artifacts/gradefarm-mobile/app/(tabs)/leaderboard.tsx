import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/db";
import { getLevelProgress, RANKS } from "@/lib/engine";

function PodiumItem({
  entry,
  position,
  isMe,
  colors,
}: {
  entry: LeaderboardEntry;
  position: 1 | 2 | 3;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const heights = { 1: 90, 2: 70, 3: 55 };
  const podiumHeight = heights[position];
  const initials = (entry.display_name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const medalColors = {
    1: "#f1be43",
    2: "#c0c0c0",
    3: "#cd7f32",
  };

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isMe ? colors.primary : colors.card,
          borderWidth: 2,
          borderColor: medalColors[position],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontFamily: "PlusJakartaSans_700Bold",
            color: isMe ? colors.primaryForeground : colors.foreground,
          }}
        >
          {initials}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "PlusJakartaSans_600SemiBold",
          color: colors.foreground,
          maxWidth: 70,
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {entry.display_name}
      </Text>
      <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "PlusJakartaSans_700Bold" }}>
        {entry.xp} XP
      </Text>
      <View
        style={{
          width: 60,
          height: podiumHeight,
          backgroundColor: `${medalColors[position]}20`,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          borderTopWidth: 3,
          borderColor: medalColors[position],
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 6,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontFamily: "PlusJakartaSans_800ExtraBold",
            color: medalColors[position],
          }}
        >
          {position}
        </Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useApp();

  const { data: entries = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(25),
    staleTime: 60000,
  });

  const s = styles(colors, insets);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const myRank = entries.findIndex((e) => e.id === profile?.id) + 1;

  const renderEntry = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const rank = index + 4;
    const isMe = item.id === profile?.id;
    const { level } = getLevelProgress(item.xp);
    const rankLabel = RANKS[Math.min(level, RANKS.length - 1)];
    const initials = (item.display_name ?? "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return (
      <View style={[s.entryRow, isMe && s.entryRowMe]}>
        <Text style={[s.entryRank, isMe && s.entryRankMe]}>{rank}</Text>
        <View style={[s.entryAvatar, isMe && s.entryAvatarMe]}>
          <Text style={[s.entryAvatarText, isMe && s.entryAvatarTextMe]}>{initials}</Text>
        </View>
        <View style={s.entryInfo}>
          <Text style={[s.entryName, isMe && s.entryNameMe]} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={s.entryRankLabel}>{rankLabel}</Text>
        </View>
        <View style={s.entryXPWrap}>
          <Text style={s.entryXP}>{item.xp.toLocaleString()}</Text>
          <Text style={s.entryXPLabel}>XP</Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center", gap: 12 }]}>
        <Ionicons name="wifi-outline" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "PlusJakartaSans_400Regular" }}>
          Failed to load leaderboard
        </Text>
        <TouchableOpacity onPress={() => refetch()} style={s.retryBtn}>
          <Text style={s.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FlatList
        data={rest}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={s.pageHeader}>
              <Text style={s.pageTitle}>Leaderboard</Text>
              {myRank > 0 && (
                <View style={s.myRankBadge}>
                  <Text style={s.myRankText}>#{myRank}</Text>
                </View>
              )}
            </View>

            {top3.length >= 3 && (
              <View style={s.podiumWrap}>
                <View style={s.podiumRow}>
                  <PodiumItem
                    entry={top3[1]}
                    position={2}
                    isMe={top3[1].id === profile?.id}
                    colors={colors}
                  />
                  <PodiumItem
                    entry={top3[0]}
                    position={1}
                    isMe={top3[0].id === profile?.id}
                    colors={colors}
                  />
                  <PodiumItem
                    entry={top3[2]}
                    position={3}
                    isMe={top3[2].id === profile?.id}
                    colors={colors}
                  />
                </View>
              </View>
            )}

            {rest.length > 0 && (
              <Text style={s.restTitle}>Rankings</Text>
            )}
          </>
        }
        contentContainerStyle={s.listContent}
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    listContent: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingBottom: insets.bottom + 100,
      paddingHorizontal: 16,
    },
    pageHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    pageTitle: {
      fontSize: 26,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      color: colors.foreground,
    },
    myRankBadge: {
      backgroundColor: "rgba(241,190,67,0.15)",
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.3)",
    },
    myRankText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    podiumWrap: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      paddingVertical: 24,
      paddingHorizontal: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    podiumRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      gap: 16,
    },
    restTitle: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    entryRowMe: {
      borderColor: colors.primary,
      backgroundColor: "rgba(241,190,67,0.06)",
    },
    entryRank: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.mutedForeground,
      width: 24,
      textAlign: "center",
    },
    entryRankMe: { color: colors.primary },
    entryAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    entryAvatarMe: { backgroundColor: colors.primary },
    entryAvatarText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
    },
    entryAvatarTextMe: { color: colors.primaryForeground },
    entryInfo: { flex: 1 },
    entryName: {
      fontSize: 15,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.foreground,
    },
    entryNameMe: { color: colors.primary },
    entryRankLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    entryXPWrap: { alignItems: "flex-end" },
    entryXP: {
      fontSize: 15,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
    },
    entryXPLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    retryBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    retryText: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primaryForeground,
    },
  });
