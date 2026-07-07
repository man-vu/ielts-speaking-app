import { StyleSheet, Text, TextInput, View } from "react-native";
import { overline, theme } from "@/src/lib/theme";

interface NotesPadProps {
  value: string;
  onChange(text: string): void;
  editable: boolean;
}

/** Part 2 scratch pad — the real exam hands candidates paper and a pencil.
 *  Editable during the prep minute; stays visible (read-only) while talking. */
export function NotesPad({ value, onChange, editable }: NotesPadProps) {
  return (
    <View style={styles.container}>
      <Text style={[overline, styles.label]}>
        {editable ? "Your notes — jot key ideas" : "Your notes"}
      </Text>
      <TextInput
        style={[styles.input, !editable && styles.inputLocked]}
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline
        placeholder={editable ? "e.g. where · when · who · why memorable…" : undefined}
        placeholderTextColor={theme.inkMuted}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { color: theme.inkMuted },
  input: {
    minHeight: 88, maxHeight: 150, borderRadius: 10, padding: 12,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    color: theme.ink, fontSize: 15, lineHeight: 21, textAlignVertical: "top",
  },
  inputLocked: { opacity: 0.75, borderStyle: "dashed" },
});
