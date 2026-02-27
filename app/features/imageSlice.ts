// app/features/imageSlice.ts
"use client";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type Prediction = { className: string; probability: number };

type State = {
  preview: string | null;
  fileName: string | null;
  topic: string;
  caption: string;
  quality: "low" | "medium" | "high";
  size: "1024x1024" | "1024x1536" | "1536x1024";
  loading: boolean;
  status: string;
  predictions: Prediction[] | null;
  isAnimal: boolean | null;
  resultUrl: string | null;
  serverLatencyMs: number | null;
  estimatedCost: number | null;
  elapsedMs: number;
};

const initialState: State = {
  preview: null,
  fileName: null,
  topic: "celebration",
  caption: "",
  quality: "medium",
  size: "1024x1024",
  loading: false,
  status: "",
  predictions: null,
  isAnimal: null,
  resultUrl: null,
  serverLatencyMs: null,
  estimatedCost: null,
  elapsedMs: 0,
};

const slice = createSlice({
  name: "image",
  initialState,
  reducers: {
    setPreview(
      state,
      action: PayloadAction<{ url: string | null; name?: string | null }>,
    ) {
      state.preview = action.payload.url ?? null;
      state.fileName = action.payload.name ?? null;
    },
    setTopic(state, action: PayloadAction<string>) {
      state.topic = action.payload;
    },
    setCaption(state, action: PayloadAction<string>) {
      state.caption = action.payload;
    },
    setQuality(state, action: PayloadAction<State["quality"]>) {
      state.quality = action.payload;
    },
    setSize(state, action: PayloadAction<State["size"]>) {
      state.size = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setStatus(state, action: PayloadAction<string>) {
      state.status = action.payload;
    },
    setPredictions(state, action: PayloadAction<Prediction[] | null>) {
      state.predictions = action.payload;
    },
    setIsAnimal(state, action: PayloadAction<boolean | null>) {
      state.isAnimal = action.payload;
    },
    setResult(
      state,
      action: PayloadAction<{
        url: string | null;
        latency?: number | null;
        cost?: number | null;
      }>,
    ) {
      state.resultUrl = action.payload.url ?? null;
      state.serverLatencyMs = action.payload.latency ?? null;
      state.estimatedCost = action.payload.cost ?? null;
    },
    setElapsed(state, action: PayloadAction<number>) {
      state.elapsedMs = action.payload;
    },
    reset(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
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
} = slice.actions;

export default slice.reducer;
