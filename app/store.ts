// app/store.ts

"use client";
import { configureStore } from "@reduxjs/toolkit";
import imageReducer from "./features/imageSlice";
import modelReducer from "./features/modelSlice";

export const store = configureStore({
  reducer: {
    image: imageReducer,
    model: modelReducer,
  },
});

// inferred types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
