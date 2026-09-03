import { css } from "@linaria/core";

/** {@link https://courses.joshwcomeau.com/css-for-js/02-rendering-logic-2/18-hidden-content} */
export const visuallyHidden = css`
  position: absolute;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  height: 1px;
  width: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
`;

export const composeClassnames = (...classNames: (string | undefined)[]) => {
  return classNames.filter((elem) => elem).join(" ");
};
