/** Maps component props to required, non-nullable `data-*` attributes with matching names. */
export type MapPropsToRequiredDataAttributeProps<Props extends object> = {
  [PropName in keyof Props as `data-${Extract<PropName, string>}`]-?: NonNullable<Props[PropName]>;
};
