import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { signIn, signUp } from "@/lib/db";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const schoolRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim(), school.trim() || undefined);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setLoading(false);
  };

  const s = styles(colors, insets);

  return (
    <View style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoArea}>
            <Text style={s.logoText}>
              <Text style={s.logoWhite}>grade</Text>
              <Text style={s.logoGold}>farm.</Text>
            </Text>
            <Text style={s.logoSub}>by Titanium Tutoring</Text>
          </View>

          <View style={s.card}>
            <Text style={s.title}>
              {mode === "signin" ? "Welcome back" : "Create account"}
            </Text>
            <Text style={s.subtitle}>
              {mode === "signin"
                ? "Sign in to continue your study session"
                : "Join thousands of SACE students"}
            </Text>

            {mode === "signup" && (
              <>
                <Text style={s.label}>Full name</Text>
                <TextInput
                  ref={nameRef}
                  style={s.input}
                  placeholder="Jane Smith"
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => schoolRef.current?.focus()}
                />
                <Text style={s.label}>School (optional)</Text>
                <TextInput
                  ref={schoolRef}
                  style={s.input}
                  placeholder="e.g. Pembroke School"
                  placeholderTextColor={colors.mutedForeground}
                  value={school}
                  onChangeText={setSchool}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </>
            )}

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="you@email.com"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Text style={s.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={s.btnText}>
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>

            <Pressable
              onPress={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              style={s.switchRow}
            >
              <Text style={s.switchText}>
                {mode === "signin"
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <Text style={s.switchLink}>
                  {mode === "signin" ? "Sign Up" : "Sign In"}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.navy ?? "#080d28",
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
      paddingBottom: insets.bottom + 40,
    },
    logoArea: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoText: {
      fontSize: 42,
      letterSpacing: 1,
      fontFamily: "PlusJakartaSans_800ExtraBold",
    },
    logoWhite: {
      color: "#ffffff",
    },
    logoGold: {
      color: "#f1be43",
    },
    logoSub: {
      color: "rgba(255,255,255,0.35)",
      fontSize: 12,
      marginTop: 4,
      fontFamily: "PlusJakartaSans_400Regular",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "PlusJakartaSans_400Regular",
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.foreground,
      marginBottom: 6,
      opacity: 0.8,
    },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius - 2,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "PlusJakartaSans_400Regular",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: "PlusJakartaSans_400Regular",
      marginBottom: 16,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    btnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: "PlusJakartaSans_700Bold",
      letterSpacing: 0.3,
    },
    switchRow: {
      alignItems: "center",
      marginTop: 20,
    },
    switchText: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: "PlusJakartaSans_400Regular",
    },
    switchLink: {
      color: colors.primary,
      fontFamily: "PlusJakartaSans_600SemiBold",
    },
  });
