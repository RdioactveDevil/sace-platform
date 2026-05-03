import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SUBJECTS, useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { getLevelProgress, RANKS } from "@/lib/engine";

export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, questions, struggleMap, selectedSubject, setSelectedSubjectAndLoad, signOut, questionsLoading } = useApp();

  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [switchingSubject, setSwitchingSubject] = useState(false);

  if (!profile) {
    return (
      <View style={[s(colors, insets).root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { level, pct, next, current } = getLevelProgress(profile.xp);
  const rank = RANKS[Math.min(level, RANKS.length - 1)];

  const totalAttempts = Object.values(struggleMap).reduce((a, s) => a + s.attempts, 0);
  const totalWrong = Object.values(struggleMap).reduce((a, s) => a + s.wrong, 0);
  const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100) : 0;
  const questionsAnswered = Object.keys(struggleMap).length;

  const topicMap: Record<string, { attempts: number; wrong: number }> = {};
  questions.forEach((q) => {
    const entry = struggleMap[q.id];
    if (!topicMap[q.topic]) topicMap[q.topic] = { attempts: 0, wrong: 0 };
    if (entry) {
      topicMap[q.topic].attempts += entry.attempts;
      topicMap[q.topic].wrong += entry.wrong;
    }
  });

  const topics = Object.entries(topicMap)
    .map(([name, data]) => ({
      name,
      mastery: data.attempts > 0 ? Math.round(((data.attempts - data.wrong) / data.attempts) * 100) : 0,
      attempted: data.attempts > 0,
    }))
    .sort((a, b) => (b.attempted ? 1 : 0) - (a.attempted ? 1 : 0));

  const handleSubjectSwitch = async (subject: typeof SUBJECTS[0]) => {
    setSwitchingSubject(true);
    await Haptics.selectionAsync();
    await setSelectedSubjectAndLoad(subject);
    setSwitchingSubject(false);
    setShowSubjectPicker(false);
  };

  const initials = profile.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const styles = s(colors, insets);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Progress</Text>
        <TouchableOpacity onPress={() => signOut()} style={styles.signOutBtn} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile.display_name}</Text>
          {!!profile.school && <Text style={styles.school}>{profile.school}</Text>}
          <View style={styles.rankRow}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{rank}</Text>
            </View>
            <Text style={styles.levelText}>Level {level}</Text>
          </View>
        </View>
      </View>

      <View style={styles.xpCard}>
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>XP Progress</Text>
          <Text style={styles.xpNumbers}>{profile.xp} / {next}</Text>
        </View>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${Math.min(pct, 100)}%` as `${number}%` }]} />
        </View>
        <Text style={styles.xpSub}>{next - profile.xp} XP to Level {level + 1}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="flame" size={24} color="#ff6b35" />
          <Text style={styles.statValue}>{profile.streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="book" size={24} color={colors.primary} />
          <Text style={styles.statValue}>{questionsAnswered}</Text>
          <Text style={styles.statLabel}>Answered</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Topic Mastery</Text>
          <TouchableOpacity
            style={styles.subjectChip}
            onPress={() => setShowSubjectPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.subjectChipText}>{selectedSubject.name} {selectedSubject.stage}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {questionsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : topics.length === 0 ? (
          <View style={styles.emptyTopics}>
            <Ionicons name="analytics-outline" size={32} color={colors.mutedForeground} />
            <Text style={styles.emptyTopicsText}>Answer questions to track topic mastery</Text>
          </View>
        ) : (
          topics.map((topic) => (
            <View key={topic.name} style={styles.topicRow}>
              <View style={styles.topicNameRow}>
                <Text style={styles.topicName}>{topic.name}</Text>
                <Text style={[styles.topicPct, { color: getMasteryColor(topic.mastery, topic.attempted, colors) }]}>
                  {topic.attempted ? `${topic.mastery}%` : "—"}
                </Text>
              </View>
              <View style={styles.topicBar}>
                <View
                  style={[
                    styles.topicBarFill,
                    {
                      width: topic.attempted ? `${topic.mastery}%` as `${number}%` : "0%",
                      backgroundColor: getMasteryColor(topic.mastery, topic.attempted, colors),
                    },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={showSubjectPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowSubjectPicker(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Subject</Text>
            {SUBJECTS.map((subject) => (
              <TouchableOpacity
                key={subject.id}
                style={[
                  styles.subjectOption,
                  selectedSubject.id === subject.id && styles.subjectOptionActive,
                ]}
                onPress={() => handleSubjectSwitch(subject)}
                disabled={switchingSubject}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.subjectOptionText,
                    selectedSubject.id === subject.id && styles.subjectOptionTextActive,
                  ]}
                >
                  {subject.name} {subject.stage}
                </Text>
                {selectedSubject.id === subject.id && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
            {switchingSubject && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function getMasteryColor(mastery: number, attempted: boolean, colors: ReturnType<typeof useColors>): string {
  if (!attempted) return colors.mutedForeground;
  if (mastery >= 80) return colors.success;
  if (mastery >= 50) return colors.primary;
  return colors.destructive;
}

const s = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingBottom: insets.bottom + 100,
      paddingHorizontal: 16,
      gap: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    headerTitle: {
      fontSize: 26,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      color: colors.foreground,
    },
    signOutBtn: { padding: 4 },
    profileCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarWrap: {},
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 20,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      color: colors.primaryForeground,
    },
    profileInfo: { flex: 1, gap: 4 },
    displayName: {
      fontSize: 18,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
    },
    school: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    rankRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    rankBadge: {
      backgroundColor: "rgba(241,190,67,0.15)",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.3)",
    },
    rankText: {
      fontSize: 12,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    levelText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    xpCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 20,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    xpRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    xpLabel: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.foreground,
    },
    xpNumbers: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    xpTrack: {
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: "hidden",
    },
    xpFill: {
      height: "100%",
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    xpSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: 22,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      color: colors.foreground,
    },
    statLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 20,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
    },
    subjectChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(241,190,67,0.1)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.25)",
    },
    subjectChipText: {
      fontSize: 12,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.primary,
    },
    topicRow: { gap: 6 },
    topicNameRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    topicName: {
      fontSize: 14,
      fontFamily: "PlusJakartaSans_400Regular",
      color: colors.foreground,
    },
    topicPct: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
    },
    topicBar: {
      height: 6,
      backgroundColor: colors.muted,
      borderRadius: 3,
      overflow: "hidden",
    },
    topicBarFill: {
      height: "100%",
      borderRadius: 3,
    },
    emptyTopics: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 16,
    },
    emptyTopicsText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    subjectOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: colors.radius - 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    subjectOptionActive: {
      borderColor: colors.primary,
      backgroundColor: "rgba(241,190,67,0.08)",
    },
    subjectOptionText: {
      fontSize: 15,
      fontFamily: "PlusJakartaSans_400Regular",
      color: colors.foreground,
    },
    subjectOptionTextActive: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.primary,
    },
  });
