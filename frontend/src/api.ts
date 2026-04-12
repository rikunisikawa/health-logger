import type {
  EnvDataRecord,
  HealthRecordInput,
  ItemConfig,
  LatestRecord,
  WeeklySummaryResponse,
} from "./types";

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string;

async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_ENDPOINT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(
      (err as { error?: string }).error ?? `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export function createRecord(
  record: HealthRecordInput,
  token: string,
): Promise<{ record_id: string }> {
  return apiFetch("/records", token, {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export function getLatest(
  token: string,
  limit = 10,
): Promise<{ records: LatestRecord[] }> {
  return apiFetch(`/records/latest?limit=${limit}`, token);
}

export function deleteRecord(
  id: string,
  token: string,
): Promise<{ message: string }> {
  return apiFetch(`/records/${id}`, token, { method: "DELETE" });
}

export function getItemConfig(
  token: string,
): Promise<{ configs: ItemConfig[] }> {
  return apiFetch("/items/config", token);
}

export function saveItemConfig(
  configs: ItemConfig[],
  token: string,
): Promise<{ message: string }> {
  return apiFetch("/items/config", token, {
    method: "POST",
    body: JSON.stringify({ configs }),
  });
}

export function getEnvData(
  token: string,
  days = 14,
): Promise<{ records: EnvDataRecord[] }> {
  return apiFetch(`/env-data/latest?days=${days}`, token);
}

export function getWeeklySummary(
  token: string,
  days = 7,
): Promise<WeeklySummaryResponse> {
  return apiFetch(`/summary?days=${days}`, token);
}

export function getStatusRecords(
  token: string,
  dateFrom: string,
  dateTo: string,
  limit = 500,
): Promise<{ records: LatestRecord[] }> {
  return apiFetch(
    `/records/latest?record_type=status&date_from=${dateFrom}&date_to=${dateTo}&limit=${limit}`,
    token,
  );
}
