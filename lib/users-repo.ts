import { randomUUID } from "crypto";
import { getJson, putJson } from "@/lib/s3";

const INDEX_KEY = "users/index.json";

export type UserRecord = {
  id: string;
  login: string;
  passwordHash: string;
  createdAt: string;
};

type UsersIndex = {
  byLogin: Record<string, UserRecord>;
  byId: Record<string, UserRecord>;
};

async function readIndex(): Promise<UsersIndex> {
  return (await getJson<UsersIndex>(INDEX_KEY)) ?? { byLogin: {}, byId: {} };
}

async function writeIndex(index: UsersIndex): Promise<void> {
  await putJson(INDEX_KEY, index);
}

export async function findByLogin(login: string): Promise<UserRecord | null> {
  const index = await readIndex();
  return index.byLogin[login.toLowerCase()] ?? null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  const index = await readIndex();
  return index.byId[id] ?? null;
}

export async function createUser(login: string, passwordHash: string): Promise<UserRecord> {
  const index = await readIndex();
  const key = login.toLowerCase();
  if (index.byLogin[key]) {
    throw new Error(`Логин "${login}" уже занят`);
  }
  const record: UserRecord = {
    id: randomUUID(),
    login: key,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  index.byLogin[key] = record;
  index.byId[record.id] = record;
  await writeIndex(index);
  return record;
}
