import { z } from "zod";

export const sessionUser = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	roles: z.array(z.string()),
	companyId: z.string(),
	companyName: z.string(),
});
export type SessionUser = z.infer<typeof sessionUser>;

export const switcherUser = sessionUser.extend({
	plants: z.array(z.object({ code: z.string(), name: z.string() })),
});
export type SwitcherUser = z.infer<typeof switcherUser>;

export const switchUserInput = z.object({
	userId: z.string().min(1),
});
