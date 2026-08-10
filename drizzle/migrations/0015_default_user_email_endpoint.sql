INSERT INTO `notification_endpoints` (
	`id`,
	`user_id`,
	`channel_type`,
	`name`,
	`enabled`,
	`config`,
	`created_at`,
	`updated_at`
)
SELECT
	'default-email-' || `users`.`id`,
	`users`.`id`,
	'email',
	'Account email',
	1,
	json_object('email', `users`.`email`),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `users`
WHERE NOT EXISTS (
	SELECT 1
	FROM `notification_endpoints`
	WHERE `notification_endpoints`.`user_id` = `users`.`id`
		AND `notification_endpoints`.`channel_type` = 'email'
);
