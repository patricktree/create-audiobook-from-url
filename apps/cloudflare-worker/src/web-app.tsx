import React from "react";
import ReactDOM from "react-dom/client";

import { WebApp } from "@create-audiobook-from-url/web-app/main";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Expected #root element to exist.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebApp />
  </React.StrictMode>,
);
