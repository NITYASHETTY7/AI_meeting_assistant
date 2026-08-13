CREATE TABLE `action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text,
	`title` text DEFAULT 'New chat' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Untitled Note' NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`duration` text DEFAULT '0m' NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`participants` text DEFAULT '[]' NOT NULL,
	`timeline` text DEFAULT '[]' NOT NULL,
	`ai_notes` text DEFAULT '' NOT NULL,
	`ai_summary` text DEFAULT '' NOT NULL,
	`recording_file_path` text,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text,
	`title` text DEFAULT 'Untitled Note' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcript_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` text NOT NULL,
	`time` text NOT NULL,
	`speaker` text DEFAULT 'Speaker' NOT NULL,
	`text` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
