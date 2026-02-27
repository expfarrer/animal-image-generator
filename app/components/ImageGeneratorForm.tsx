// app/components/ImageGeneratorForm.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import type { RootState } from "../store";
import {
  setPreview,
  setTopic,
  setCaption,
  setQuality,
  setSize,
  setLoading,
  setStatus,
  setPredictions,
  setIsAnimal,
  setResult,
  setElapsed,
  reset,
} from "../features/imageSlice";
import { setModelStatus } from "../features/modelSlice";
import { resizeImageFile } from "../utils/resizeImage";
import { Toaster, type ToastItem, type ToastType } from "./Toaster";

/**
 * Replacement component:
 * - stops elapsed timer reliably by writing final elapsed into redux as soon as server responds
 * - when server indicates identical output, shows a "Generate from prompt only" button
 * - when retrying as text-only, passes 'no_image' flag and optional classifier_label
 * - preserves mobile-first layout and dark font tweaks
 */

// Explicit terms to block in the caption field.
// Intentionally not exhaustive — server-side moderation handles images and catches anything missed here.
const BLOCKED_TERMS = [
  "porn", "porno", "pornography", "xxx", "nude", "nudes", "naked", "nudity",
  "nsfw", "sex", "sexual", "sexy", "erotic", "erotica", "fetish",
  "fuck", "fucker", "fucking", "fucked", "fucks",
  "shit", "bullshit",
  "cock", "dick", "penis", "vagina", "pussy", "cunt", "ass", "asshole",
  "boob", "boobs", "breast", "breasts", "nipple", "nipples",
  "rape", "molest", "pedophile", "pedo", "loli",
  "bitch", "whore", "slut", "bastard",
];

function containsBlockedTerm(text: string): string | null {
  const lower = text.toLowerCase();
  return BLOCKED_TERMS.find((t) => lower.includes(t)) ?? null;
}

// MobileNet uses ImageNet labels which name animals by species/breed.
// This list covers actual term fragments that appear in those class names.
const ANIMAL_TERMS = [
  "dog", "cat", "bird", "fish", "frog", "snake", "bear", "wolf",
  "retriever", "setter", "pointer", "spaniel", "terrier", "hound",
  "shepherd", "poodle", "beagle", "bulldog", "collie", "husky",
  "malamute", "samoyed", "boxer", "dalmatian", "chihuahua",
  "pomeranian", "dachshund", "bloodhound", "greyhound", "whippet",
  "basenji", "vizsla", "weimaraner", "doberman", "rottweiler",
  "schnauzer", "akita", "shiba", "corgi", "borzoi", "saluki",
  "wolfhound", "deerhound", "leonberg", "newfoundland", "kuvasz",
  "briard", "affenpinscher", "pekinese", "papillon", "maltese",
  "shih", "lhasa", "chow", "keeshond", "schipperke", "groenendael",
  "tabby", "persian", "siamese", "egyptian", "burmese", "manx", "angora",
  "finch", "jay", "robin", "wren", "sparrow", "eagle", "hawk",
  "falcon", "vulture", "owl", "parrot", "macaw", "flamingo",
  "pelican", "stork", "heron", "crane", "duck", "goose", "swan",
  "toucan", "peacock", "quail", "partridge", "grouse", "pheasant",
  "turkey", "pigeon", "dove", "lorikeet", "albatross", "penguin",
  "ostrich", "cockatoo", "hen", "cock", "brambling", "goldfinch",
  "junco", "bunting", "bulbul", "chickadee", "ouzel", "indigo",
  "python", "boa", "cobra", "viper", "rattlesnake", "gecko",
  "iguana", "chameleon", "alligator", "crocodile", "turtle",
  "tortoise", "toad", "salamander", "newt", "skink",
  "lion", "tiger", "leopard", "cheetah", "jaguar", "cougar",
  "lynx", "panda", "koala", "kangaroo", "elephant", "rhino",
  "hippo", "giraffe", "zebra", "camel", "llama", "bison",
  "buffalo", "yak", "deer", "elk", "moose", "antelope", "gazelle",
  "gorilla", "chimpanzee", "baboon", "macaque", "orangutan",
  "gibbon", "lemur", "marmoset", "tamarin",
  "rabbit", "hamster", "squirrel", "chipmunk", "marmot",
  "porcupine", "skunk", "otter", "mink", "weasel", "meerkat",
  "mongoose", "hedgehog", "bat", "sloth", "armadillo", "fox",
  "whale", "shark", "dolphin", "seal", "walrus",
  "sheep", "cow", "horse", "pig", "goat", "donkey", "monkey",
  "mouse", "rat", "salmon", "goldfish", "jellyfish", "starfish",
  "tench", "eel", "crab", "lobster", "snail",
];

function isAnimalPrediction(predictions: { className: string }[]): boolean {
  return predictions.some((p) =>
    ANIMAL_TERMS.some((kw) => p.className.toLowerCase().includes(kw)),
  );
}

// Cache the model after first load so subsequent uploads skip the loading delay.
let _modelPromise: Promise<any> | null = null;
async function loadMobileNet(): Promise<any> {
  if (!_modelPromise) {
    _modelPromise = (async () => {
      // @ts-ignore
      const tf = await import("@tensorflow/tfjs");
      // @ts-ignore
      const mobilenet = await import("@tensorflow-models/mobilenet");
      await tf.ready();
      return mobilenet.load({ version: 2, alpha: 1.0 });
    })();
  }
  return _modelPromise;
}

const SESSION_CAP = 10;
const STORAGE_KEY = "aig_gen_count";
const MAX_CAPTION_LENGTH = 150;

// sessionStorage key for the last generated image.
// Survives page refresh within the same tab (typical session ~30 min).
// Falls back silently if quota is exceeded or storage is unavailable.
const RESULT_STORAGE_KEY = "aig_last_result";

function persistResult(url: string, cost: number | null) {
  try {
    sessionStorage.setItem(
      RESULT_STORAGE_KEY,
      JSON.stringify({ url, cost }),
    );
  } catch {
    // quota exceeded or storage blocked — silent fallback to in-memory only
  }
}
function clearPersistedResult() {
  try { sessionStorage.removeItem(RESULT_STORAGE_KEY); } catch {}
}
function loadPersistedResult(): { url: string; cost: number | null } | null {
  try {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.url ? parsed : null;
  } catch {
    return null;
  }
}

const TOPICS = [
  { id: "celebration", label: "Celebration" },
  { id: "memorial", label: "Memorial" },
  { id: "retirement", label: "Retirement" },
  { id: "fantasy", label: "Fantasy" },
];

export default function ImageGeneratorForm() {
  const dispatch = useAppDispatch();
  const {
    preview,
    topic,
    caption,
    quality,
    size,
    loading,
    status,
    predictions,
    isAnimal,
    resultUrl,
    serverLatencyMs,
    estimatedCost,
    elapsedMs,
  } = useAppSelector((s: RootState) => s.image);

  const modelStatus = useAppSelector((s: RootState) => s.model.status);

  // Preload MobileNet as soon as the component mounts so it is ready when the user picks a file
  useEffect(() => {
    if (modelStatus === "idle") {
      dispatch(setModelStatus("loading"));
      loadMobileNet()
        .then(() => dispatch(setModelStatus("ready")))
        .catch((err) => {
          console.error("[mobilenet] failed to load:", err);
          dispatch(setModelStatus("error"));
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last generated image from sessionStorage on mount
  useEffect(() => {
    const persisted = loadPersistedResult();
    if (persisted) {
      dispatch(setResult({ url: persisted.url, cost: persisted.cost, latency: null }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [serverModel, setServerModel] = useState<string | null>(null);
  const [serverSizeUsed, setServerSizeUsed] = useState<string | null>(null);
  const [serverSizeNote, setServerSizeNote] = useState<string | null>(null);
  const [serverPromptUsed, setServerPromptUsed] = useState<string | null>(null);
  const [serverImageDimensions, setServerImageDimensions] = useState<string | null>(null);
  const [identicalDetected, setIdenticalDetected] = useState<boolean>(false);
  const [captionError, setCaptionError] = useState<string | null>(null);

  // Toast system
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  function addToast(message: string, type: ToastType, durationMs = 0): number {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    const auto = durationMs || (type === "error" ? 6000 : type === "success" ? 4000 : type === "info" ? 4000 : 0);
    if (auto > 0) setTimeout(() => removeToast(id), auto);
    return id;
  }
  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Per-session generation counter — persists across page refreshes, resets on tab close
  const [genCount, setGenCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(sessionStorage.getItem(STORAGE_KEY) ?? "0", 10) || 0;
  });
  function incrementGenCount() {
    setGenCount((prev) => {
      const next = prev + 1;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }
  const genRemaining = SESSION_CAP - genCount;
  const sessionCapReached = genCount >= SESSION_CAP;

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Prevents concurrent onFile executions if user taps file picker twice rapidly
  const processingFileRef = useRef(false);
  // Stores the already-resized blob so submit doesn't need to resize again
  const resizedBlobRef = useRef<Blob | null>(null);
  const originalFileNameRef = useRef<string>("upload.png");

  const MAX_FILE_SIZE_MB = 5;
  const PREVIEW_MAX_DIM = 1024;

  // local timer id for the interval
  const [localTimerId, setLocalTimerId] = useState<number | null>(null);

  // helper to compute top classifier label (if available)
  const topClassifierLabel =
    predictions && predictions.length
      ? predictions[0].className.split(",")[0]
      : null;

  // start / stop elapsed timer and store to redux
  function startTimer() {
    dispatch(setElapsed(0));
    const start = Date.now();
    if (localTimerId) window.clearInterval(localTimerId);
    const id = window.setInterval(() => {
      dispatch(setElapsed(Date.now() - start));
    }, 200);
    setLocalTimerId(id);
  }
  function finalizeTimerAndSet(milliseconds: number) {
    // clear the interval and set a final elapsed value
    if (localTimerId) {
      window.clearInterval(localTimerId);
      setLocalTimerId(null);
    }
    dispatch(setElapsed(milliseconds));
  }
  function stopTimer() {
    if (localTimerId) {
      window.clearInterval(localTimerId);
      setLocalTimerId(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f || processingFileRef.current) return;
    processingFileRef.current = true;

    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      addToast(`Image too large — maximum is ${MAX_FILE_SIZE_MB}MB.`, "error");
      if (inputRef.current) inputRef.current.value = "";
      processingFileRef.current = false;
      return;
    }

    if (preview) {
      try { URL.revokeObjectURL(preview); } catch {}
    }

    dispatch(setPredictions(null));
    dispatch(setIsAnimal(null));
    dispatch(setResult({ url: null, latency: null, cost: null }));
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);

    // Step 1: resize
    const uploadToastId = addToast("Checking your image…", "loading");
    let resized: Blob;
    try {
      resized = await resizeImageFile(f, PREVIEW_MAX_DIM, "image/png", 0.92);
    } catch {
      resized = f;
    }

    const tempUrl = URL.createObjectURL(resized);

    let predictions: { className: string; probability: number }[] = [];
    let detected = false;

    if (modelStatus === "error") {
      // Classifier unavailable — fail open and rely on server-side moderation
      detected = true;
      removeToast(uploadToastId);
    } else {
      // Step 2: classify using a temporary img element (never touches the DOM preview)
      const tempImg = new Image();
      await new Promise<void>((resolve) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = () => resolve();
        tempImg.src = tempUrl;
      });

      try {
        const model = await loadMobileNet();
        const preds = await model.classify(tempImg, 5);
        predictions = preds.map((p: any) => ({
          className: p.className,
          probability: p.probability,
        }));
        detected = isAnimalPrediction(predictions);
      } catch (err) {
        console.error("classifier error", err);
        detected = true; // fail open — don't block if TF.js errors mid-classify
      }

      removeToast(uploadToastId);
    }

    // Step 3: reject non-animals before the preview is ever shown
    if (!detected) {
      URL.revokeObjectURL(tempUrl);
      if (inputRef.current) inputRef.current.value = "";
      resizedBlobRef.current = null;
      addToast("No animal detected. Please upload a photo of a pet or animal.", "error");
      dispatch(setPredictions(predictions));
      dispatch(setIsAnimal(false));
      processingFileRef.current = false;
      return;
    }

    // Step 4: accept — reuse the temp URL as the preview (no second createObjectURL needed)
    resizedBlobRef.current = resized;
    originalFileNameRef.current = f.name;
    dispatch(setPredictions(predictions.length > 0 ? predictions : null));
    dispatch(setIsAnimal(predictions.length > 0 ? true : null));
    dispatch(setPreview({ url: tempUrl, name: f.name }));
    processingFileRef.current = false;
  }

  // core submit function: sends image+prompt to server (or no_image on retry)
  async function submit(forceProceed = false, noImage = false) {
    if (!preview && !noImage) {
      dispatch(setStatus("Please select an image"));
      return;
    }
    const blockedWord = containsBlockedTerm(caption);
    if (blockedWord) {
      setCaptionError("Keywords contain inappropriate content. Please edit and try again.");
      return;
    }
    dispatch(setLoading(true));
    const genToastId = addToast(
      noImage ? "Generating from prompt…" : "Generating your image…",
      "loading",
    );
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
    dispatch(setResult({ url: null, latency: null, cost: null }));

    // Use the blob already resized at upload time — no second resize needed.
    let uploadBlob: Blob | null = null;
    const originalFileName = originalFileNameRef.current;
    if (!noImage) {
      if (!resizedBlobRef.current) {
        dispatch(setStatus("No file selected"));
        dispatch(setLoading(false));
        return;
      }
      uploadBlob = resizedBlobRef.current;
    }

    // build form
    const fd = new FormData();
    if (!noImage && uploadBlob)
      fd.append("image", uploadBlob, originalFileName);
    fd.append("topic", topic);
    fd.append("caption", caption || "");
    fd.append("quality", quality);
    // include classifier top label to help text-only fallback
    if (topClassifierLabel) fd.append("classifier_label", topClassifierLabel);
    if (noImage) fd.append("no_image", "1");

    // start timer only when we actually send
    startTimer();
    const uploadStart = Date.now();
    try {
      dispatch(
        setStatus(
          noImage ? "Uploading prompt..." : "Uploading image+prompt...",
        ),
      );
      const res = await fetch("/api/generate-image", {
        method: "POST",
        body: fd,
      });
      // As soon as server responds, stop the interval and set final elapsed value
      const receivedAt = Date.now();
      const totalElapsedMs = receivedAt - uploadStart; // includes upload + provider wait
      finalizeTimerAndSet(totalElapsedMs);

      if (!res.ok) {
        removeToast(genToastId);
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.detail ?? errJson?.error ?? "Generation failed.";
        addToast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
        dispatch(setLoading(false));
        return;
      }

      const json = await res.json();

      // If server informs identical output, display button to retry without image
      if (json.identical) {
        removeToast(genToastId);
        setIdenticalDetected(true);
        setServerModel(json.model_used ?? null);
        setServerSizeUsed(json.size_used ?? null);
        setServerSizeNote(json.size_note ?? null);
        addToast("Output matched input — try generating from prompt only.", "info");
        dispatch(setLoading(false));
        // ensure resultUrl cleared
        dispatch(
          setResult({
            url: null,
            latency: json.latency_ms ?? null,
            cost: json.cost_usd ?? null,
          }),
        );
        return;
      }

      // Normal successful result
      if (json.model_used) setServerModel(String(json.model_used));
      if (json.size_used) setServerSizeUsed(String(json.size_used));
      if (json.size_note) setServerSizeNote(String(json.size_note));
      if (json.prompt_used) setServerPromptUsed(String(json.prompt_used));
      if (json.image_dimensions) setServerImageDimensions(String(json.image_dimensions));
      if (json.latency_ms)
        dispatch(
          setResult({
            url: json.url ?? null,
            latency: json.latency_ms,
            cost: json.cost_usd ?? null,
          }),
        );
      else
        dispatch(
          setResult({
            url: json.url ?? null,
            latency: null,
            cost: json.cost_usd ?? null,
          }),
        );

      removeToast(genToastId);
      if (json.url) persistResult(json.url, json.cost_usd ?? null);
      incrementGenCount();
      const providerSec = json.latency_ms
        ? (json.latency_ms / 1000).toFixed(2) + "s"
        : "—";
      const isTextOnly = noImage || json.text_only === true;
      addToast(
        isTextOnly
          ? `Generated from prompt only — no photo used (${(totalElapsedMs / 1000).toFixed(1)}s)`
          : `Done — ${(totalElapsedMs / 1000).toFixed(1)}s total, ${providerSec} provider`,
        "success",
      );
    } catch (err) {
      console.error("submit error", err);
      removeToast(genToastId);
      finalizeTimerAndSet(Date.now() - uploadStart);
      addToast("Generation failed. Please try again.", "error");
    } finally {
      stopTimer();
      dispatch(setLoading(false));
    }
  }

  function clearSelection() {
    if (preview) {
      try {
        URL.revokeObjectURL(preview);
      } catch {}
    }
    if (inputRef.current) inputRef.current.value = "";
    resizedBlobRef.current = null;
    clearPersistedResult();
    dispatch(reset());
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
  }

  // What to show in the image area:
  // result (if ready) → preview (if uploaded) → empty tap-to-upload
  const displayUrl = resultUrl || preview;

  return (
    <>
      <Toaster toasts={toasts} onDismiss={removeToast} />

      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Header */}
        <header className="bg-slate-100 px-4 pt-12 pb-2 text-center">
          <h1 className="text-xl font-bold text-slate-900">Animal Image Generator</h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload a pet photo · pick a theme · generate</p>
        </header>

        <div className="flex-1 flex flex-col gap-3 p-4 pb-10 max-w-lg mx-auto w-full">

          {/* ── Image area ── */}
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-900 shadow-md">

            {/* Empty state: tap the whole area to upload */}
            {!displayUrl && (
              <label className={`absolute inset-0 flex flex-col items-center justify-center gap-3 select-none ${modelStatus === "loading" ? "cursor-wait" : "cursor-pointer"}`}>
                {modelStatus === "loading" ? (
                  <>
                    <div className="w-10 h-10 rounded-full border-4 border-slate-600/30 border-t-slate-400 animate-spin" />
                    <span className="text-slate-400 text-base font-medium">Loading classifier…</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h1.5l1.5-2h6l1.5 2H19a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-slate-400 text-base font-medium">Tap to upload a pet photo</span>
                    <span className="text-slate-600 text-xs">Max {MAX_FILE_SIZE_MB}MB · JPG, PNG, HEIC</span>
                    {modelStatus === "error" && (
                      <span className="text-amber-500 text-xs">AI classifier unavailable</span>
                    )}
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="sr-only"
                  disabled={loading || modelStatus === "loading"}
                />
              </label>
            )}

            {/* Preview / result image */}
            {displayUrl && (
              <img
                key={displayUrl}
                src={displayUrl}
                alt={resultUrl ? "Generated image" : "Preview"}
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}

            {/* Loading overlay — greys out the image and shows spinner */}
            {loading && preview && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
                <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <p className="text-white text-base font-semibold tracking-wide">Working on it…</p>
              </div>
            )}

            {/* Change photo button when preview is shown but no result yet */}
            {preview && !resultUrl && !loading && (
              <label className={`absolute bottom-3 right-3 ${modelStatus === "loading" ? "cursor-wait opacity-50" : "cursor-pointer"}`}>
                <span className="bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-4 py-2.5 rounded-full">
                  Change
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="sr-only"
                  disabled={loading || modelStatus === "loading"}
                />
              </label>
            )}
          </div>

          {/* Save + New — shown below the image once result is ready */}
          {resultUrl && !loading && (
            <div className="flex gap-3">
              <a
                href={resultUrl}
                download
                className="flex-1 text-center py-4 rounded-2xl bg-indigo-600 text-white text-base font-semibold"
              >
                ↓ Save image
              </a>
              <button
                onClick={clearSelection}
                className="flex-1 py-4 rounded-2xl bg-slate-200 text-slate-800 text-base font-semibold"
              >
                New photo
              </button>
            </div>
          )}

          {/* Classifier badge */}
          {predictions && predictions.length > 0 && (
            <div className={`text-center text-xs font-medium px-3 py-1.5 rounded-full self-center ${isAnimal ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {predictions[0].className.split(",")[0]} · {(predictions[0].probability * 100).toFixed(0)}% confidence
            </div>
          )}

          {/* ── Controls ── */}
          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">

            {/* Theme */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Theme</label>
              <div className="flex gap-2 flex-wrap">
                {TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => dispatch(setTopic(t.id))}
                    disabled={loading}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                      topic === t.id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Quality</label>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => dispatch(setQuality(q))}
                    disabled={loading}
                    className={`flex-1 py-2.5 rounded-full text-sm font-medium capitalize transition-colors ${
                      quality === q
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Keywords</label>
              <input
                value={caption}
                maxLength={MAX_CAPTION_LENGTH}
                onChange={(e) => {
                  dispatch(setCaption(e.target.value));
                  setCaptionError(containsBlockedTerm(e.target.value) ? "Inappropriate content detected." : null);
                }}
                placeholder="e.g. golden light, garden, beloved family companion"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${captionError ? "border-red-400 focus:ring-red-400" : "border-slate-200 focus:ring-indigo-500"}`}
                disabled={loading}
              />
              <div className="mt-1 flex justify-between items-start">
                {captionError
                  ? <p className="text-xs text-red-600">{captionError}</p>
                  : <span />
                }
                <p className={`text-xs tabular-nums ${
                  caption.length >= MAX_CAPTION_LENGTH ? "text-red-500 font-semibold" :
                  caption.length >= MAX_CAPTION_LENGTH - 20 ? "text-amber-500" :
                  "text-slate-400"
                }`}>
                  {caption.length}/{MAX_CAPTION_LENGTH}
                </p>
              </div>
            </div>

            {/* Generate */}
            <button
              type="button"
              onClick={() => submit(false, false)}
              disabled={loading || !!captionError || !preview || sessionCapReached}
              className={`w-full py-4 rounded-2xl text-base font-semibold transition-colors ${
                loading || captionError || !preview || sessionCapReached
                  ? "bg-slate-200 text-slate-400"
                  : "bg-indigo-600 text-white active:bg-indigo-700"
              }`}
            >
              {loading ? "Generating…" : "Generate"}
            </button>
            {sessionCapReached && (
              <p className="text-center text-xs text-red-600 font-medium">
                Session limit reached ({SESSION_CAP} generations). Close and reopen the tab to continue.
              </p>
            )}
            {!sessionCapReached && genRemaining <= 3 && genRemaining > 0 && (
              <p className="text-center text-xs text-amber-600">
                {genRemaining} generation{genRemaining === 1 ? "" : "s"} remaining this session
              </p>
            )}
          </div>

          {/* Identical output fallback */}
          {identicalDetected && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm text-amber-800 mb-3">The model returned the same image. Try generating from prompt only.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => submit(false, true)}
                  disabled={loading}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium"
                >
                  Prompt only
                </button>
                <button
                  onClick={clearSelection}
                  disabled={loading}
                  className="py-3 px-4 border border-slate-300 rounded-xl text-sm text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Result metadata (collapsed by default) */}
          {resultUrl && serverPromptUsed && (
            <details className="bg-white rounded-2xl shadow-sm p-4 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-700 text-sm">Generation details</summary>
              <div className="mt-3 space-y-1.5">
                {serverModel && <div>Model: <strong>{serverModel}</strong></div>}
                {estimatedCost != null && <div>Est. cost: <strong>${estimatedCost.toFixed(3)}</strong></div>}
                {serverLatencyMs != null && <div>Provider: <strong>{(serverLatencyMs / 1000).toFixed(2)}s</strong></div>}
                <div className="mt-2 p-2 bg-slate-50 rounded-lg break-words leading-relaxed">
                  <span className="font-medium text-slate-600">Prompt: </span>{serverPromptUsed}
                </div>
              </div>
            </details>
          )}

        </div>
      </div>
    </>
  );
}
