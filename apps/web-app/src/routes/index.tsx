import { createFileRoute } from "@tanstack/react-router";
import React from "react";

import { MainSection } from "#src/app/components/main-components.js";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage(): React.JSX.Element {
  return (
    <MainSection>
      <h1>Create Audiobook from URL</h1>
      <p>Turn a real source page into a synchronized audiobook with narrated MP3 and EPUB files.</p>
      <p>
        Explore the implementation on{" "}
        <a href="https://github.com/patricktree/create-audiobook-from-url">GitHub</a>.
      </p>
      <p>
        Conversions are available only through a supplied trial link - reach out to{" "}
        <a href="mailto:patrick.kerschbaum@gmail.com">patrick.kerschbaum@gmail.com</a> to get one!
      </p>
    </MainSection>
  );
}
