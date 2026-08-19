import "./global.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { RendererApplication } from "./app/RendererApplication";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    <RendererApplication />
  </React.StrictMode>,
);
