import { Redirect } from "expo-router";
import { useSession } from "@/session";
import { Loading } from "@/ui";

export default function Index() {
  const { status } = useSession();
  if (status === "loading") return <Loading />;
  if (status === "signedOut") return <Redirect href="/login" />;
  if (status === "password") return <Redirect href="/password" />;
  return <Redirect href="/log" />;
}
