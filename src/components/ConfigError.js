import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

/**
 * Shown when the app was built without its Supabase configuration.
 *
 * This used to be a hard crash on launch: `createClient(undefined, undefined)`
 * throws while the bundle is still being evaluated, so the app died before it
 * could draw a pixel. The same misconfiguration now lands here.
 *
 * Written for whoever is holding the phone, then for whoever can fix it —
 * because those are usually two different people, and the first one needs to
 * know it is not their phone and not their fault.
 *
 * Deliberately theme-free: this renders before anything else is known to work.
 */
export default function ConfigError({ detail }) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>This app is not set up yet</Text>
        <Text style={styles.body}>
          It was built without the address of the school server, so it cannot sign anybody in or
          load any attendance. Nothing is wrong with this phone — the app itself has to be built
          again.
        </Text>

        <Text style={styles.label}>FOR WHOEVER BUILDS THE APP</Text>
        <Text style={styles.body}>
          {detail} {detail && detail.includes("and") ? "were" : "was"} missing at build time.
          These come from `.env` on a developer machine, which is gitignored and therefore absent
          on a build server. Set them for the build instead — the `env` block in `eas.json`, or
          EAS environment variables — then build again.
        </Text>
        <Text style={styles.code} selectable>
          EXPO_PUBLIC_SUPABASE_URL{"\n"}EXPO_PUBLIC_SUPABASE_ANON_KEY
        </Text>
        <Text style={styles.footnote}>
          Only those two. The service-role key must never be put in a build: it bypasses every
          access rule in the database, and anything inside the app file can be read by anyone
          holding it.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF2E6" },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#0C2B2A" },
  body: { fontSize: 14, lineHeight: 21, color: "#4C6462" },
  label: {
    marginTop: 20,
    fontSize: 11,
    letterSpacing: 1,
    color: "#6E8783",
    fontWeight: "600",
  },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 20,
    color: "#0C2B2A",
    backgroundColor: "#E4EFEC",
    borderRadius: 8,
    padding: 12,
  },
  footnote: { fontSize: 12, lineHeight: 18, color: "#8A5F04" },
});
