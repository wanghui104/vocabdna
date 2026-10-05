import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';

export const studyEvents = sqliteTable('study_events', {
  userId: text('user_id').notNull(),
  eventId: text('event_id').notNull(),
  payload: text('payload').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.eventId] })]);
