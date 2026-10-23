"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import type { VaultLaunchConfigComponentProps } from "@/src/sdk";
import { Alert, Card, CardContent, CardHeader, CardTitle, Input, StatusBadge } from "@/src/ui";

const MIN_BURN_AMOUNT = 100n;
const MAX_BURN_AMOUNT = 1_000_000n;

function message(messages: Record<string, string>, key: string) {
  return messages[key] ?? key;
}

export default function ExampleLaunchConfig({
  context,
  messages,
  onChange,
}: VaultLaunchConfigComponentProps) {
  const [amount, setAmount] = useState("10000");
  const parsedAmount = useMemo(() => (/^\d+$/.test(amount) ? BigInt(amount) : null), [amount]);
  const isValid =
    parsedAmount !== null &&
    parsedAmount >= MIN_BURN_AMOUNT &&
    parsedAmount <= MAX_BURN_AMOUNT;

  useEffect(() => {
    if (!isValid) {
      onChange({ status: "invalid", errors: [message(messages, "launchConfig.errors.range")] });
      return;
    }

    onChange({
      status: "valid",
      values: {
        minBurnAmount: parseUnits(amount, 18).toString(),
      },
      summary: [
        {
          label: message(messages, "launchConfig.summary.minimumBurn"),
          value: `${amount} ${context.tokenSymbol || message(messages, "launchConfig.labels.tokens")}`,
        },
      ],
    });
  }, [amount, context.tokenSymbol, isValid, messages, onChange]);

  return (
    <div className="w-full space-y-3" data-flap-launch-config="true">
      <Card className="overflow-hidden rounded-[14px] border-white/10 bg-gradient-to-b from-[#111821] to-[#080c12]">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-base sm:text-lg">
                {message(messages, "launchConfig.title")}
              </CardTitle>
              <p className="max-w-2xl text-sm leading-6 text-[#7c8899]">
                {message(messages, "launchConfig.description")}
              </p>
            </div>
            <StatusBadge tone={isValid ? "success" : "warning"}>
              {message(messages, isValid ? "launchConfig.states.ready" : "launchConfig.states.invalid")}
            </StatusBadge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-white/70">
              {message(messages, "launchConfig.labels.minimumBurn")}
            </span>
            <Input
              name="minBurnAmount"
              data-launch-config-unit="human"
              value={amount}
              inputMode="numeric"
              onChange={(event) => setAmount(event.target.value)}
              placeholder={message(messages, "launchConfig.placeholders.minimumBurn")}
              aria-invalid={!isValid}
            />
            <span className="block text-xs leading-5 text-white/45">
              {message(messages, "launchConfig.hints.minimumBurn")}
            </span>
          </label>

          {!isValid ? (
            <Alert tone="warning">{message(messages, "launchConfig.errors.range")}</Alert>
          ) : (
            <Alert tone="info">{message(messages, "launchConfig.notices.hostEncoding")}</Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
