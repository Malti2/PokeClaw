import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { isLoggedIn, login } from "poke";
import { CONFIG_PATH, setConfigValue } from "../config";
import { theme } from "./theme";
import { Spinner } from "./components/Spinner";

/**
 * Validate a pasted API key. Returns an error message, or null when the key
 * looks usable. Exported for tests.
 */
export function validateApiKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) return "Please paste your API key.";
  if (key.startsWith("pk_")) {
    return "That looks like a V1 key (pk_…). pokeclaw needs a V2 Kitchen key.";
  }
  if (key.length < 16) return "That key looks too short. Please check and paste again.";
  return null;
}

type Phase = "welcome" | "key" | "account" | "done";

const CARD_WIDTH = 62;

function WelcomeStep() {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text bold color={theme.brand}>
        <Text>🌴 pokeclaw</Text>
      </Text>
      <Box marginTop={1}>
        <Text dimColor>Terminal coding assistant · powered by Poke</Text>
      </Box>
      <Box marginTop={2} flexDirection="column">
        <Text>Setup takes about a minute:</Text>
        <Box marginTop={1} flexDirection="column" paddingLeft={2}>
          <Text>
            <Text color={theme.brand} bold>1 · </Text>
            <Text>Paste your V2 API key</Text>
          </Text>
          <Text>
            <Text color={theme.brand} bold>2 · </Text>
            <Text>Connect your Poke account (one-time, for the tool tunnel)</Text>
          </Text>
          <Text>
            <Text color={theme.brand} bold>3 · </Text>
            <Text>Start coding</Text>
          </Text>
        </Box>
      </Box>
      <Box marginTop={2}>
        <Text bold color={theme.success}>
          Press Enter to continue
        </Text>
      </Box>
    </Box>
  );
}

function KeyStep({ value, error }: { value: string; error: string | null }) {
  return (
    <Box flexDirection="column">
      <Text bold>
        <Text>🌴 </Text>
        <Text>Connect your API key</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Get a V2 key (Kitchen → API keys):</Text>
        <Text color={theme.brand}>https://poke.com/kitchen/api-keys</Text>
      </Box>
      <Box marginTop={1} borderStyle="round" borderColor={error ? theme.error : theme.dim} paddingX={1}>
        <Text>
          <Text color={theme.success} bold>› </Text>
          {value.length === 0 ? (
            <Text dimColor>paste key here…</Text>
          ) : (
            <Text>{"•".repeat(value.length)}</Text>
          )}
          <Text color={theme.success}>▌</Text>
        </Text>
      </Box>
      <Box marginTop={1} minHeight={1}>
        {error ? (
          <Text color={theme.error}>✗ {error}</Text>
        ) : (
          <Text dimColor>Enter to confirm · Esc to go back · input is hidden</Text>
        )}
      </Box>
    </Box>
  );
}

function AccountStep({
  info,
  error,
}: {
  info: { userCode: string; loginUrl: string } | null;
  error: string | null;
}) {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text bold>
        <Text>🌴 </Text>
        <Text>Connect your Poke account</Text>
      </Text>
      <Box marginTop={1}>
        <Text dimColor>The tool tunnel needs a one-time login — your browser should open.</Text>
      </Box>
      {info ? (
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text dimColor>Open this page and enter the code:</Text>
          <Text color={theme.brand}>{info.loginUrl}</Text>
          <Box marginTop={1} borderStyle="round" borderColor={theme.brand} paddingX={4} paddingY={1}>
            <Text bold>{info.userCode}</Text>
          </Box>
          <Box marginTop={1}>
            <Spinner label="Waiting for approval…" />
          </Box>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Spinner label={error ? "Retrying…" : "Preparing login…"} />
        </Box>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color={theme.error}>✗ {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>{error ? "Enter to retry · " : ""}Esc to go back</Text>
      </Box>
    </Box>
  );
}

function DoneStep() {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text bold color={theme.success}>
        ✓ All set
      </Text>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>API key saved · Poke account connected</Text>
        <Text dimColor>Key stored in {CONFIG_PATH} (0600)</Text>
      </Box>
      <Box marginTop={2}>
        <Text>
          <Text>🌴 </Text>
          <Text dimColor>Starting pokeclaw…</Text>
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Fullscreen first-start onboarding. Rendered as a screen inside the single
 * Ink root (no separate render/unmount cycle). Calls onComplete once the key
 * is validated and saved.
 */
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { stdout } = useStdout();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<{ userCode: string; loginUrl: string } | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginAttempt, setLoginAttempt] = useState(0);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(onComplete, 1100);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  // Device login for the tool tunnel (skipped when already logged in).
  useEffect(() => {
    if (phase !== "account") return;
    let cancelled = false;
    setLoginInfo(null);
    setLoginError(null);
    (async () => {
      try {
        if (!isLoggedIn()) {
          await login({
            openBrowser: true,
            onCode: (info) => {
              if (!cancelled) setLoginInfo(info);
            },
          });
        }
        if (!cancelled) {
          setLoginInfo(null);
          setPhase("done");
        }
      } catch (e) {
        if (!cancelled) {
          setLoginInfo(null);
          setLoginError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, loginAttempt]);

  useInput((input, key) => {
    if (phase === "welcome") {
      if (key.return) setPhase("key");
      return;
    }
    if (phase === "account") {
      if (key.escape) {
        setPhase("key");
        return;
      }
      if (key.return && loginError) {
        setLoginError(null);
        setLoginAttempt((a) => a + 1);
      }
      return;
    }
    if (phase === "key") {
      if (key.escape) {
        setPhase("welcome");
        setValue("");
        setError(null);
        return;
      }
      if (key.return) {
        const problem = validateApiKey(value);
        if (problem) {
          setError(problem);
          return;
        }
        try {
          setConfigValue("apiKey", value.trim());
        } catch {
          setError("Could not save the key. Check write permissions and try again.");
          return;
        }
        setError(null);
        setPhase("account");
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        setError(null);
        return;
      }
      if (key.ctrl && input === "u") {
        setValue("");
        setError(null);
        return;
      }
      if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        return;
      }
      setValue((v) => v + input);
      if (error) setError(null);
      return;
    }
    // "done" — ignore input while transitioning.
  });

  const height = stdout?.rows ? Math.max(stdout.rows - 2, 10) : undefined;

  return (
    <Box flexDirection="column" height={height} justifyContent="center" alignItems="center">
      <Box
        borderStyle="round"
        borderColor={theme.brand}
        paddingX={4}
        paddingY={2}
        width={CARD_WIDTH}
        flexDirection="column"
      >
        {phase === "welcome" && <WelcomeStep />}
        {phase === "key" && <KeyStep value={value} error={error} />}
        {phase === "account" && <AccountStep info={loginInfo} error={loginError} />}
        {phase === "done" && <DoneStep />}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>pokeclaw · your key never leaves this machine except to talk to Poke</Text>
      </Box>
    </Box>
  );
}
