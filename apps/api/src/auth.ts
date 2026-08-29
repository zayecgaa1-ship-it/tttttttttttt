import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../../../packages/db/src/client.js";

export type WebUser = { userId: string; displayName: string; avatarUrl?: string; roles: string[] };
export class HttpError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}
const sessionCookie = "zark_session";
const stateCookie = "zark_oauth_state";

export async function registerDiscordAuth(app: FastifyInstance) {
  app.get("/auth/discord", async (_request, reply) => {
    const clientId = required("DISCORD_CLIENT_ID");
    const redirectUri = required("DISCORD_REDIRECT_URI");
    const state = randomBytes(24).toString("hex");
    reply.setCookie(stateCookie, state, cookieOptions(600));
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify guilds.members.read", state, prompt: "none" });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get("/auth/discord/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string };
    if (!query.code || !query.state || query.state !== request.cookies[stateCookie]) throw new HttpError("فشل التحقق من جلسة Discord", 400);
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: required("DISCORD_CLIENT_ID"), client_secret: required("DISCORD_CLIENT_SECRET"), grant_type: "authorization_code", code: query.code, redirect_uri: required("DISCORD_REDIRECT_URI") }),
    });
    if (!tokenResponse.ok) throw new HttpError("تعذر تسجيل الدخول عبر Discord", 502);
    const token = await tokenResponse.json() as { access_token: string };
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!userResponse.ok) throw new HttpError("تعذر قراءة حساب Discord", 502);
    const discord = await userResponse.json() as { id: string; username: string; global_name?: string | null; avatar?: string | null };
    const guildId = process.env.DISCORD_GUILD_ID;
    let roles: string[] = [];
    if (guildId) {
      const memberResponse = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!memberResponse.ok) throw new HttpError("يجب أن تكون عضوًا في سيرفر Zark لاستخدام الموقع", 403);
      const member = await memberResponse.json() as { roles?: string[] };
      roles = member.roles ?? [];
    }
    const displayName = discord.global_name ?? discord.username;
    const avatarUrl = discord.avatar ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png?size=256` : undefined;
    await db.user.upsert({ where: { id: discord.id }, update: { displayName, avatarUrl }, create: { id: discord.id, displayName, avatarUrl } });
    const jwt = await new SignJWT({ displayName, avatarUrl, roles }).setProtectedHeader({ alg: "HS256" }).setSubject(discord.id).setIssuedAt().setExpirationTime("7d").sign(sessionKey());
    reply.clearCookie(stateCookie, { path: "/" });
    reply.setCookie(sessionCookie, jwt, cookieOptions(60 * 60 * 24 * 7));
    return reply.redirect("/profile.html");
  });

  app.get("/auth/logout", async (_request, reply) => {
    reply.clearCookie(sessionCookie, { path: "/" });
    return reply.redirect("/");
  });
}

export async function getWebUser(request: FastifyRequest): Promise<WebUser | null> {
  const token = request.cookies[sessionCookie];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (!payload.sub || typeof payload.displayName !== "string") return null;
    return { userId: payload.sub, displayName: payload.displayName, avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined, roles: Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === "string") : [] };
  } catch {
    return null;
  }
}

export async function requireWebUser(request: FastifyRequest): Promise<WebUser> {
  const user = await getWebUser(request);
  if (!user) throw new HttpError("يجب تسجيل الدخول عبر Discord", 401);
  return user;
}

export async function requireWebAdmin(request: FastifyRequest): Promise<WebUser> {
  const user = await requireWebUser(request);
  if (!isWebAdmin(user)) throw new HttpError("هذه الصفحة متاحة لإدارة Zark فقط", 403);
  return user;
}

export function isWebAdmin(user: WebUser) {
  const allowed = (process.env.ADMIN_ROLE_IDS ?? "").split(",").map((role) => role.trim()).filter(Boolean);
  return allowed.length > 0 && user.roles.some((role) => allowed.includes(role));
}

function sessionKey() {
  return new TextEncoder().encode(required("SESSION_SECRET"));
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`متغير البيئة ${name} غير مضبوط`);
  return value;
}

function cookieOptions(maxAge: number) {
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge };
}
