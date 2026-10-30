import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
}

const getInitialTheme = (): "light" | "dark" | "system" => {
  const saved = localStorage.getItem("resolver_theme");
  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }
  return "system";
};

const initialState: UiState = {
  sidebarOpen: true,
  theme: getInitialTheme(),
};

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setTheme: (state, action: PayloadAction<"light" | "dark" | "system">) => {
      state.theme = action.payload;
      localStorage.setItem("resolver_theme", action.payload);

      // Apply to documentElement
      if (action.payload === "dark") {
        document.documentElement.classList.add("dark");
      } else if (action.payload === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    },
  },
});

export const { toggleSidebar, setSidebarOpen, setTheme } = uiSlice.actions;
export default uiSlice.reducer;

