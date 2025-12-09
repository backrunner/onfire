import type { AppStore, AuthUser } from './core/types';

declare module 'elysia' {
  interface Context {
    store: AppStore;
    user?: AuthUser;
  }
}
