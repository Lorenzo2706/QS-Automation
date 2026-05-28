import { z } from "zod";

export const SignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const JOB_TYPE_OPTIONS = [
  "CONTRACT",
  "TEMPORARY",
  "FULLTIME",
  "PARTTIME",
  "INTERNSHIP",
  "VOLUNTEER",
  "OTHER",
] as const;

export const SearchConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  keywords: z.string().trim().min(1, "Keywords are required").max(500),
  jobTypes: z.array(z.enum(JOB_TYPE_OPTIONS)).default([]),
  geoId: z.string().trim().min(1, "Country / geoId is required"),
  datePosted: z
    .union([z.enum(["past-day", "past-week", "past-month"]), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  sortBy: z.enum(["DD", "R"]).default("DD"),
  active: z.boolean().default(true),
});
export type SearchConfigInput = z.infer<typeof SearchConfigSchema>;

export const ThresholdSchema = z.object({
  threshold: z.coerce.number().int().min(0).max(100),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const PasswordChangeSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const COUNTRY_PRESETS = [
  { label: "Netherlands", geoId: "102890719" },
  { label: "Belgium", geoId: "100565514" },
  { label: "Germany", geoId: "101282230" },
] as const;
