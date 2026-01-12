/**
 * Route Registry
 * Central place to register all routes for the TOB Worker
 */
import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../core/types';
import { systemRoutes } from './system';
import { authRoutes } from './auth';
import { ticketRoutes } from './tickets';
import { dashboardRoutes } from './dashboard';
import { metaRoutes } from './meta';
import { adminRoutes } from './admin';
import { aiRoutes } from './ai';
import { knowledgeRoutes } from './knowledge';
import { searchRoutes } from './search';

export const createAllRoutes = (env: Bindings, auth: any) =>
  new Elysia<string, WorkerSingleton>()
    .use(systemRoutes(env))
    .use(authRoutes(env, auth))
    .use(ticketRoutes(env))
    .use(dashboardRoutes(env))
    .use(metaRoutes(env))
    .use(adminRoutes(env))
    .use(aiRoutes(env))
    .use(knowledgeRoutes(env))
    .use(searchRoutes(env));
