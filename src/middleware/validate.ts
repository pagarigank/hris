import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: messages.join('; ')
          }
        });
        return;
      }
      next(error);
    }
  };
}
