import { z } from "zod";

export const jobSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().max(120).nullable().optional(),
  locationType: z.enum(["REMOTE", "HYBRID", "ON_SITE"]).optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "COMMISSION_ONLY"]).optional(),
  category: z
    .enum(["SETTER", "APPOINTMENT_SETTER", "SDR", "BDR", "CLOSER", "ACCOUNT_EXECUTIVE", "SALES_REPRESENTATIVE", "SALES_MANAGER"])
    .optional(),
  compensation: z.string().trim().max(120).nullable().optional(),
  baseSalary: z.string().trim().max(120).nullable().optional(),
  commission: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().min(1).max(10000),
  requirements: z.string().trim().max(10000).nullable().optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
