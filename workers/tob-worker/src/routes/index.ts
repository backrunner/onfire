/**
 * Route Registry
 * Central place to register all routes for the TOB Worker
 */
import type { Auth } from 'better-auth';
import type { Bindings } from '../core/types';
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

export const createAllRoutes = (env: Bindings, auth: Auth) =>
  createRouter()
    .use(systemRoutes(env))
    .use(authRoutes(env, auth))
    .use(ticketRoutes(env))
    .use(dashboardRoutes(env))
    .use(metaRoutes(env))
    .use(adminRoutes(env))
    .use(aiRoutes(env))
    .use(knowledgeRoutes(env))
    .use(searchRoutes(env))
;
