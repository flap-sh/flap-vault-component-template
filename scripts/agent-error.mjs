export function agentFailure({ code, message, fixHint, nextActions, extra = {} }) {
  const actions =
    nextActions && nextActions.length
      ? nextActions
      : [
          {
            ruleId: code,
            severity: "blocking",
            fixHint,
          },
        ];

  return {
    ok: false,
    code,
    error: message,
    fixHint,
    agent: {
      verdict: "fix-blocking",
      nextActions: actions,
    },
    ...extra,
  };
}

export function failAgent(options) {
  console.error(JSON.stringify(agentFailure(options), null, 2));
  process.exit(1);
}
