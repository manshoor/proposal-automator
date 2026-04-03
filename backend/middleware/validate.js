import { ValidationError } from '../lib/errors.js';

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new ValidationError('Validation failed', details);
    }
    // Use parsed/transformed data (strips unknown fields, applies defaults)
    req[source] = result.data;
    next();
  };
}
