import { createRouter } from '../../core/router';
import { aiConfigRoutes } from './config';
import { aiScreenRoutes } from './screen';
import { aiChatRoutes } from './chat';

export const aiRoutes = () => {
  const router = createRouter();

  router.route('/', aiConfigRoutes());
  router.route('/', aiScreenRoutes());
  router.route('/', aiChatRoutes());

  return router;
};
