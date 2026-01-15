import { createRouter } from '../../core/router';
import { tenantRoutes } from './tenants';
import { productRoutes } from './products';
import { teamRoutes } from './teams';
import { templateRoutes } from './templates';
import { userRoutes } from './users';
import { agentRoutes } from './agents';
import { customerRoutes } from './customers';
import { categoryRouteRoutes } from './category-routes';
import { productKeyRoutes } from './product-keys';
import { emailConfigRoutes } from './email-config';
import { notificationChannelRoutes } from './notification-channels';

export const adminRoutes = () => {
  const router = createRouter();

  router.route('/admin', tenantRoutes());
  router.route('/admin', productRoutes());
  router.route('/admin', teamRoutes());
  router.route('/admin', templateRoutes());
  router.route('/admin', userRoutes());
  router.route('/admin', agentRoutes());
  router.route('/admin', customerRoutes());
  router.route('/admin', categoryRouteRoutes());
  router.route('/admin', productKeyRoutes());
  router.route('/admin', emailConfigRoutes());
  router.route('/admin', notificationChannelRoutes());

  return router;
};
