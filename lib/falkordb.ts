import { FalkorDB } from "falkordb";
import { getEnvironment } from "@/lib/env";

type FalkorConnection = Awaited<ReturnType<typeof FalkorDB.connect>>;

declare global {
  // Keep one connection while Next.js reloads server code in development.
  var shortageBridgeDatabase: Promise<FalkorConnection> | undefined;
}

function connect() {
  const environment = getEnvironment();
  const credentials = {
    ...(environment.FALKORDB_USERNAME ? { username: environment.FALKORDB_USERNAME } : {}),
    ...(environment.FALKORDB_PASSWORD ? { password: environment.FALKORDB_PASSWORD } : {}),
  };

  if (environment.FALKORDB_URL) {
    return FalkorDB.connect({
      url: environment.FALKORDB_URL,
      ...credentials,
      socket: {
        connectTimeout: 10_000,
        ...(environment.FALKORDB_TLS ? { tls: true } : {}),
      },
    });
  }

  return FalkorDB.connect({
    host: environment.FALKORDB_HOST,
    port: environment.FALKORDB_PORT,
    ...credentials,
    socket: { tls: environment.FALKORDB_TLS, connectTimeout: 10_000 },
  });
}

export async function getGraph() {
  try {
    global.shortageBridgeDatabase ??= connect();
    const database = await global.shortageBridgeDatabase;
    return database.selectGraph(getEnvironment().FALKORDB_GRAPH);
  } catch (error) {
    // A database may start after the app. Do not permanently retain a failed connection.
    global.shortageBridgeDatabase = undefined;
    throw error;
  }
}

export async function checkGraphConnection() {
  const graph = await getGraph();
  const result = await graph.roQuery<{ ok: number }>("RETURN 1 AS ok");
  return result.data?.[0]?.ok === 1;
}
