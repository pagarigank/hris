import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

const router = Router();

router.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Philippine HRIS API',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
  }
}));

export default router;
