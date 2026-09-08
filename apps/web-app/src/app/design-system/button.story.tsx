import React from "react";

import { DSButton } from "#src/app/design-system/button.js";

export function Contained(): React.ReactNode {
  return <DSButton variant="contained">Start conversion</DSButton>;
}

export function CountsClicks(): React.ReactNode {
  const [clickCount, setClickCount] = React.useState(0);

  return (
    <>
      <DSButton onClick={() => setClickCount((currentCount) => currentCount + 1)}>
        Record click
      </DSButton>
      <form hidden>
        <input data-testid="click-count" readOnly value={String(clickCount)} />
      </form>
    </>
  );
}
