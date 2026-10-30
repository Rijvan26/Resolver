import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "@/app/store";
import App from "@/App";
import "@/styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to locate root element in document");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);

