import { Link } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api } from "@/api/client";
import { AuthFrame } from "@/auth-frame";
import { Button, ErrorText, Field, Muted } from "@/ui";

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <AuthFrame description="We'll email a code if an account uses this address." title="Forgot password">
      {done ? <Muted>Password updated. Sign in with the new password.</Muted> : null}
      {step === "email" ? (
        <Field autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} />
      ) : (
        <>
          <Field autoCapitalize="none" label="Code" onChangeText={setCode} value={code} />
          <Field label="New password" onChangeText={setPassword} secureTextEntry value={password} />
        </>
      )}
      <ErrorText error={error} />
      <Button
        disabled={step === "email" ? !email.includes("@") : code.trim().length < 4 || password.length < 8}
        label={step === "email" ? "Send code" : "Set password"}
        onPress={() => {
          setPending(true);
          setError(null);
          const action =
            step === "email"
              ? api.requestPasswordReset(email.trim()).then(() => setStep("code"))
              : api.confirmPasswordReset({ email: email.trim(), code: code.trim(), password }).then(() => setDone(true));
          action.catch(setError).finally(() => setPending(false));
        }}
        pending={pending}
        size="lg"
      />
      <Link href="/login">
        <Text>Back to sign in</Text>
      </Link>
    </AuthFrame>
  );
}
