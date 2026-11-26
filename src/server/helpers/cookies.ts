import type { NextApiResponse } from "next";

export const SESSION_COOKIE = "plant_data_user";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

function sessionCookieHeader(value: string, maxAge: number, secure: boolean): string {
	const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
	parts.push(`Max-Age=${maxAge}`);
	if (secure) {
		parts.push("Secure");
	}
	return parts.join("; ");
}

export function setSessionCookie(res: NextApiResponse | undefined, userId: string, secure: boolean): void {
	res?.setHeader("Set-Cookie", sessionCookieHeader(userId, THIRTY_DAYS_IN_SECONDS, secure));
}

export function clearSessionCookie(res: NextApiResponse | undefined, secure: boolean): void {
	res?.setHeader("Set-Cookie", sessionCookieHeader("", 0, secure));
}
