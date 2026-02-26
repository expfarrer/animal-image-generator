// app/components/ImageGeneratorForm.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
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
import { resizeImageFile } from "../utils/resizeImage";

/**
 * Replacement component:
 * - stops elapsed timer reliably by writing final elapsed into redux as soon as server responds
 * - when server indicates identical output, shows a "Generate from prompt only" button
 * - when retrying as text-only, passes 'no_image' flag and optional classifier_label
 * - preserves mobile-first layout and dark font tweaks
 */

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
  } = useAppSelector((s) => (s as any).image);

  const [serverModel, setServerModel] = useState<string | null>(null);
  const [serverSizeUsed, setServerSizeUsed] = useState<string | null>(null);
  const [serverSizeNote, setServerSizeNote] = useState<string | null>(null);
  const [serverPromptUsed, setServerPromptUsed] = useState<string | null>(null);
  const [serverImageDimensions, setServerImageDimensions] = useState<string | null>(null);
  const [identicalDetected, setIdenticalDetected] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (preview) {
      try {
        URL.revokeObjectURL(preview);
      } catch {}
    }
    dispatch(setPreview({ url: URL.createObjectURL(f), name: f.name }));
    dispatch(setPredictions(null));
    dispatch(setIsAnimal(null));
    dispatch(setResult({ url: null, latency: null, cost: null }));
    dispatch(setStatus(""));
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
  }

  // client classifier
  useEffect(() => {
    async function runClassifier() {
      if (!preview || !imgRef.current) return;
      dispatch(setStatus("Loading classifier…"));
      try {
        // dynamic import
        // @ts-ignore
        const tf = await import("@tensorflow/tfjs");
        // @ts-ignore
        const mobilenet = await import("@tensorflow-models/mobilenet");
        await tf.ready();
        const model = await mobilenet.load({ version: 2, alpha: 1.0 });
        dispatch(setStatus("Classifying image…"));
        const preds = await model.classify(
          imgRef.current as HTMLImageElement,
          5,
        );
        const normalized = preds.map((p: any) => ({
          className: p.className,
          probability: p.probability,
        }));
        dispatch(setPredictions(normalized));
        const animalKeywords = [
          "dog",
          "cat",
          "bird",
          "horse",
          "sheep",
          "cow",
          "elephant",
          "bear",
          "lion",
          "tiger",
          "zebra",
          "whale",
          "shark",
          "fox",
          "rabbit",
          "hamster",
          "otter",
          "penguin",
          "deer",
          "monkey",
          "panda",
          "camel",
        ];
        const found = normalized.some((m: any) =>
          animalKeywords.some((kw) => m.className.toLowerCase().includes(kw)),
        );
        const top = normalized[0];
        const highConfAnimal =
          top &&
          top.probability > 0.65 &&
          /animal|mammal|canine|feline|bird/i.test(top.className);
        dispatch(setIsAnimal(Boolean(found || highConfAnimal)));
        dispatch(
          setStatus(
            found || highConfAnimal
              ? "Classifier: looks like an animal"
              : "Classifier: did not detect an animal",
          ),
        );
      } catch (err) {
        console.error("classifier error", err);
        dispatch(setStatus("Classifier failed"));
        dispatch(setIsAnimal(null));
      }
    }
    const t = setTimeout(runClassifier, 250);
    return () => clearTimeout(t);
  }, [preview, dispatch]);

  // core submit function: sends image+prompt to server (or no_image on retry)
  async function submit(forceProceed = false, noImage = false) {
    if (!preview && !noImage) {
      dispatch(setStatus("Please select an image"));
      return;
    }
    if (!forceProceed && isAnimal === false && !noImage) {
      const ok = confirm(
        "Classifier did not detect an animal. Proceed anyway?",
      );
      if (!ok) return;
    }

    // map quality to dimension hint (client-side suggestion)
    const sizeMap: Record<string, number> = {
      low: 512,
      medium: 768,
      high: 1024,
    };
    const targetDim = sizeMap[quality] ?? 768;

    dispatch(setLoading(true));
    dispatch(
      setStatus(noImage ? "Generating from prompt..." : "Preparing image..."),
    );
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
    dispatch(setResult({ url: null, latency: null, cost: null }));

    // If we're sending an image, resize first
    let uploadBlob: Blob | null = null;
    let originalFileName = "upload.png";
    if (!noImage) {
      const originalFile = inputRef.current?.files?.[0];
      if (!originalFile) {
        dispatch(setStatus("No file selected"));
        dispatch(setLoading(false));
        return;
      }
      originalFileName = originalFile.name || originalFileName;
      try {
        uploadBlob = await resizeImageFile(
          originalFile,
          targetDim,
          "image/png",
          quality === "low" ? 0.78 : 0.92,
        );
      } catch (err) {
        console.warn("Resize failed, using original", err);
        uploadBlob = originalFile;
      }
    }

    // build form
    const fd = new FormData();
    if (!noImage && uploadBlob)
      fd.append("image", uploadBlob, originalFileName);
    fd.append("topic", topic);
    fd.append("caption", caption || "");
    fd.append("quality", quality);
    fd.append("size", `${targetDim}x${targetDim}`);
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
        const text = await res.text();
        dispatch(setStatus("Error: " + text));
        dispatch(setLoading(false));
        return;
      }

      const json = await res.json();

      // If server informs identical output, display button to retry without image
      if (json.identical) {
        setIdenticalDetected(true);
        setServerModel(json.model_used ?? null);
        setServerSizeUsed(json.size_used ?? null);
        setServerSizeNote(json.size_note ?? null);
        // show message to user (and stop)
        dispatch(
          setStatus(
            "Provider returned identical image. You can try generating from prompt only.",
          ),
        );
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

      // Final status including times
      const providerSec = json.latency_ms
        ? (json.latency_ms / 1000).toFixed(2) + "s"
        : "—";
      dispatch(
        setStatus(
          `Done — total ${(totalElapsedMs / 1000).toFixed(2)}s, provider ${providerSec}`,
        ),
      );
    } catch (err) {
      console.error("submit error", err);
      // ensure timer stopped
      finalizeTimerAndSet(Date.now() - uploadStart);
      dispatch(setStatus("Generation failed"));
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
    dispatch(reset());
    setServerModel(null);
    setServerSizeNote(null);
    setServerSizeUsed(null);
    setServerPromptUsed(null);
    setServerImageDimensions(null);
    setIdenticalDetected(false);
  }

  return (
    <section className="p-4 max-w-lg mx-auto">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-1 text-slate-800">
          Animal Image Generator
        </h2>
        <p className="text-sm text-slate-500 mb-3">
          Upload a photo of an animal and pick a style. Quick paths are provided
          for fast results.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Choose image</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-100 hover:file:bg-slate-200"
              disabled={loading}
            />
          </label>

          {preview && (
            <div className="w-full rounded-md overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center">
              <img
                ref={imgRef}
                src={preview}
                alt="preview"
                className="max-w-full h-auto object-contain"
                style={{ backgroundColor: "#0b1220" }}
              />
            </div>
          )}

          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={topic}
              onChange={(e) => dispatch(setTopic(e.target.value))}
              disabled={loading}
            >
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            <div className="w-36">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={quality}
                onChange={(e) => dispatch(setQuality(e.target.value as any))}
                disabled={loading}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <p className="text-xs text-slate-500 mt-1 leading-tight">
                Low = fastest & cheapest · Medium = balanced quality · High =
                best detail, slower
              </p>
            </div>
          </div>

          <input
            value={caption}
            onChange={(e) => dispatch(setCaption(e.target.value))}
            placeholder="Add keywords or message (ex: 'beloved family companion')"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loading}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => submit(false, false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium ${loading ? "bg-slate-200 text-slate-600" : "bg-indigo-600 text-white"}`}
              disabled={loading}
            >
              {loading ? "Generating…" : "Generate"}
            </button>

            <button
              type="button"
              onClick={clearSelection}
              className="py-2 px-3 rounded-md border text-sm text-slate-700"
              disabled={loading}
            >
              Clear
            </button>
          </div>

          <div className="text-sm text-slate-500">{status}</div>

          {predictions && (
            <div className="bg-slate-50 border rounded-md p-2 text-sm">
              <div className="font-medium text-slate-700">Classifier</div>
              <ul className="text-slate-600 mt-1 space-y-0.5">
                {predictions.map((p: any, i: number) => (
                  <li key={i}>
                    {p.className} — {(p.probability * 100).toFixed(1)}%
                  </li>
                ))}
              </ul>
              <div
                className={`mt-2 text-sm ${isAnimal ? "text-green-600" : "text-red-600"}`}
              >
                {isAnimal
                  ? "Classifier thinks this is an animal"
                  : "Classifier did not detect an animal"}
              </div>
              {!isAnimal && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => submit(true, false)}
                    className="flex-1 py-2 bg-amber-500 text-white rounded-md text-sm"
                    disabled={loading}
                  >
                    Proceed anyway
                  </button>
                  <button
                    onClick={clearSelection}
                    className="py-2 px-3 border rounded-md text-sm"
                    disabled={loading}
                  >
                    Choose another
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Identical output UI */}
          {identicalDetected && (
            <div className="mt-3 p-3 border rounded-md bg-amber-50">
              <div className="text-sm text-amber-800">
                The provider returned an image identical to the uploaded one.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => submit(false, true)}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-md text-sm"
                  disabled={loading}
                >
                  Generate from prompt only
                </button>
                <button
                  onClick={clearSelection}
                  className="py-2 px-3 border rounded-md text-sm text-slate-700"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Result area */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <div>Elapsed: {(elapsedMs / 1000).toFixed(2)} s</div>
              <div>
                Server:{" "}
                {serverLatencyMs != null
                  ? `${(serverLatencyMs / 1000).toFixed(2)} s`
                  : "—"}
              </div>
            </div>

            {resultUrl ? (
              <div className="mt-2 border rounded-md overflow-hidden">
                <div className="bg-slate-900 flex items-center justify-center p-2">
                  <img
                    src={resultUrl}
                    alt="generated"
                    className="max-w-full h-auto object-contain"
                  />
                </div>

                <div className="p-2 text-xs text-slate-600">
                  {serverModel && (
                    <div>
                      Model used: <strong>{serverModel}</strong>
                    </div>
                  )}
                  {serverSizeUsed && (
                    <div>
                      Size used: <strong>{serverSizeUsed}</strong>
                    </div>
                  )}
                  {serverSizeNote && (
                    <div className="text-slate-500 mt-1">
                      Note: {serverSizeNote}
                    </div>
                  )}
                  {serverImageDimensions && (
                    <div>
                      Input dimensions: <strong>{serverImageDimensions}</strong>
                    </div>
                  )}
                  {serverPromptUsed && (
                    <div className="mt-2 p-2 bg-slate-100 rounded text-slate-700 break-words">
                      <span className="font-medium">Prompt sent:</span> {serverPromptUsed}
                    </div>
                  )}
                </div>

                <div className="p-2 flex gap-2">
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center py-2 rounded-md bg-slate-100"
                  >
                    Open
                  </a>
                  <a
                    href={resultUrl}
                    download
                    className="flex-1 text-center py-2 rounded-md bg-slate-100"
                  >
                    Download
                  </a>
                </div>

                <div className="p-2 text-xs text-slate-500">
                  Estimated cost:{" "}
                  {estimatedCost != null ? `$${estimatedCost.toFixed(3)}` : "—"}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-400">No result yet</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
