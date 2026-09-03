/** Indicates that a conversion exists but is not in the state required by an operation. */
export class ConversionConflictError extends Error {
  constructor(...params: ConstructorParameters<typeof Error>) {
    super(...params);
    this.name = "ConversionConflictError";
  }
}
