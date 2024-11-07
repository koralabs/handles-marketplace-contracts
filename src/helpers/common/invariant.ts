const prefix: string = "Invariant failed";

const invariant: (
  condition: any,
  message?: string | (() => string)
) => asserts condition = (condition, message?: string | (() => string)) => {
  if (condition) {
    return;
  }

  const provided: string | undefined =
    typeof message === "function" ? message() : message;

  const value: string = provided ? `${prefix}: ${provided}` : prefix;
  throw new Error(value);
};

export { invariant };
