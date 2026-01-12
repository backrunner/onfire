/**
 * Route Registry
 * Central place to register all routes for the TOC Worker
 */
import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../core/types';
import { systemRoutes } from './system';
import { authRoutes } from './auth';
import { ticketRoutes } from './tickets';
import { taskRoutes } from './tasks';

export const createAllRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .use(systemRoutes(env))
    .use(authRoutes(env))
    .use(ticketRoutes(env))
    .use(taskRoutes());
