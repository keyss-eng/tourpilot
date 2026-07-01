-- [BILLING] Plans: add per-plan limits (tours generated, tours shown) + yearly
-- price, and re-price everything in USD cents (100 = $1.00).
ALTER TABLE `plans` ADD COLUMN `max_tours_generated` integer;
--> statement-breakpoint
ALTER TABLE `plans` ADD COLUMN `max_tours_shown` integer;
--> statement-breakpoint
ALTER TABLE `plans` ADD COLUMN `price_yearly` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `plans` SET monthly_limit=1000,  max_tours_generated=25,   max_tours_shown=10000,  price=0,    price_yearly=0,     overage_per_mau=0 WHERE name='free';
--> statement-breakpoint
UPDATE `plans` SET monthly_limit=10000, max_tours_generated=100,  max_tours_shown=100000, price=1900, price_yearly=19000, overage_per_mau=1 WHERE name='starter';
--> statement-breakpoint
UPDATE `plans` SET monthly_limit=50000, max_tours_generated=500,  max_tours_shown=500000, price=4900, price_yearly=49000, overage_per_mau=1 WHERE name='growth';
--> statement-breakpoint
UPDATE `plans` SET monthly_limit=NULL,  max_tours_generated=NULL, max_tours_shown=NULL,    price=9900, price_yearly=99000, overage_per_mau=0 WHERE name='pro';
