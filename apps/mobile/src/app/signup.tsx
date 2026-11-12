import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api } from "@/api/client";
import { AuthFrame } from "@/auth-frame";
import { useSession } from "@/session";
import { Button, ErrorText, Field } from "@/ui";

export default function SignUpScreen() {
  const { status, start } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (status === "password") return <Redirect href="/password" />;
  if (status === "ready") return <Redirect href="/log" />;

  const ready = firstName.trim() && lastName.trim() && email.includes("@") && username.trim().length >= 3 && password.length >= 8;

  return (
    <AuthFrame description="Create an account, then join or start an organization." title="Sign up">
      <Field autoCapitalize="words" label="First name" onChangeText={setFirstName} value={firstName} />
      <Field autoCapitalize="words" label="Last name" onChangeText={setLastName} value={lastName} />
      <Field autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} />
      <Field autoCapitalize="none" autoComplete="username" label="Username" onChangeText={setUsername} value={username} />
      <Field label="Password" onChangeText={setPassword} secureTextEntry value={password} />
      <ErrorText error={error} />
      <Button
        disabled={!ready}
        label="Create account"
        onPress={() => {
          setPending(true);
          setError(null);
          api
            .signUp({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              username: username.trim(),
              password,
            })
            .then((session) => start(session))
            .catch(setError)
            .finally(() => setPending(false));
        }}
        pending={pending}
        size="lg"
      />
      <Link href="/login">
        <Text>Already have an account? Sign in</Text>
      </Link>
    </AuthFrame>
  );
}
