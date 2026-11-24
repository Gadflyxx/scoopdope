import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitialMigration1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'email',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'passwordHash',
            type: 'varchar',
          },
          {
            name: 'stellarPublicKey',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'varchar',
            default: "'student'",
          },
          {
            name: 'isBanned',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    // Create courses table
    await queryRunner.createTable(
      new Table({
        name: 'courses',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'level',
            type: 'varchar',
            default: "'beginner'",
          },
          {
            name: 'durationHours',
            type: 'int',
            default: 0,
          },
          {
            name: 'isPublished',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    // Create notifications table
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
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
            type: 'varchar',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['enrollment', 'completion', 'credential_issued'],
          },
          {
            name: 'message',
            type: 'varchar',
          },
          {
            name: 'isRead',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications');
    await queryRunner.dropTable('courses');
    await queryRunner.dropTable('users');
  }
}

export class AddLessonResourcesAndNotes1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create lesson_resources table
    await queryRunner.createTable(
      new Table({
        name: 'lesson_resources',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'lesson_id',
            type: 'uuid',
          },
          {
            name: 'filename',
            type: 'varchar',
          },
          {
            name: 'storage_key',
            type: 'varchar',
          },
          {
            name: 'size_bytes',
            type: 'bigint',
          },
          {
            name: 'mime_type',
            type: 'varchar',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'lesson_resources',
      new TableForeignKey({
        columnNames: ['lesson_id'],
        referencedTableName: 'lessons',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'lesson_resources',
      new TableIndex({
        name: 'IDX_lesson_resources_lesson_id',
        columnNames: ['lesson_id'],
      })
    );

    // Create notes table
    await queryRunner.createTable(
      new Table({
        name: 'notes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'lesson_id',
            type: 'uuid',
          },
          {
            name: 'course_id',
            type: 'uuid',
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'timestamp_seconds',
            type: 'int',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'notes',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'notes',
      new TableForeignKey({
        columnNames: ['lesson_id'],
        referencedTableName: 'lessons',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'notes',
      new TableForeignKey({
        columnNames: ['course_id'],
        referencedTableName: 'courses',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'notes',
      new TableIndex({
        name: 'IDX_notes_lesson_id',
        columnNames: ['lesson_id'],
      })
    );

    await queryRunner.createIndex(
      'notes',
      new TableIndex({
        name: 'IDX_notes_user_id_lesson_id',
        columnNames: ['user_id', 'lesson_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notes');
    await queryRunner.dropTable('lesson_resources');
  }
}
