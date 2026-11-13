export type PolicyViolationData = Readonly<{
  message: string;
  path?: string;
}>;

export class PolicyViolation extends Error {
  readonly violations: readonly PolicyViolationData[];

  constructor(violations: readonly PolicyViolationData[]) {
    super(
      Array.from(
        Map.groupBy(violations, ({ message }) => message),
        ([message, groupedViolations]) => {
          const paths = [...new Set(groupedViolations.map(({ path }) => path).filter(path => path !== undefined))].sort();
          return [message, ...(paths.length ? ["Paths:", ...paths.map(path => `- ${JSON.stringify(path)}`)] : [])].join("\n");
        },
      ).join("\n\n"),
    );
    this.name = "PolicyViolation";
    this.violations = [...violations];
  }
}
