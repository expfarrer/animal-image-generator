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
import { buildDownloadFilename, resultMimeFromUrl } from "../utils/downloadFilename";
import { trackEvent } from "../utils/trackEvent";
import { Toaster, type ToastItem, type ToastType } from "./Toaster";
import PageHeader from "./PageHeader";

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

// Pre-compiled whole-word regexes — prevents substring false positives like
// "sunglasses" triggering "ass", "classic" triggering "ass", etc.
const BLOCKED_REGEXES = BLOCKED_TERMS.map((t) => new RegExp(`\\b${t}\\b`));

function containsBlockedTerm(text: string): string | null {
  const lower = text.toLowerCase();
  const idx = BLOCKED_REGEXES.findIndex((re) => re.test(lower));
  return idx >= 0 ? BLOCKED_TERMS[idx] : null;
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

// crypto.randomUUID() requires a secure context (HTTPS / localhost).
// This fallback covers local-IP dev access and any other non-secure contexts.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const SESSION_CAP = 10;
const STORAGE_KEY = "aig_gen_count";
const MAX_CAPTION_LENGTH = 150;

// sessionStorage key for the last generated image.
const RESULT_STORAGE_KEY = "aig_last_result";

function persistResult(url: string, cost: number | null) {
  try {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({ url, cost }));
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
  { id: "memorial",    label: "Memorial" },
  { id: "love",        label: "Love" },
  { id: "patriotic",   label: "Patriotic" },
  { id: "royal",       label: "Royal Portrait" },
  { id: "fantasy",     label: "Fantasy" },
  { id: "hero",        label: "Hero" },
  { id: "cartoon",     label: "Cartoon" },
  { id: "custom",      label: "Custom" },
];

// B-level detail beans — shown as tappable chips below the theme selector.
// Keys must match TOPICS ids. Max 3 selectable per generation.
const BEANS: Record<string, string[]> = {
  celebration: ["confetti", "balloons", "birthday cake", "party hat", "fireworks"],
  memorial:    ["flowers", "soft clouds", "golden light", "candle", "rainbow bridge"],
  love:        ["hearts", "roses", "couple portrait", "pink glow", "love banner"],
  patriotic:   ["american flag", "stars", "fireworks", "red white blue ribbon", "hero pose"],
  royal:       ["crown", "throne", "castle", "royal robe", "gold frame"],
  fantasy:     ["magic glow", "dragon wings", "fairy forest", "sparkles", "floating lights"],
  hero:        ["cape", "armor", "glowing aura", "epic mountain", "lightning", "battle sky"],
  cartoon:     ["big eyes", "pastel colors", "storybook style", "sticker style", "kawaii cute", "toon smile"],
  // custom: no beans — Custom is a pure manual-details theme
};

const MAX_BEANS = 3;

// Fixed headline copy for the results view, keyed by theme ID.
// Do not build this with string concatenation — use explicit per-theme copy.
const THEME_RESULT_HEADLINES: Record<string, string> = {
  royal:       "Your Royal Portrait is Ready",
  celebration: "Your Celebration Portrait is Ready",
  love:        "Your Love Portrait is Ready",
  patriotic:   "Your Patriotic Portrait is Ready",
  memorial:    "Your Memorial Portrait is Ready",
  fantasy:     "Your Fantasy Portrait is Ready",
  hero:        "Your Hero Portrait is Ready",
  cartoon:     "Your Cartoon Portrait is Ready",
};

// Explore Styles entries. Structured with a stable key so icon assets can be
// wired later without changing this shape.
const EXPLORE_STYLES: { key: string; label: string }[] = [
  { key: "royal",       label: "Royal" },
  { key: "celebration", label: "Celebration" },
  { key: "love",        label: "Love" },
  { key: "patriotic",   label: "Patriotic" },
  { key: "memorial",    label: "Memorial" },
  { key: "fantasy",     label: "Fantasy" },
  { key: "hero",        label: "Hero" },
  { key: "cartoon",     label: "Cartoon" },
  { key: "more",        label: "More" },
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

  // Clear selected beans whenever the theme changes so old-theme beans don't bleed into new theme
  useEffect(() => {
    setSelectedBeans([]);
  }, [topic]);

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

  const [emailCtaState, setEmailCtaState] = useState<"hidden" | "shown" | "submitting" | "done">("hidden");
  const [emailInput, setEmailInput] = useState<string>("");

  const [serverModel, setServerModel] = useState<string | null>(null);
  const [serverSizeUsed, setServerSizeUsed] = useState<string | null>(null);
  const [serverSizeNote, setServerSizeNote] = useState<string | null>(null);
  const [serverPromptUsed, setServerPromptUsed] = useState<string | null>(null);
  const [serverImageDimensions, setServerImageDimensions] = useState<string | null>(null);
  const [identicalDetected, setIdenticalDetected] = useState<boolean>(false);
  const [selectedBeans, setSelectedBeans] = useState<string[]>([]);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [blockedWord, setBlockedWord] = useState<string | null>(null);

  // Result view state
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

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

  // Per-session generation counter — persists across page refreshes, resets on tab close.
  const [genCount, setGenCount] = useState<number>(0);
  useEffect(() => {
    const stored = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? "0", 10) || 0;
    if (stored !== 0) setGenCount(stored);
  }, []);
  function incrementGenCount() {
    setGenCount((prev) => {
      const next = prev + 1;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }
  const genRemaining = SESSION_CAP - genCount;
  const sessionCapReached = genCount >= SESSION_CAP;

  // Credits fetched from /api/credits (server-side guest session in KV).
  const [credits, setCredits] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.credits === "number") setCredits(data.credits);
      })
      .catch(() => {});
  }, []);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const processingFileRef = useRef(false);
  const submittingRef = useRef(false);
  const resizedBlobRef = useRef<Blob | null>(null);
  const resizedMimeRef = useRef<string>("image/jpeg");
  const originalFileNameRef = useRef<string>("upload");
  const uploadIdRef = useRef<string | null>(null);
  const sessionStartedRef = useRef<boolean>(false);

  const PREVIEW_MAX_DIM = 1024;

  const timerIdRef = useRef<number | null>(null);

  const topClassifierLabel =
    predictions && predictions.length
      ? predictions[0].className.split(",")[0]
      : null;

  function startTimer() {
    dispatch(setElapsed(0));
    const start = Date.now();
    if (timerIdRef.current) window.clearInterval(timerIdRef.current);
    timerIdRef.current = window.setInterval(() => {
      dispatch(setElapsed(Date.now() - start));
    }, 200);
  }
  function finalizeTimerAndSet(milliseconds: number) {
    if (timerIdRef.current) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
    dispatch(setElapsed(milliseconds));
  }
  function stopTimer() {
    if (timerIdRef.current) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f || processingFileRef.current) return;
    processingFileRef.current = true;

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
      resized = await resizeImageFile(f, PREVIEW_MAX_DIM);
      trackEvent("image_optimized", {
        original_size_bytes:  f.size,
        optimized_size_bytes: resized.size,
        size_saved_bytes:     Math.max(0, f.size - resized.size),
        reduction_percent:    Math.round(Math.max(0, (f.size - resized.size) / f.size) * 100),
        output_format:        resized.type,
        had_transparency:     resized.type === "image/png",
      });
    } catch {
      resized = f;
    }

    const tempUrl = URL.createObjectURL(resized);

    let predictions: { className: string; probability: number }[] = [];
    let detected = false;

    if (modelStatus === "error") {
      detected = true;
      removeToast(uploadToastId);
    } else {
      const tempImg = new Image();
      await new Promise<void>((resolve) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = () => resolve();
        tempImg.src = tempUrl;
      });

      try {
        const classifierTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("classifier timeout")), 5000),
        );
        const model = await Promise.race([loadMobileNet(), classifierTimeout]);
        const preds = await model.classify(tempImg, 5);
        predictions = preds.map((p: any) => ({
          className: p.className,
          probability: p.probability,
        }));
        detected = isAnimalPrediction(predictions);
      } catch (err) {
        console.error("classifier error (fail open):", err);
        detected = true;
      }

      removeToast(uploadToastId);
    }

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

    resizedBlobRef.current = resized;
    uploadIdRef.current = generateId();
    resizedMimeRef.current = resized.type || "image/jpeg";
    originalFileNameRef.current = f.name.replace(/\.[^.]+$/, "");
    dispatch(setPredictions(predictions.length > 0 ? predictions : null));
    dispatch(setIsAnimal(predictions.length > 0 ? true : null));
    dispatch(setPreview({ url: tempUrl, name: f.name }));
    trackEvent("upload_completed", { upload_id: uploadIdRef.current });
    processingFileRef.current = false;
  }

  function friendlyError(errJson: any, status: number): string {
    const raw: string = errJson?.detail ?? errJson?.error ?? "";
    if (raw === "rate_limited" || raw.includes("rate_limit"))
      return "You're generating too quickly. Please wait a moment and try again.";
    if (raw === "insufficient_credits")
      return "You have no credits left. Buy more to continue.";
    if (status === 401)
      return "Session not found. Please complete a purchase first.";
    if (status === 402)
      return "You have no credits left. Buy more to continue.";
    if (status === 429)
      return raw.includes("wait") ? raw : "Too many requests. Please wait a moment and try again.";
    if (status >= 500)
      return "We're having trouble generating your image right now. Please try again.";
    if (raw.length > 0 && raw.length < 120) return raw;
    return "Generation failed. Please try again.";
  }

  async function submit(forceProceed = false, noImage = false, captionOverride?: string, beansOverride?: string[], topicOverride?: string) {
    if (submittingRef.current) return;
    if (!preview && !noImage) {
      dispatch(setStatus("Please select an image"));
      return;
    }
    const captionToUse = captionOverride ?? caption;
    const detected = containsBlockedTerm(captionToUse);
    if (detected) {
      setBlockedWord(detected);
      setCaptionError("Keywords contain inappropriate content. Please edit and try again.");
      return;
    }
    submittingRef.current = true;
    if (!sessionStartedRef.current) {
      trackEvent("generation_session_started", { upload_id: uploadIdRef.current });
      sessionStartedRef.current = true;
    }
    trackEvent("generate_clicked", { upload_id: uploadIdRef.current });
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

    const fd = new FormData();
    if (!noImage && uploadBlob) {
      const uploadMime = resizedMimeRef.current || "image/jpeg";
      const uploadExt  = uploadMime.includes("png") ? ".png" : ".jpg";
      const uploadFilename = (originalFileNameRef.current || "upload") + uploadExt;
      fd.append("image", uploadBlob, uploadFilename);
    }
    fd.append("topic", topicOverride ?? topic);
    fd.append("caption", captionToUse || "");
    const beansToUse = beansOverride ?? selectedBeans;
    if (beansToUse.length > 0) fd.append("beans", beansToUse.join(", "));
    fd.append("quality", "medium");
    fd.append("size", size);
    if (topClassifierLabel) fd.append("classifier_label", topClassifierLabel);
    if (noImage) fd.append("no_image", "1");

    startTimer();
    const uploadStart = Date.now();
    try {
      dispatch(setStatus(noImage ? "Uploading prompt..." : "Uploading image+prompt..."));
      const res = await fetch("/api/generate-image", {
        method: "POST",
        body: fd,
      });
      const receivedAt = Date.now();
      const totalElapsedMs = receivedAt - uploadStart;
      finalizeTimerAndSet(totalElapsedMs);

      if (!res.ok) {
        removeToast(genToastId);
        const errJson = await res.json().catch(() => null);
        addToast(friendlyError(errJson, res.status), "error");
        if (res.status === 402) {
          fetch("/api/credits").then((r) => r.json()).then((data) => {
            if (typeof data.credits === "number") setCredits(data.credits);
          }).catch(() => {});
        }
        const failureStage = res.status === 429 ? "rate_limited"
          : res.status === 402 ? "credits"
          : res.status === 400 ? "validation"
          : res.status >= 500 ? "provider"
          : "unknown";
        const rawReason = typeof errJson?.error === "string" ? errJson.error
          : typeof errJson?.detail === "string" ? errJson.detail : "";
        trackEvent("generate_failed", {
          upload_id: uploadIdRef.current,
          duration_ms: totalElapsedMs,
          failure_stage: failureStage,
          ...(rawReason ? { failure_reason: rawReason.slice(0, 50) } : {}),
        });
        dispatch(setLoading(false));
        return;
      }

      const json = await res.json();

      if (json.identical) {
        removeToast(genToastId);
        setIdenticalDetected(true);
        setServerModel(json.model_used ?? null);
        setServerSizeUsed(json.size_used ?? null);
        setServerSizeNote(json.size_note ?? null);
        addToast("Output matched input — try generating from prompt only.", "info");
        dispatch(setLoading(false));
        dispatch(setResult({ url: null, latency: json.latency_ms ?? null, cost: json.cost_usd ?? null }));
        return;
      }

      if (json.model_used) setServerModel(String(json.model_used));
      if (json.size_used) setServerSizeUsed(String(json.size_used));
      if (json.size_note) setServerSizeNote(String(json.size_note));
      if (json.prompt_used) setServerPromptUsed(String(json.prompt_used));
      if (json.image_dimensions) setServerImageDimensions(String(json.image_dimensions));
      if (json.latency_ms)
        dispatch(setResult({ url: json.url ?? null, latency: json.latency_ms, cost: json.cost_usd ?? null }));
      else
        dispatch(setResult({ url: json.url ?? null, latency: null, cost: json.cost_usd ?? null }));

      removeToast(genToastId);
      trackEvent("generate_success", {
        duration_ms: totalElapsedMs,
        upload_id: uploadIdRef.current,
        estimated_cost_usd: typeof json.cost_usd === "number" ? json.cost_usd : undefined,
        model: typeof json.model_used === "string" ? json.model_used : undefined,
      });
      if (json.url) persistResult(json.url, json.cost_usd ?? null);
      incrementGenCount();
      setCredits((prev) => {
        if (prev === null) return null;
        return Math.max(0, prev - 1);
      });
      // Reset result-view state for the new result
      setShowOriginal(false);
      setShowPrompt(false);
      setCopied(false);
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
      trackEvent("generate_failed", {
        upload_id: uploadIdRef.current,
        duration_ms: Date.now() - uploadStart,
        failure_stage: "network",
      });
    } finally {
      submittingRef.current = false;
      stopTimer();
      dispatch(setLoading(false));
    }
  }

  // Full reset — clears image, result, and all transient state.
  function clearSelection() {
    if (preview) {
      try { URL.revokeObjectURL(preview); } catch {}
    }
    if (inputRef.current) inputRef.current.value = "";
    resizedBlobRef.current = null;
    resizedMimeRef.current = "image/jpeg";
    uploadIdRef.current = null;
    sessionStartedRef.current = false;
    clearPersistedResult();
    dispatch(reset());
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
    setEmailCtaState("hidden");
    setEmailInput("");
    setShowOriginal(false);
    setShowPrompt(false);
    setCopied(false);
  }

  // Keeps the current photo, clears the result so the controls reappear.
  // Used only by the "identical detected" fallback flow.
  function generateAnother() {
    dispatch(setResult({ url: null, latency: null, cost: null }));
    clearPersistedResult();
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
    setEmailCtaState("hidden");
    setEmailInput("");
    setShowOriginal(false);
    setShowPrompt(false);
    setCopied(false);
  }

  async function handleEmailCapture() {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed.includes("@")) return;
    setEmailCtaState("submitting");
    try {
      await fetch("/api/user/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
    } catch {}
    trackEvent("email_captured");
    setEmailCtaState("done");
  }

  function handleCopyLink() {
    if (!resultUrl || resultUrl.startsWith("data:")) return;
    navigator.clipboard.writeText(resultUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // What to show in the image area: original toggle → result → preview
  const displayUrl = resultUrl && showOriginal ? preview : (resultUrl || preview);

  const resultHeadline = THEME_RESULT_HEADLINES[topic] ?? "Your Image is Ready";
  const resultSubline = elapsedMs
    ? `Generated in ${(elapsedMs / 1000).toFixed(1)}s · Download, share, or try another style`
    : "Download, share, or try another style";

  return (
    <>
      <Toaster toasts={toasts} onDismiss={removeToast} />

      <div className="min-h-screen bg-slate-100 flex flex-col">

        {/* Header — switches between form title and result headline */}
        <header className="bg-slate-100 px-4 pt-6 pb-4 text-center">
          {resultUrl && !loading ? (
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{resultHeadline}</h1>
              <p className="text-sm text-slate-500 mt-1">{resultSubline}</p>
            </div>
          ) : (
            <>
              <PageHeader headline="Create Your Image" description="Upload a photo, choose a theme, and generate your image." />
              {credits !== null && (
                <span className="inline-flex items-center mt-2 bg-white rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm whitespace-nowrap">
                  {credits} credit{credits === 1 ? "" : "s"} left
                </span>
              )}
            </>
          )}
        </header>

        <div className="flex-1 flex flex-col gap-3 p-4 pb-10 max-w-xl mx-auto w-full">

          {/* ── Image area ── */}
          <div className={`relative w-full rounded-2xl overflow-hidden bg-slate-900 shadow-md ${
            size === "1024x1536" ? "aspect-[2/3]" :
            size === "1536x1024" ? "aspect-[3/2]" :
            "aspect-square"
          }`}>

            {/* Empty state: tap the whole area to upload */}
            {!displayUrl && (
              <label className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h1.5l1.5-2h6l1.5 2H19a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-slate-400 text-base font-medium">Tap to upload a pet photo</span>
                <span className="text-slate-600 text-xs">JPG, PNG, HEIC and more</span>
                {modelStatus === "error" && (
                  <span className="text-amber-500 text-xs">AI classifier unavailable</span>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="sr-only"
                  disabled={loading}
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

            {/* Loading overlay */}
            {loading && preview && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
                <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <p className="text-white text-base font-semibold tracking-wide">Working on it…</p>
              </div>
            )}

            {/* Before / After toggle — visible when result is displayed over an original */}
            {resultUrl && preview && !loading && (
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-3 py-2 rounded-full"
              >
                {showOriginal ? "Generated" : "Original"}
              </button>
            )}

            {/* Change photo button — shown in form mode only */}
            {preview && !resultUrl && !loading && (
              <label className="absolute bottom-3 right-3 cursor-pointer">
                <span className="bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-4 py-2.5 rounded-full">
                  Change
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="sr-only"
                  disabled={loading}
                />
              </label>
            )}
          </div>

          {/* Classifier badge — shown in form mode only */}
          {!resultUrl && predictions && predictions.length > 0 && (
            <div className={`text-center text-xs font-medium px-3 py-1.5 rounded-full self-center ${isAnimal ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {predictions[0].className.split(",")[0]} · {(predictions[0].probability * 100).toFixed(0)}% confidence
            </div>
          )}

          {resultUrl && !loading ? (
            /* ── Result view ── */
            <div className="flex flex-col gap-3">

              {/* Primary + Secondary CTAs */}
              <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">

                {/* Primary: Download HD */}
                <a
                  href={resultUrl}
                  download={buildDownloadFilename(predictions, resultMimeFromUrl(resultUrl ?? ""))}
                  onClick={() => trackEvent("download_clicked", { upload_id: uploadIdRef.current })}
                  className="w-full text-center py-4 rounded-2xl bg-indigo-600 text-white text-base font-semibold hover:opacity-80 active:bg-indigo-700 transition-opacity"
                >
                  Download HD
                </a>

                {/* Secondary: Try Another Style — full clean reset */}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="w-full py-4 rounded-2xl border border-slate-200 text-slate-800 text-base font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Try Another Style
                </button>

                {/* Credit upsell — only when 0 or 1 credits remain */}
                {credits !== null && credits <= 1 && (
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <p className="text-sm font-medium text-amber-800">
                      {credits === 0
                        ? "No credits left — keep creating"
                        : "Only 1 credit left — keep creating"}
                    </p>
                    <a
                      href="/pricing"
                      className="text-sm font-semibold text-indigo-600 whitespace-nowrap ml-3"
                    >
                      Get 10 Credits
                    </a>
                  </div>
                )}
              </div>

              {/* Share section */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-slate-900 mb-0.5">Share Your Image</p>
                <p className="text-xs text-slate-400 mb-3">Download or share your generated image</p>
                {resultUrl && !resultUrl.startsWith("data:") ? (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {copied ? "Link Copied" : "Copy Link"}
                  </button>
                ) : (
                  <p className="text-xs text-slate-400">Download your image to share it with friends.</p>
                )}
              </div>

              {/* Explore Styles */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-slate-900 mb-3">Explore Styles</p>
                <div className="grid grid-cols-3 gap-2">
                  {EXPLORE_STYLES.map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      onClick={clearSelection}
                      className="py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Details — collapsed by default */}
              {serverPromptUsed && (
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <button
                    type="button"
                    onClick={() => setShowPrompt((v) => !v)}
                    className="flex items-center justify-between w-full cursor-pointer"
                  >
                    <p className="text-sm font-semibold text-slate-900">Prompt Details</p>
                    <span className="text-xs text-indigo-600 font-medium">
                      {showPrompt ? "Hide" : "View Prompt"}
                    </span>
                  </button>
                  {showPrompt && (
                    <p className="text-sm text-slate-600 leading-relaxed mt-3">{serverPromptUsed}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
          /* ── Controls ── */
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
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
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

            {/* B-level beans */}
            {BEANS[topic] && (
              <div>
                <p className="text-xs text-slate-400 mb-1.5">Choose up to {MAX_BEANS} details</p>
                <div className="flex gap-2 flex-wrap">
                  {BEANS[topic].map((bean) => {
                    const selected = selectedBeans.includes(bean);
                    return (
                      <button
                        key={bean}
                        type="button"
                        disabled={loading || (!selected && selectedBeans.length >= MAX_BEANS)}
                        onClick={() =>
                          setSelectedBeans((prev) =>
                            selected ? prev.filter((b) => b !== bean) : [...prev, bean],
                          )
                        }
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                          selected
                            ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-400"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {bean}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add details */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Add details (optional)</label>
              <input
                value={caption}
                maxLength={MAX_CAPTION_LENGTH}
                onChange={(e) => {
                  dispatch(setCaption(e.target.value));
                  const word = containsBlockedTerm(e.target.value);
                  setBlockedWord(word);
                  setCaptionError(word ? "Inappropriate content detected." : null);
                }}
                placeholder="Describe the look you want, e.g. golden light, garden, beloved family companion"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${captionError ? "border-red-400 focus:ring-red-400" : "border-slate-200 focus:ring-indigo-500"}`}
                disabled={loading}
              />
              <div className="mt-1 flex justify-between items-start">
                {captionError
                  ? (
                    <p className="text-xs text-red-600">
                      {blockedWord
                        ? <>Contains: <span className="line-through font-medium">{blockedWord}</span> — please remove it</>
                        : captionError}
                    </p>
                  )
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

            {/* Size */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Size</label>
              <div className="flex gap-2">
                {([
                  { id: "1024x1024", label: "Square" },
                  { id: "1024x1536", label: "Portrait" },
                  { id: "1536x1024", label: "Landscape" },
                ] as const).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => dispatch(setSize(s.id))}
                    disabled={loading}
                    className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
                      size === s.id
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <button
              type="button"
              onClick={() => submit(false, false)}
              disabled={loading || !!captionError || !preview || sessionCapReached || credits === 0}
              className={`w-full py-4 rounded-2xl text-base font-semibold transition-opacity cursor-pointer disabled:cursor-not-allowed ${
                loading || captionError || !preview || sessionCapReached || credits === 0
                  ? "bg-slate-200 text-slate-400"
                  : "bg-indigo-600 text-white hover:opacity-80 active:bg-indigo-700"
              }`}
            >
              {loading ? "Generating…" : "Generate"}
            </button>
            {credits === 0 && (
              <div className="text-center">
                <p className="text-xs text-red-600 font-medium">You have no credits left.</p>
                <a href="/pricing" className="text-xs text-indigo-600 underline underline-offset-2">Buy more credits</a>
              </div>
            )}
            {credits !== 0 && sessionCapReached && (
              <p className="text-center text-xs text-red-600 font-medium">
                Session limit reached ({SESSION_CAP} generations). Close and reopen the tab to continue.
              </p>
            )}
            {credits !== 0 && !sessionCapReached && genRemaining <= 3 && genRemaining > 0 && (
              <p className="text-center text-xs text-amber-600">
                {genRemaining} generation{genRemaining === 1 ? "" : "s"} remaining this session
              </p>
            )}
          </div>
          )} {/* end controls/result conditional */}

          {/* Identical output fallback */}
          {identicalDetected && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm text-amber-800 mb-3">The model returned the same image. Try generating from prompt only.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => submit(false, true)}
                  disabled={loading}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
                >
                  Prompt only
                </button>
                <button
                  onClick={clearSelection}
                  disabled={loading}
                  className="py-3 px-4 border border-slate-300 rounded-xl text-sm text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
