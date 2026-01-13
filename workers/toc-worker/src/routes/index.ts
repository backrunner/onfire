/**
 * Route Registry
 * Central place to register all routes for the TOC Worker
 */
import type { Bindings } from '../core/types';
import { createRouter } from '../core/router';
import { systemRoutes } from './system';
import { authRoutes } from './auth';
import { ticketRoutes } from './tickets';
import { taskRoutes } from './tasks';

export const createAllRoutes = (env: Bindings) =>
  createRouter()
    .use(systemRoutes(env))
    .use(authRoutes(env))
    .use(ticketRoutes(env))
    .use(taskRoutes())
;
