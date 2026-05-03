import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { addXP, recordAnswer } from "@/lib/db";
import { calcXP, getLevelProgress, type Question, selectNextQuestion } from "@/lib/engine";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "localhost"}`;

async function fetchAITip(question: Question, wrongAnswer: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system:
          "You are a concise SACE Chemistry tutor. Give a short, helpful 1-2 sentence tip to help a student understand why an answer is correct. Be direct and educational.",
        messages: [
          {
            role: "user",
            content: `Question: "${question.question}"\nStudent answered: "${wrongAnswer}"\nCorrect answer: "${question.options[question.answer_index]}"\nTopic: ${question.topic} > ${question.subtopic}\n\nGive a brief tip (max 50 words) to help remember the correct answer.`,
          },
        ],
        max_tokens: 150,
      }),
    });
    if (!res.ok) return question.tip ?? question.solution ?? "";
    const data = await res.json();
    return data?.content?.[0]?.text ?? question.tip ?? "";
  } catch {
    return question.tip ?? question.solution ?? "";
  }
}

export default function QuizScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, profile, setProfile, questions, questionsLoading, struggleMap, setStruggleMap } = useApp();

  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [aiTip, setAiTip] = useState("");
  const [loadingTip, setLoadingTip] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const loadNext = useCallback(
    (excludeIds: string[]) => {
      const next = selectNextQuestion(questions, struggleMap, excludeIds, "all");
      if (!next) {
        setSessionDone(true);
        setCurrentQ(null);
      } else {
        fadeAnim.setValue(0);
        setCurrentQ(next);
        setSelected(null);
        setShowResult(false);
        setAiTip("");
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }
    },
    [questions, struggleMap, fadeAnim]
  );

  useEffect(() => {
    if (questions.length > 0 && !currentQ && !sessionDone) {
      loadNext([]);
    }
  }, [questions]);

  const handleAnswer = async (index: number) => {
    if (selected !== null || !currentQ || !user || !profile) return;
    await Haptics.selectionAsync();
    setSelected(index);
    setShowResult(true);

    const correct = index === currentQ.answer_index;
    const newStreak = correct ? streak + 1 : 0;
    setStreak(newStreak);

    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.03, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    if (correct) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const xpEarned = calcXP(correct, currentQ.difficulty, streak);
    setSessionXP((prev) => Math.max(0, prev + xpEarned));

    setStruggleMap((prev) => ({
      ...prev,
      [currentQ.id]: {
        ...prev[currentQ.id],
        attempts: (prev[currentQ.id]?.attempts ?? 0) + 1,
        wrong: (prev[currentQ.id]?.wrong ?? 0) + (correct ? 0 : 1),
        last_seen: new Date().toISOString(),
        next_review: prev[currentQ.id]?.next_review ?? new Date().toISOString(),
      },
    }));

    try {
      await recordAnswer(user.id, currentQ.id, correct, index);
      const newXP = await addXP(user.id, xpEarned, newStreak, profile);
      setProfile({ ...profile, xp: newXP, streak: newStreak });
    } catch {}

    if (!correct) {
      setLoadingTip(true);
      const tip = await fetchAITip(currentQ, currentQ.options[index]);
      setAiTip(tip);
      setLoadingTip(false);
    }
  };

  const handleNext = () => {
    if (!currentQ) return;
    const newIds = [...answeredIds, currentQ.id];
    setAnsweredIds(newIds);
    loadNext(newIds);
  };

  const handleReset = () => {
    setAnsweredIds([]);
    setSessionDone(false);
    setSessionXP(0);
    setStreak(0);
    loadNext([]);
  };

  const s = styles(colors, insets);

  if (questionsLoading || (!currentQ && !sessionDone && questions.length === 0)) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingText}>Loading questions…</Text>
      </View>
    );
  }

  if (sessionDone) {
    return (
      <View style={[s.root, s.centered]}>
        <View style={s.doneCard}>
          <Ionicons name="trophy" size={56} color={colors.primary} />
          <Text style={s.doneTitle}>Session Complete!</Text>
          <Text style={s.doneSub}>You've answered all available questions</Text>
          <View style={s.doneXPRow}>
            <Ionicons name="flash" size={18} color={colors.primary} />
            <Text style={s.doneXPText}>+{sessionXP} XP earned</Text>
          </View>
          <TouchableOpacity style={s.doneBtn} onPress={handleReset} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>Practice Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!currentQ) return null;

  const levelInfo = profile ? getLevelProgress(profile.xp) : null;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.headerBar}>
        <View style={s.headerLeft}>
          <View style={s.streakBadge}>
            <Ionicons name="flame" size={14} color={streak > 0 ? "#ff6b35" : colors.mutedForeground} />
            <Text style={[s.streakText, streak > 0 && s.streakActive]}>{streak}</Text>
          </View>
        </View>
        <View style={s.headerCenter}>
          <Text style={s.logoTextSmall}>
            <Text style={{ color: "#fff" }}>grade</Text>
            <Text style={{ color: colors.primary }}>farm.</Text>
          </Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.xpBadge}>
            <Ionicons name="flash" size={14} color={colors.primary} />
            <Text style={s.xpText}>+{sessionXP}</Text>
          </View>
        </View>
      </View>

      {levelInfo && (
        <View style={s.xpBarWrap}>
          <View style={s.xpBarTrack}>
            <View style={[s.xpBarFill, { width: `${Math.min(levelInfo.pct, 100)}%` as `${number}%` }]} />
          </View>
          <Text style={s.xpBarLabel}>Lv {levelInfo.level}</Text>
        </View>
      )}

      <Animated.View style={[s.questionCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={s.topicRow}>
          <Text style={s.topicChip}>{currentQ.topic}</Text>
          <Text style={s.subtopicText}>{currentQ.subtopic}</Text>
        </View>
        <Text style={s.questionText}>{currentQ.question}</Text>
      </Animated.View>

      <View style={s.optionsWrap}>
        {currentQ.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = i === currentQ.answer_index;
          let optBg = colors.card;
          let optBorder = colors.border;
          let optTextColor = colors.foreground;
          let showIcon: "checkmark-circle" | "close-circle" | null = null;

          if (showResult) {
            if (isCorrect) {
              optBg = "rgba(16,185,129,0.15)";
              optBorder = colors.success;
              optTextColor = colors.success;
              showIcon = "checkmark-circle";
            } else if (isSelected) {
              optBg = "rgba(239,68,68,0.15)";
              optBorder = colors.destructive;
              optTextColor = colors.destructive;
              showIcon = "close-circle";
            }
          }

          return (
            <TouchableOpacity
              key={i}
              style={[s.option, { backgroundColor: optBg, borderColor: optBorder }]}
              onPress={() => handleAnswer(i)}
              disabled={showResult}
              activeOpacity={0.75}
              testID={`option-${i}`}
            >
              <View style={s.optionInner}>
                <View style={[s.optionIndex, { borderColor: optBorder }]}>
                  <Text style={[s.optionIndexText, { color: optTextColor }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[s.optionText, { color: optTextColor }]}>{opt}</Text>
                {showIcon && (
                  <Ionicons
                    name={showIcon}
                    size={20}
                    color={isCorrect ? colors.success : colors.destructive}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {showResult && (
        <Animated.View style={[s.resultArea, { opacity: fadeAnim }]}>
          {selected !== null && selected !== currentQ.answer_index && (
            <View style={s.tipCard}>
              <View style={s.tipHeader}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={s.tipTitle}>Titan AI Tip</Text>
              </View>
              {loadingTip ? (
                <View style={s.tipLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.tipLoadingText}>Getting tip…</Text>
                </View>
              ) : (
                <Text style={s.tipText}>{aiTip}</Text>
              )}
            </View>
          )}

          {selected === currentQ.answer_index && currentQ.solution && (
            <View style={s.solutionCard}>
              <Text style={s.solutionLabel}>Explanation</Text>
              <Text style={s.solutionText}>{currentQ.solution}</Text>
            </View>
          )}

          <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85} testID="next-button">
            <Text style={s.nextBtnText}>Next Question</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12),
      paddingBottom: insets.bottom + 100,
      paddingHorizontal: 16,
    },
    centered: { alignItems: "center", justifyContent: "center" },
    loadingText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "PlusJakartaSans_400Regular",
      marginTop: 12,
    },
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    headerLeft: { flex: 1, alignItems: "flex-start" },
    headerCenter: { flex: 1, alignItems: "center" },
    headerRight: { flex: 1, alignItems: "flex-end" },
    logoTextSmall: {
      fontSize: 18,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      letterSpacing: 0.5,
    },
    streakBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.mutedForeground,
    },
    streakActive: { color: "#ff6b35" },
    xpBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(241,190,67,0.12)",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.3)",
    },
    xpText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    xpBarWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 20,
    },
    xpBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.muted,
      borderRadius: 2,
      overflow: "hidden",
    },
    xpBarFill: {
      height: "100%",
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    xpBarLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_600SemiBold",
      width: 30,
    },
    questionCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    topicRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
      flexWrap: "wrap",
    },
    topicChip: {
      backgroundColor: "rgba(241,190,67,0.15)",
      color: colors.primary,
      fontSize: 11,
      fontFamily: "PlusJakartaSans_600SemiBold",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.3)",
    },
    subtopicText: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    questionText: {
      fontSize: 17,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.foreground,
      lineHeight: 26,
    },
    optionsWrap: { gap: 10, marginBottom: 16 },
    option: {
      borderRadius: colors.radius,
      borderWidth: 1.5,
      padding: 14,
    },
    optionInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    optionIndex: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    optionIndexText: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
    },
    optionText: {
      flex: 1,
      fontSize: 15,
      fontFamily: "PlusJakartaSans_400Regular",
      lineHeight: 22,
    },
    resultArea: { gap: 12 },
    tipCard: {
      backgroundColor: "rgba(241,190,67,0.08)",
      borderRadius: colors.radius,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(241,190,67,0.25)",
    },
    tipHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    tipTitle: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    tipLoading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    tipLoadingText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    tipText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "PlusJakartaSans_400Regular",
      lineHeight: 22,
      opacity: 0.9,
    },
    solutionCard: {
      backgroundColor: "rgba(16,185,129,0.08)",
      borderRadius: colors.radius,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(16,185,129,0.25)",
    },
    solutionLabel: {
      fontSize: 12,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.success,
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    solutionText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "PlusJakartaSans_400Regular",
      lineHeight: 21,
      opacity: 0.9,
    },
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    nextBtnText: {
      fontSize: 15,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primaryForeground,
    },
    doneCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 32,
      alignItems: "center",
      gap: 12,
      marginHorizontal: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    doneTitle: {
      fontSize: 24,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      color: colors.foreground,
    },
    doneSub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
      textAlign: "center",
    },
    doneXPRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(241,190,67,0.12)",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    doneXPText: {
      fontSize: 16,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    doneBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
      paddingHorizontal: 32,
      marginTop: 8,
    },
    doneBtnText: {
      fontSize: 15,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primaryForeground,
    },
  });
