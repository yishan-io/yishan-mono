import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);
