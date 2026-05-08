import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().min(3, 'Email is required').includes('@', { message: 'Must contain @' }),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
