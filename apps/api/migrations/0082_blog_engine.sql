-- Blog Engine — Gold Standard SEO/AEO/GEO/AIO
CREATE TABLE IF NOT EXISTS `blog_posts` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `title` text NOT NULL,
  `tldr` text,
  `excerpt` text,
  `content_markdown` text NOT NULL,
  `content_html` text,
  `author_id` text REFERENCES `users`(`id`),
  `author_name` text,
  `division` text DEFAULT 'general' NOT NULL,
  `category` text,
  `primary_keyword` text,
  `secondary_keywords` text,
  `pillar_slug` text,
  `meta_title` text,
  `meta_description` text,
  `og_image` text,
  `canonical` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `featured` integer DEFAULT 0 NOT NULL,
  `reading_minutes` integer,
  `published_at` integer,
  `scheduled_at` integer,
  `date_modified` integer,
  `view_count` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `blog_posts_slug_idx` ON `blog_posts` (`slug`);
CREATE INDEX IF NOT EXISTS `blog_posts_status_idx` ON `blog_posts` (`status`);
CREATE INDEX IF NOT EXISTS `blog_posts_division_idx` ON `blog_posts` (`division`);
CREATE INDEX IF NOT EXISTS `blog_posts_primary_keyword_idx` ON `blog_posts` (`primary_keyword`);
CREATE TABLE IF NOT EXISTS `blog_categories` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `division` text,
  `created_at` integer NOT NULL
);
