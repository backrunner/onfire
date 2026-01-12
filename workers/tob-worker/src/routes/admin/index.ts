import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import { tenantRoutes } from './tenants';
import { productRoutes } from './products';
import { teamRoutes } from './teams';
import { templateRoutes } from './templates';
import { userRoutes } from './users';
import { agentRoutes } from './agents';
import { customerRoutes } from './customers';
import { categoryRouteRoutes } from './category-routes';
import { productKeyRoutes } from './product-keys';

export const adminRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/admin' })
    .use(tenantRoutes(env))
    .use(productRoutes(env))
    .use(teamRoutes(env))
    .use(templateRoutes(env))
    .use(userRoutes(env))
    .use(agentRoutes(env))
    .use(customerRoutes(env))
    .use(categoryRouteRoutes(env))
    .use(productKeyRoutes(env));
