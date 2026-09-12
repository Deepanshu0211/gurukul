import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

/**
 * The last line of defence.
 *
 * A render-time exception anywhere below this unmounts the whole React tree.
 * In a development build that shows the red box; in a release build it shows
 * NOTHING — a blank screen, or on Android a process that simply goes away,
 * which every user reads as "the app crashed" and reports with no detail at
 * all. This turns that into a screen that says what happened and offers a way
 * back.
 *
 * Styling is inline and literal on purpose: this component has to render when
 * the rest of the app cannot, so it must not depend on the theme, the fonts,
 * navigation, or any context — every one of those is a thing that could be
 * what broke.
 *
 * `onReset` re-mounts the tree. That clears a transient failure (a bad prop
 * from a half-loaded response); it will not clear a deterministic one, which
 * is why the details stay on screen for a support call.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept for `adb logcat` / the dev console. There is no crash reporter in
    // this project yet; when one is added, this is where it is called.
    console.error("Unhandled error in render:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit a problem it could not recover from on its own. Nothing you had already
            submitted has been lost — attendance is saved on the school server the moment you
            press Submit.
          </Text>
          <Text style={styles.body}>
            Try again below. If it keeps happening, show this screen to whoever set up the app.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ error: null })}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>

          <Text style={styles.detailLabel}>TECHNICAL DETAIL</Text>
          <Text style={styles.detail} selectable>
            {String(error?.message || error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF2E6" },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#0C2B2A" },
  body: { fontSize: 14, lineHeight: 21, color: "#4C6462" },
  button: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#035352",
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 28,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  detailLabel: {
    marginTop: 28,
    fontSize: 11,
    letterSpacing: 1,
    color: "#6E8783",
    fontWeight: "600",
  },
  detail: { fontSize: 12, lineHeight: 18, color: "#4C6462" },
});
