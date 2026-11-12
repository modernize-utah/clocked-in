import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { AuthFrame } from "@/auth-frame";
import { useSession } from "@/session";
import { Button, ErrorText, Field } from "@/ui";

export default function LoginScreen() {
  const { status, login } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (status === "password") return <Redirect href="/password" />;
  if (status === "ready") return <Redirect href="/log" />;

  const submit = () => {
    if (username.trim().length < 3 || password.length < 8) return;
    setPending(true);
    setError(null);
    login(username, password)
      .catch(setError)
      .finally(() => setPending(false));
  };

  return (
    <AuthFrame description="Sign in to log hours for every organization you belong to." title="Sign in">
      <Field autoComplete="username" label="Username" onChangeText={setUsername} returnKeyType="next" value={username} />
      <Field label="Password" onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go" secureTextEntry value={password} />
      <ErrorText error={error} />
      <Button disabled={username.trim().length < 3 || password.length < 8} label="Sign in" onPress={submit} pending={pending} size="lg" />
      <Link href="/signup">
        <Text>Create an account</Text>
      </Link>
      <Link href="/forgot">
        <Text>Forgot password</Text>
      </Link>
      <Link href="/accept">
        <Text>Accept an invite</Text>
      </Link>
    </AuthFrame>
  );
}
