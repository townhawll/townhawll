import { z } from "zod";

export const appDetailsSchema = z.object({
  steam_appid: z.number().int().positive().max(4_294_967_295),
  type: z.string().trim().min(1).max(80),
  name: z.string().max(1000).nullish(),
  platforms: z.unknown().optional(),
  pc_requirements: z.unknown().optional(),
  mac_requirements: z.unknown().optional(),
  linux_requirements: z.unknown().optional(),
});
export const responseSchema = z.record(z.string(), z.unknown());
export const entrySchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(false) }),
  z.object({ success: z.literal(true), data: appDetailsSchema }),
]);
export const requirementBlockSchema = z.union([
  z.object({
    minimum: z.unknown().optional(),
    recommended: z.unknown().optional(),
  }),
  z.array(z.never()).length(0),
]);
export const requirementTextSchema = z.string().max(65_536);
export const platformsSchema = z.object({
  windows: z.unknown().optional(),
  mac: z.unknown().optional(),
  linux: z.unknown().optional(),
});
export type SteamAppDetails = z.infer<typeof appDetailsSchema>;
