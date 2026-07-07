import { AudioManager } from "react-native-audio-api";

export async function requestMicPermission(): Promise<boolean> {
  const status = await AudioManager.requestRecordingPermissions();
  return status === "Granted";
}

/** Silent status check — never shows the system prompt. */
export async function hasMicPermission(): Promise<boolean> {
  const status = await AudioManager.checkRecordingPermissions();
  return status === "Granted";
}

/** playAndRecord + voiceChat gives hardware echo cancellation on iOS.
 *  allowBluetoothHFP (not "allowBluetooth") is the option that actually
 *  exists on the installed SDK's IOSOption union, and it's the one that
 *  supports a Bluetooth headset's microphone — A2DP is output-only and
 *  can't carry the recording input this session needs. */
export async function configureExamAudioSession(): Promise<void> {
  AudioManager.setAudioSessionOptions({
    iosCategory: "playAndRecord",
    iosMode: "voiceChat",
    iosOptions: ["defaultToSpeaker", "allowBluetoothHFP"],
  });
  // setAudioSessionActivity resolves void on success and rejects with a
  // SessionActivationError on failure — there is no boolean result to check.
  await AudioManager.setAudioSessionActivity(true);
}

export async function deactivateAudioSession(): Promise<void> {
  await AudioManager.setAudioSessionActivity(false);
}
