import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const teamRoutes = (env: Bindings) =>
  createRouter()
    .get('/teams', ({ store, user }) => handlers.listTeams(env, store, user))
    .post('/teams', ({ store, user, body }) =>
      handlers.createTeam(env, store, user, body), {
      body: t.Object({
        name: t.String(),
        allowReassign: t.Optional(t.Boolean()),
        tenantId: t.Optional(t.String())
      })
    })
    .patch('/teams/:id', ({ store, user, params, body }) =>
      handlers.updateTeam(env, store, user, params.id, body), {
      body: t.Object({
        name: t.Optional(t.String()),
        allowReassign: t.Optional(t.Boolean())
      })
    })
    .delete('/teams/:id', ({ store, user, params }) => handlers.deleteTeam(env, store, user, params.id))
;
