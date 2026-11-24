import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddReminderSends1770000000001 implements MigrationInterface {
  name = 'AddReminderSends1770000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'reminder_sends',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'courseId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'sentAt',
            type: 'timestamp with time zone',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'reminder_sends',
      new TableIndex({
        name: 'IDX_reminder_sends_user_course_sent_at',
        columnNames: ['userId', 'courseId', 'sentAt'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'reminder_sends',
      new TableIndex({
        name: 'IDX_reminder_sends_user_course',
        columnNames: ['userId', 'courseId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'reminder_sends',
      'IDX_reminder_sends_user_course',
    );
    await queryRunner.dropIndex(
      'reminder_sends',
      'IDX_reminder_sends_user_course_sent_at',
    );
    await queryRunner.dropTable('reminder_sends');
  }
}