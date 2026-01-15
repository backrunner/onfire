/**
 * Route Registry
 * Central place to register all routes for the TOB Worker
 */
import { createRouter } from '../core/router';
import { systemRoutes } from './system';
import { authRoutes } from './auth';
import { ticketRoutes } from './tickets';
import { dashboardRoutes } from './dashboard';
import { metaRoutes } from './meta';
import { adminRoutes } from './admin';
import { aiRoutes } from './ai';
import { knowledgeRoutes } from './knowledge';
import { searchRoutes } from './search';

export const createAllRoutes = () => {
  const router = createRouter();

  router.route('/', systemRoutes());
  router.route('/', authRoutes());
  router.route('/', ticketRoutes());
  router.route('/', dashboardRoutes());
  router.route('/', metaRoutes());
  router.route('/', adminRoutes());
  router.route('/', aiRoutes());
  router.route('/', knowledgeRoutes());
  router.route('/', searchRoutes());

  return router;
};
