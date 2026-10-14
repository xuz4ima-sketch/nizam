// Озвучка для заучивания: синтез речи устройства (арабский голос), запись своего голоса, прикреплённые файлы.
import { useEffect, useState } from 'react';
import { db } from '../../db/db';
import type { MediaItem } from '../../db/schema';

/* ---------- Синтез речи ---------- */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Арабские голоса устройства (список загружается браузером асинхронно). */
export function useArabicVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ar')));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

export function speak(text: string, opts: { rate: number; voice?: SpeechSynthesisVoice }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) { reject(new Error('tts')); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.voice?.lang ?? 'ar-SA';
    if (opts.voice) u.voice = opts.voice;
    u.rate = opts.rate;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
    speechSynthesis.speak(u);
  });
}
export const stopSpeech = () => { if (ttsSupported()) speechSynthesis.cancel(); };

/* ---------- Запись голоса ---------- */

export const recordingSupported = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return cands.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

export interface Recorder { stop: () => Promise<Blob> }

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((tr) => tr.stop()); resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); };
      rec.stop();
    }),
  };
}

/* ---------- Хранение аудио ---------- */

export const recId = (textId: string, idx: number) => `${textId}|${idx}|rec`;
export const fileId = (textId: string) => `${textId}|file`;

export async function saveMedia(item: Omit<MediaItem, 'createdAt'>) {
  await db.media.put({ ...item, createdAt: Date.now() });
}
export const deleteMedia = (id: string) => db.media.delete(id);

/** URL для воспроизведения Blob с освобождением памяти при смене/размонтировании. */
export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) { setUrl(undefined); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

let current: HTMLAudioElement | null = null;
/** Проиграть Blob (одно аудио одновременно). */
export function playBlob(blob: Blob, rate = 1): Promise<void> {
  current?.pause();
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  a.playbackRate = rate;
  current = a;
  return new Promise((resolve, reject) => {
    a.onended = () => { URL.revokeObjectURL(url); resolve(); };
    a.onerror = () => { URL.revokeObjectURL(url); reject(new Error('audio')); };
    a.play().catch((e) => { URL.revokeObjectURL(url); reject(e); });
  });
}
export const stopBlob = () => { current?.pause(); current = null; };
