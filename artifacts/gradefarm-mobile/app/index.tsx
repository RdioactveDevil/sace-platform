import { Redirect } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";

import { useApp } from "@/contexts/AppContext";

export default function Index() {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#080d28",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: Platform.OS === "web" ? 67 : 0,
        }}
      >
        <ActivityIndicator size="large" color="#f1be43" />
      </View>
    );
  }

  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/auth" />;
}
