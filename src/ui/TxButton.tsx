import { Button, type ButtonProps } from "./Button";

export type TxButtonState = "idle" | "validating" | "approving" | "approval_confirming" | "simulating" | "writing" | "confirming" | "success" | "failed";

const labels: Record<TxButtonState, string> = {
  idle: "",
  validating: "Validating",
  approving: "Approving",
  approval_confirming: "Confirming approval",
  simulating: "Simulating",
  writing: "Sending",
  confirming: "Confirming",
  success: "Done",
  failed: "Retry",
};

interface TxButtonProps extends ButtonProps {
  state?: TxButtonState;
  idleLabel: string;
}

export function TxButton({ state = "idle", idleLabel, children, ...props }: TxButtonProps) {
  const loading = ["validating", "approving", "approval_confirming", "simulating", "writing", "confirming"].includes(state);
  return (
    <Button loading={loading} {...props}>
      {children || labels[state] || idleLabel}
    </Button>
  );
}
