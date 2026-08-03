import { log } from "../utils/log";

const ENV_PATH = ".env";

export interface RefreshTokenResponse {
  data?: {
    token?: string;
    access_token?: string;
    eipoToken?: string;
  };
  token?: string;
  access_token?: string;
}

/**
 * Memperbarui Bearer Token Stockbit menggunakan Refresh Token (`eipoRefreshToken`)
 */
export async function refreshStockbitToken(): Promise<string> {
  const refreshToken = process.env.STOCKBIT_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error(
      "STOCKBIT_REFRESH_TOKEN belum diatur di file .env! Salin nilai 'eipoRefreshToken' dari Local Storage Stockbit.",
    );
  }

  log(
    "info",
    "[Auth] Meminta Bearer Token baru menggunakan eipoRefreshToken...",
  );

  // Endpoint refresh resmi Stockbit Exodus
  const url = "https://exodus.stockbit.com/login/refresh";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshToken}`,
      Origin: "https://stockbit.com",
      Referer: "https://stockbit.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gagal refresh token: HTTP ${response.status} ${response.statusText}. eipoRefreshToken mungkin sudah kadaluwarsa (Silakan login ulang di browser).`,
    );
  }

  const json = (await response.json()) as RefreshTokenResponse;

  // Ekstrak access token baru dari payload response Stockbit
  const newToken =
    json.data?.token ||
    json.data?.access_token ||
    json.data?.eipoToken ||
    json.token ||
    json.access_token;

  if (!newToken) {
    throw new Error(
      "Response API Stockbit tidak mengembalikan token baru yang valid.",
    );
  }

  log("info", "[Auth] ✅ Berhasil memperbarui Bearer Token Stockbit!");

  // 1. Update runtime environment
  process.env.STOCKBIT_BEARER_TOKEN = newToken;

  // 2. Tulis ulang nilai baru ke file .env secara permanen
  await updateEnvFile("STOCKBIT_BEARER_TOKEN", newToken);

  return newToken;
}

/**
 * Helper internal untuk memperbarui nilai variabel di file .env (Bun Native File API)
 */
async function updateEnvFile(key: string, value: string): Promise<void> {
  try {
    const file = Bun.file(ENV_PATH);
    if (await file.exists()) {
      let content = await file.text();
      const regex = new RegExp(`^${key}=.*$`, "m");

      if (regex.test(content)) {
        content = content.replace(regex, `${key}="${value}"`);
      } else {
        content += `\n${key}="${value}"`;
      }

      await Bun.write(ENV_PATH, content);
      log("info", `[Auth] ${key} berhasil diperbarui di file .env.`);
    }
  } catch (error: any) {
    log("error", `[Auth] Gagal memperbarui file .env: ${error.message}`);
  }
}
