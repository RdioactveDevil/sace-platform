import colors from "@/constants/colors";

/**
 * Returns the design tokens for the gradefarm dark palette.
 * The app is always dark-themed to match the web app's dark navy + gold design.
 */
export function useColors() {
  return { ...colors.dark, radius: colors.radius };
}
