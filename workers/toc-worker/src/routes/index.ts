/**
 * Route Registry
 * Central place to register all routes for the TOC Worker
 */
import { createRouter } from '../core/router';
import { systemRoutes } from './system';
import { authRoutes } from './auth';
import { ticketRoutes } from './tickets';
import { taskRoutes } from './tasks';
import { webhookRoutes } from './webhooks';

export const createAllRoutes = () => {
  const router = createRouter();

  router.route('/', systemRoutes());
  router.route('/', authRoutes());
  router.route('/', ticketRoutes());
  router.route('/', taskRoutes());
  router.route('/', webhookRoutes());

  return router;
};
