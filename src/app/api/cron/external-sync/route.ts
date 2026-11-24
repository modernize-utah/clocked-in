import { connection } from "next/server";
import { runPortalDirectoryCron } from "@/lib/api/features/external-sync";

export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runPortalDirectoryCron();
  return Response.json(result);
}
