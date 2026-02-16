import { body, param, query, validationResult } from 'express-validator';

// Validation error handler
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Auth validators
const registerValidator = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).trim(),
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  validate
];

const loginValidator = [
  body('email').optional().isEmail().normalizeEmail(),
  body('username').optional().trim().notEmpty(),
  body('password').notEmpty(),
  validate
];

// List validators
const createListValidator = [
  body('name').trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  validate
];

// Product validators
const searchProductValidator = [
  query('q').trim().isLength({ min: 1, max: 200 }),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validate
];

const barcodeValidator = [
  param('barcode').isLength({ min: 8, max: 13 }).isNumeric(),
  validate
];

// Family validators
const kidRequestValidator = [
  body('item_name').trim().isLength({ min: 1, max: 200 }),
  body('quantity').optional().isInt({ min: 1, max: 999 }).toInt(),
  validate
];

export {
  validate,
  registerValidator,
  loginValidator,
  createListValidator,
  searchProductValidator,
  barcodeValidator,
  kidRequestValidator
};
