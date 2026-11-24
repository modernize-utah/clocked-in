import { authenticate } from "@/lib/api/access";
import { createHourlyRate, listHourlyRates, parseCreateHourlyRate } from "@/lib/api/features/hourly-rates";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listHourlyRates(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createHourlyRate(access, id, parseCreateHourlyRate(await readBody(request)));
}, 201);
