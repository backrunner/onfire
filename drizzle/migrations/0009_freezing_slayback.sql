UPDATE `category_routes` SET `subcategory` = '' WHERE `subcategory` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `category_routes_product_category_subcategory_uq` ON `category_routes` (`product_id`,`category`,`subcategory`);
