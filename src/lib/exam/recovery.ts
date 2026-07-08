import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { apiFetch } from "../api";
import { logCrumb } from "../debug-log";
import type { PartAccumulator } from "../audio/part-accumulator";
import type { SimMode } from "../types";

/** Crash-proof exams: during the exam every part's audio is flushed to disk
 *  every few seconds. If the app dies (crash, battery, force-quit), the next
 *  launch finds the pending exam and can upload + score what was completed —
 *  the candidate's spoken answers and their quota unit are never lost. */

const META_KEY = "pending-exam-v1";
const DIR_NAME = "pending-exam";

export interface PendingExamMeta {
  sessionId: string;
  mode: SimMode;
  updatedAt: number;
  parts: { part: 1 | 2 | 3; duration: number }[];
}

function pendingDir(): Directory {
  return new Directory(Paths.cache, DIR_NAME);
}

export async function persistPendingExam(
  sessionId: string,
  mode: SimMode,
  acc: PartAccumulator
): Promise<void> {
  try {
    const parts = acc.parts();
    if (parts.length === 0) return;
    const dir = pendingDir();
    if (!dir.exists) dir.create();
    for (const part of parts) {
      new File(dir, `part${part}.wav`).write(acc.toWav(part));
    }
    const meta: PendingExamMeta = {
      sessionId,
      mode,
      updatedAt: Date.now(),
      parts: parts.map((p) => ({ part: p, duration: Math.round(acc.durationSeconds(p)) })),
    };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Persistence must never break a running exam.
  }
}

export async function getPendingExam(): Promise<PendingExamMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw) as PendingExamMeta;
    if (!meta.sessionId || !Array.isArray(meta.parts) || meta.parts.length === 0) return null;
    return meta;
  } catch {
    return null;
  }
}

export async function clearPendingExam(): Promise<void> {
  try {
    await AsyncStorage.removeItem(META_KEY);
  } catch { /* ignore */ }
  try {
    const dir = pendingDir();
    if (dir.exists) dir.delete();
  } catch { /* ignore */ }
}

/** Uploads the persisted recordings of a dead exam and registers them for
 *  scoring. Returns the sessionId whose report to open. */
export async function salvagePendingExam(meta: PendingExamMeta): Promise<string> {
  logCrumb("salvage_start", { sessionId: meta.sessionId, parts: meta.parts.length });
  const urlRes = await apiFetch(`/api/sessions/${meta.sessionId}/upload-urls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts: meta.parts.map(({ part }) => ({ part })) }),
  });
  if (!urlRes.ok) throw new Error(`upload-urls HTTP ${urlRes.status}`);
  const { uploads } = (await urlRes.json()) as {
    uploads: { part: 1 | 2 | 3; signedUrl: string }[];
  };

  const dir = pendingDir();
  for (const { part } of meta.parts) {
    const target = uploads.find((u) => u.part === part);
    if (!target) throw new Error(`no upload URL for part ${part}`);
    const file = new File(dir, `part${part}.wav`);
    if (!file.exists) throw new Error(`recording for part ${part} is missing`);
    const put = await LegacyFileSystem.uploadAsync(target.signedUrl, file.uri, {
      httpMethod: "PUT",
      headers: { "Content-Type": "audio/wav" },
    });
    if (put.status < 200 || put.status >= 300) {
      throw new Error(`part ${part} upload HTTP ${put.status}`);
    }
  }

  const reg = await apiFetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: meta.sessionId, uploadedParts: meta.parts }),
  });
  if (!(reg.ok || reg.status === 503 || reg.status === 409)) {
    throw new Error(`score registration HTTP ${reg.status}`);
  }
  logCrumb("salvage_ok", { sessionId: meta.sessionId });
  await clearPendingExam();
  return meta.sessionId;
}
