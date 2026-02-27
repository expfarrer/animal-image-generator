// app/features/modelSlice.ts
"use client";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ModelStatus = "idle" | "loading" | "ready" | "error";

type State = {
  status: ModelStatus;
};

const modelSlice = createSlice({
  name: "model",
  initialState: { status: "idle" as ModelStatus },
  reducers: {
    setModelStatus(state, action: PayloadAction<ModelStatus>) {
      state.status = action.payload;
    },
  },
});

export const { setModelStatus } = modelSlice.actions;
export default modelSlice.reducer;
