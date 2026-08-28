import { Router } from 'express';
import products from './products.js';
import rest from './rest.js';
import documents from './documents.js';

const router = Router();
router.use(products);
router.use(rest);
router.use(documents);
export default router;
