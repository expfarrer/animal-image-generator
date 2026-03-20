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
  const [downloadCooldown, setDownloadCooldown] = useState<boolean>(false);

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
    let classifierFailed = false; // true when classifier errored/timed out (not just non-animal)

    if (modelStatus === "error") {
      // Classifier failed to load — fail-closed: block all uploads.
      classifierFailed = true;
      detected = false;
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
        // Fail-closed: classifier timeout or error → block the upload.
        console.error("[classifier] error (fail-closed):", err);
        classifierFailed = true;
        detected = false;
      }

      removeToast(uploadToastId);
    }

    if (!detected) {
      URL.revokeObjectURL(tempUrl);
      if (inputRef.current) inputRef.current.value = "";
      resizedBlobRef.current = null;
      addToast(
        classifierFailed
          ? "Image classifier unavailable — please try again in a moment."
          : "No animal detected. Please upload a photo of a pet or animal.",
        "error",
      );
      dispatch(setPredictions(predictions.length > 0 ? predictions : null));
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
    // Hard gate: image must have passed animal classification before we proceed.
    if (!noImage && isAnimal !== true) {
      dispatch(setStatus("Please upload an animal or pet photo"));
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
    // Server-side enforcement: signal that this image passed animal classification.
    // Only set for image uploads (not text-only), and only when isAnimal === true.
    if (!noImage && isAnimal === true) fd.append("animal_approved", "1");

    startTimer();
    const uploadStart = Date.now();
    const clientController = new AbortController();
    const clientTimeoutId = setTimeout(() => clientController.abort(), 60_000);
    try {
      dispatch(setStatus(noImage ? "Uploading prompt..." : "Uploading image+prompt..."));
      const res = await fetch("/api/generate-image", {
        method: "POST",
        body: fd,
        signal: clientController.signal,
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
      removeToast(genToastId);
      finalizeTimerAndSet(Date.now() - uploadStart);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      if (isTimeout) {
        trackEvent("generate_failed", {
          upload_id: uploadIdRef.current,
          duration_ms: Date.now() - uploadStart,
          failure_stage: "timeout",
        });
        addToast("Generation timed out. Your credit has been refunded.", "error");
        fetch("/api/credits").then((r) => r.json()).then((data) => {
          if (typeof data.credits === "number") setCredits(data.credits);
        }).catch(() => {});
      } else {
        console.error("submit error", err);
        addToast("Generation failed. Please try again.", "error");
        trackEvent("generate_failed", {
          upload_id: uploadIdRef.current,
          duration_ms: Date.now() - uploadStart,
          failure_stage: "network",
        });
      }
    } finally {
      clearTimeout(clientTimeoutId);
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
    setDownloadCooldown(false);
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
    setDownloadCooldown(false);
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

  // Keeps current photo and optionally preselects a theme — clears result but preserves upload.
  function exploreStylesKeepImage(themeId?: string) {
    dispatch(setResult({ url: null, latency: null, cost: null }));
    clearPersistedResult();
    if (themeId) dispatch(setTopic(themeId));
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
    setDownloadCooldown(false);
  }

  function handleDownloadWithCooldown() {
    if (downloadCooldown) return;
    setDownloadCooldown(true);
    setTimeout(() => setDownloadCooldown(false), 3000);
    trackEvent("download_clicked", { upload_id: uploadIdRef.current });
  }

  function handleFacebookShare() {
    const url = encodeURIComponent(window.location.href);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      "_blank",
      "width=600,height=400",
    );
  }

  function handleTwitterShare() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent("Check out this animal portrait I just created!");
    window.open(
      `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      "_blank",
      "width=600,height=400",
    );
  }

  function handleInstagramShare() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = buildDownloadFilename(predictions, resultMimeFromUrl(resultUrl));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast("Image downloaded — open Instagram to share!", "info");
  }

  // What to show in the image area: original toggle → result → preview
  const displayUrl = resultUrl && showOriginal ? preview : (resultUrl || preview);

  const resultHeadline = THEME_RESULT_HEADLINES[topic] ?? "Your Image is Ready";
  const resultSubline = elapsedMs
    ? `Generated in ${(elapsedMs / 1000).toFixed(1)}s`
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
              {credits !== null && (
                <span className="inline-flex items-center mt-2 bg-white rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm whitespace-nowrap">
                  {credits} credit{credits === 1 ? "" : "s"} left
                </span>
              )}
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

          {resultUrl && !loading ? (
            /* ── Result view ── */
            <div className="flex flex-col gap-3">

              {/* Primary: Download HD */}
              <a
                href={resultUrl}
                download={buildDownloadFilename(predictions, resultMimeFromUrl(resultUrl ?? ""))}
                onClick={(e) => {
                  if (downloadCooldown) { e.preventDefault(); return; }
                  handleDownloadWithCooldown();
                }}
                className={`w-full text-center block py-4 rounded-2xl text-base font-semibold shadow-sm transition-opacity ${
                  downloadCooldown
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed pointer-events-none"
                    : "bg-emerald-600 text-white hover:opacity-80 active:bg-emerald-700 cursor-pointer"
                }`}
              >
                {downloadCooldown ? "Downloaded!" : "Download HD"}
              </a>

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

              {/* Explore styles with this image */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-slate-900 mb-0.5">Explore styles with this image</p>
                <p className="text-xs text-slate-400 mb-3">Keep your photo, switch the style</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {EXPLORE_STYLES.map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      onClick={() => exploreStylesKeepImage(style.key === "more" ? undefined : style.key)}
                      className="py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
                >
                  Upload a new photo
                </button>
              </div>

              {/* Share */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <p className="text-sm font-semibold text-slate-900 mb-3">Share Your Image</p>
                <div className="flex gap-3 justify-center mb-3">
                  {/* Facebook */}
                  <button
                    type="button"
                    onClick={handleFacebookShare}
                    title="Share on Facebook"
                    className="w-16 h-16 rounded-2xl bg-[#1877F2] flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </button>
                  {/* X (Twitter) */}
                  <button
                    type="button"
                    onClick={handleTwitterShare}
                    title="Share on X"
                    className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </button>
                  {/* Instagram */}
                  <button
                    type="button"
                    onClick={handleInstagramShare}
                    title="Share on Instagram (downloads image)"
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#dc2743] flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </button>
                </div>
                {resultUrl && !resultUrl.startsWith("data:") && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {copied ? "Link Copied ✓" : "Copy Link"}
                  </button>
                )}
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
              <textarea
                value={caption}
                rows={2}
                maxLength={MAX_CAPTION_LENGTH}
                onChange={(e) => {
                  dispatch(setCaption(e.target.value));
                  const word = containsBlockedTerm(e.target.value);
                  setBlockedWord(word);
                  setCaptionError(word ? "Inappropriate content detected." : null);
                }}
                placeholder="Describe the look you want, e.g. golden light, garden, beloved family companion"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 resize-none ${captionError ? "border-red-400 focus:ring-red-400" : "border-slate-200 focus:ring-indigo-500"}`}
                disabled={loading}
              />
              <div className="mt-1 flex justify-between items-start">
                {captionError
                  ? (
                    <p className="text-xs text-red-600">
                      {blockedWord
                        ? <>Contains: <span className="bg-red-100 text-red-700 font-medium px-1 rounded">{blockedWord}</span> — please remove it</>
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
              disabled={loading || !!captionError || !preview || sessionCapReached || credits === 0 || isAnimal !== true}
              className={`w-full py-4 rounded-2xl text-base font-semibold transition-opacity cursor-pointer disabled:cursor-not-allowed ${
                loading || captionError || !preview || sessionCapReached || credits === 0 || isAnimal !== true
                  ? "bg-slate-200 text-slate-400"
                  : "bg-emerald-600 text-white hover:opacity-80 active:bg-emerald-700"
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

          {/* Bottom info bar — classifier confidence */}
          {predictions && predictions.length > 0 && (
            <div className="flex items-center justify-center pb-2">
              <span className={`text-xs ${isAnimal ? "text-green-600" : "text-red-500"}`}>
                {predictions[0].className.split(",")[0]} · {(predictions[0].probability * 100).toFixed(0)}% confidence
              </span>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
